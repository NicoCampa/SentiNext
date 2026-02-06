from __future__ import annotations

import json
import random
import re
from string import Template
from typing import Any, Mapping

from .base import (
    Dataset,
    TaskItem,
    ValidationResult,
    _fuzzy_evidence_match,
    format_game_context,
    read_prompt_file,
    sanitize_text,
    select_balanced_reviews,
)
from .review_labeling import _ALLOWED_SUBCATEGORIES


BATCH_SIZE = 3


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


class ReviewLabelingBatchTask:
    """Classification task using production batch format (3 reviews per prompt)."""

    name = "review_labeling_batch"
    response_mime_type = "application/json"

    expected_schema = """{
  "<review_id>": {
    "subcategories": ["<main>/<sub>", "..."],
    "issue_subcategories": ["<main>/<sub>", "..."],
    "request_subcategories": ["<main>/<sub>", "..."],
    "evidence": { "<main>/<sub>": ["<verbatim quote>", "..."] }
  }
}"""

    # Static schema kept as None — we build per-item schemas dynamically
    # via get_response_json_schema() with actual review IDs as fixed properties.
    response_json_schema: dict | None = None

    _REVIEW_ENTRY_SCHEMA: dict = {
        "type": "object",
        "properties": {
            "subcategories": {"type": "array", "items": {"type": "string", "enum": sorted(_ALLOWED_SUBCATEGORIES)}},
            "issue_subcategories": {"type": "array", "items": {"type": "string", "enum": sorted(_ALLOWED_SUBCATEGORIES)}},
            "request_subcategories": {"type": "array", "items": {"type": "string", "enum": sorted(_ALLOWED_SUBCATEGORIES)}},
            "evidence": {
                "type": "object",
                "additionalProperties": {"type": "array", "items": {"type": "string"}},
            },
        },
        "required": ["subcategories", "issue_subcategories", "request_subcategories", "evidence"],
    }

    constraints = (
        "- Top-level keys MUST be review_id strings from input\n"
        "- Each review_id maps to an object with exactly: subcategories, issue_subcategories, request_subcategories, evidence\n"
        "- subcategories: 1-6 unique items per review; subcategories[0] is primary\n"
        "- issue_subcategories/request_subcategories are subsets of subcategories\n"
        "- evidence keys must match subcategories; quotes must be verbatim (<=160 chars)\n"
        "- JSON only, no extra keys\n"
    )

    def __init__(self, *, app_id_filter: int | None = None, prompt_file: str = "review_labeling_batch_v1.txt") -> None:
        self._template = Template(read_prompt_file(prompt_file))
        self.app_id_filter = app_id_filter
        # Derive task name from prompt file (e.g., review_labeling_batch_v2.txt -> review_labeling_batch_v2)
        stem = prompt_file.rsplit(".", 1)[0]
        if stem != "review_labeling_batch_v1":
            self.name = stem

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        # Same total review counts as single-review task
        counts = {"quick": 12, "core": 60, "full": 200}
        n = counts.get(suite, 60)
        reviews = dataset.reviews
        if self.app_id_filter:
            reviews = [r for r in reviews if int(r.get("app_id") or 0) == self.app_id_filter]
        selected = select_balanced_reviews(reviews, n=n, rng=rng)

        # Group into batches of BATCH_SIZE
        items: list[TaskItem] = []
        for i in range(0, len(selected), BATCH_SIZE):
            batch = selected[i : i + BATCH_SIZE]
            review_ids = [str(r.get("review_id") or "") for r in batch]
            batch_id = f"batch_{i // BATCH_SIZE}:" + ",".join(review_ids)
            items.append(
                TaskItem(
                    id=batch_id,
                    payload={"reviews": batch},
                )
            )
        return items

    def get_response_json_schema(self, item: TaskItem) -> dict | None:
        """Build a schema with actual review IDs as fixed properties.

        Using fixed property names instead of additionalProperties gives the
        model concrete structure to track, eliminating brace-counting errors.
        """
        reviews = item.payload["reviews"]
        review_ids = [str(r.get("review_id") or "") for r in reviews]
        return {
            "type": "object",
            "properties": {rid: self._REVIEW_ENTRY_SCHEMA for rid in review_ids},
            "required": review_ids,
        }

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        reviews = item.payload["reviews"]

        # Use game context from the first review's app_id
        app_id = int(reviews[0].get("app_id") or 0)
        game = dataset.games.get(app_id) or {"name": "Unknown"}

        # Build review blocks matching production format
        blocks: list[str] = []
        for r in reviews:
            review_id = str(r.get("review_id") or "")
            review_text = sanitize_text(str(r.get("review") or ""), max_chars=1200)
            language = str(r.get("language") or "unknown")
            playtime = r.get("playtime_hours") or 0
            recommendation = "Positive" if bool(r.get("voted_up")) else "Negative"
            blocks.append(
                f"[review_id={review_id}]\n"
                f"Language: {language}\n"
                f"Playtime_hours: {playtime}\n"
                f"Recommendation: {recommendation}\n"
                f"<<<BEGIN REVIEW>>>\n"
                f"{review_text}\n"
                f"<<<END REVIEW>>>"
            )

        return self._template.substitute(
            game_context=format_game_context(game),
            reviews_text="\n\n".join(blocks),
        )

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        reviews = item.payload["reviews"]
        expected_ids = {str(r.get("review_id") or "") for r in reviews}
        review_texts = {
            str(r.get("review_id") or ""): _normalize_ws(str(r.get("review") or ""))
            for r in reviews
        }
        review_languages = {
            str(r.get("review_id") or ""): str(r.get("language") or "english")
            for r in reviews
        }

        errors: list[str] = []
        try:
            payload = json.loads(output_text)
        except Exception as exc:
            return ValidationResult(ok=False, errors=[f"invalid_json: {exc}"], parsed=None)

        if not isinstance(payload, dict):
            return ValidationResult(ok=False, errors=["not_object"], parsed=None)

        # Check top-level keys match expected review_ids
        output_ids = set(payload.keys())
        if output_ids != expected_ids:
            missing = expected_ids - output_ids
            extra = output_ids - expected_ids
            if missing:
                errors.append(f"missing_review_ids: {sorted(missing)}")
            if extra:
                errors.append(f"extra_review_ids: {sorted(extra)}")

        # Validate each review entry
        for rid in expected_ids & output_ids:
            entry = payload[rid]
            if not isinstance(entry, dict):
                errors.append(f"{rid}:not_object")
                continue

            entry_keys = {"subcategories", "issue_subcategories", "request_subcategories", "evidence"}
            if set(entry.keys()) != entry_keys:
                errors.append(f"{rid}:wrong_keys")

            subcats = entry.get("subcategories")
            if not isinstance(subcats, list):
                errors.append(f"{rid}:subcategories_not_list")
                subcats = []
            subcats = [str(x).strip() for x in subcats if str(x).strip()]
            if not (1 <= len(subcats) <= 6):
                errors.append(f"{rid}:subcategories_count")
            if len(set(subcats)) != len(subcats):
                errors.append(f"{rid}:subcategories_not_unique")
            for s in subcats:
                if s not in _ALLOWED_SUBCATEGORIES:
                    errors.append(f"{rid}:invalid_subcategory:{s}")

            def _list_of_strings(key: str) -> list[str]:
                v = entry.get(key)
                if not isinstance(v, list):
                    errors.append(f"{rid}:{key}_not_list")
                    return []
                return [str(x).strip() for x in v if str(x).strip()]

            issues = _list_of_strings("issue_subcategories")
            reqs = _list_of_strings("request_subcategories")
            subcat_set = set(subcats)
            if any(x not in subcat_set for x in issues):
                errors.append(f"{rid}:issues_not_subset")
            if any(x not in subcat_set for x in reqs):
                errors.append(f"{rid}:requests_not_subset")

            evidence = entry.get("evidence")
            if not isinstance(evidence, dict):
                errors.append(f"{rid}:evidence_not_object")
                evidence = {}
            ev_keys = {str(k).replace("\\", "") for k in evidence.keys()} if isinstance(evidence, dict) else set()
            if subcats and ev_keys != set(subcats):
                errors.append(f"{rid}:evidence_keys_mismatch")

            review_text = review_texts.get(rid, "")
            is_english = review_languages.get(rid, "english") == "english"
            for k in ev_keys:
                quotes = evidence.get(k)
                if not isinstance(quotes, list) or not quotes:
                    errors.append(f"{rid}:evidence_missing:{k}")
                    continue
                if len(quotes) > 3:
                    errors.append(f"{rid}:evidence_too_many:{k}")
                for q in quotes:
                    q_str = str(q)
                    if len(q_str) > 160:
                        q_str = q_str[:160]  # truncate to match production behaviour
                    if q_str and not _fuzzy_evidence_match(q_str, review_text):
                        tag = "evidence_not_in_review" if is_english else "evidence_not_in_review_nonenglish"
                        errors.append(f"{rid}:{tag}:{k}")

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed=payload if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        reviews = item.payload["reviews"]
        review_inputs: list[dict[str, Any]] = []
        for r in reviews:
            app_id = int(r.get("app_id") or 0)
            game = dataset.games.get(app_id) or {}
            review_inputs.append(
                {
                    "review_id": str(r.get("review_id") or ""),
                    "game": {
                        "app_id": app_id,
                        "name": str(game.get("name") or "Unknown"),
                    },
                    "language": str(r.get("language") or "unknown"),
                    "voted_up": bool(r.get("voted_up")),
                    "playtime_hours": r.get("playtime_hours"),
                    "text": sanitize_text(str(r.get("review") or ""), max_chars=1200),
                }
            )
        return {"reviews": review_inputs, "batch_size": len(review_inputs)}
