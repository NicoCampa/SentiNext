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
    format_game_context,
    read_prompt_file,
    sanitize_text,
    select_balanced_reviews,
)


_SUBCATEGORY_KEYWORDS: dict[str, list[str]] = {
    "technical/performance": ["fps", "frame", "framerate", "performance", "stutter", "lag", "slow", "drops", "optimization", "freeze"],
    "technical/bugs": ["bug", "bugs", "glitch", "broken", "quest breaks", "softlock", "crash", "ctd", "stuck"],
    "gameplay/mechanics": ["combat", "gameplay", "mechanic", "movement", "loop", "gunplay", "driving", "stealth"],
    "ui_ux_accessibility/quality_of_life": ["qol", "quality of life", "menu", "ui", "hud", "settings", "hotkey", "keybind", "fov", "toggle"],
    "monetization_value/pricing": ["price", "pricing", "expensive", "cheap", "value", "worth", "dlc", "microtransaction", "battle pass"],
    "presentation/localization": ["translation", "localization", "language", "subtitles", "dub", "voice", "text is wrong", "typo"],
}

# Subcategories that are primarily about issues (problems/complaints)
_ISSUE_SUBCATEGORIES = {"technical/performance", "technical/bugs"}

# Subcategories that are primarily about requests (feature asks)
_REQUEST_SUBCATEGORIES = {"ui_ux_accessibility/quality_of_life"}

_PRIORITY_SUBCATEGORIES = list(_SUBCATEGORY_KEYWORDS.keys())


def _matches_subcategory(review_text: str, subcategory: str) -> bool:
    kws = _SUBCATEGORY_KEYWORDS.get(subcategory) or []
    t = (review_text or "").lower()
    return any(kw in t for kw in kws)


def _summary_type_for(subcategory: str) -> str:
    if subcategory in _ISSUE_SUBCATEGORIES:
        return "issue"
    if subcategory in _REQUEST_SUBCATEGORIES:
        return "request"
    return "general"


class SubcategorySummaryTask:
    name = "subcategory_summary"
    response_mime_type = "application/json"

    expected_schema = """{
  "summary": "<short summary>",
  "pros": ["<pro 1>", "..."],
  "cons": ["<con 1>", "..."]
}"""

    response_json_schema: dict | None = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "pros": {"type": "array", "items": {"type": "string"}},
            "cons": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "pros", "cons"],
    }

    constraints = (
        "- Use only the reviews provided\n"
        "- Be specific and developer-actionable\n"
        "- Avoid the word 'sentiment'; use 'recommendation rate' or 'thumbs up/down'\n"
        "- For issue summaries: pros MUST be empty, cons 3-7 items\n"
        "- For request summaries: cons MUST be empty, pros 3-7 items\n"
        "- For general summaries: pros/cons 2-5 items each\n"
        "- JSON only, no extra keys\n"
    )

    def __init__(self, *, prompt_version: str = "v1") -> None:
        self._template_general = Template(read_prompt_file(f"subcategory_summary_{prompt_version}.txt"))
        # Issues/requests prompts only exist for v1; fall back to general for other versions
        issues_file = f"subcategory_summary_issues_{prompt_version}.txt"
        requests_file = f"subcategory_summary_requests_{prompt_version}.txt"
        try:
            self._template_issues = Template(read_prompt_file(issues_file))
        except FileNotFoundError:
            self._template_issues = self._template_general
        try:
            self._template_requests = Template(read_prompt_file(requests_file))
        except FileNotFoundError:
            self._template_requests = self._template_general
        if prompt_version != "v1":
            self.name = f"subcategory_summary_{prompt_version}"

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        per_game = {"quick": (1, 10), "core": (2, 20), "full": (3, 40)}
        subcat_count, review_count = per_game.get(suite, (2, 20))

        items: list[TaskItem] = []
        for app_id in sorted(dataset.games.keys())[:3]:
            game_reviews = [r for r in dataset.reviews if int(r.get("app_id") or 0) == app_id]
            if not game_reviews:
                continue

            # Choose subcategories that have at least some matches, in priority order.
            chosen: list[str] = []
            for subcat in _PRIORITY_SUBCATEGORIES:
                if len(chosen) >= subcat_count:
                    break
                if reference_labels:
                    hits = [
                        r
                        for r in game_reviews
                        if subcat in (reference_labels.get(str(r.get("review_id") or ""), {}).get("subcategories") or [])
                    ]
                else:
                    hits = [r for r in game_reviews if _matches_subcategory(str(r.get("review") or ""), subcat)]
                if hits:
                    chosen.append(subcat)
            if not chosen:
                chosen = _PRIORITY_SUBCATEGORIES[:subcat_count]

            for subcat in chosen:
                if reference_labels:
                    hits = [
                        r
                        for r in game_reviews
                        if subcat in (reference_labels.get(str(r.get("review_id") or ""), {}).get("subcategories") or [])
                    ]
                else:
                    hits = [r for r in game_reviews if _matches_subcategory(str(r.get("review") or ""), subcat)]
                pool = hits if len(hits) >= max(3, review_count // 3) else game_reviews
                selected = select_balanced_reviews(pool, n=review_count, rng=rng)
                summary_type = _summary_type_for(subcat)
                items.append(
                    TaskItem(
                        id=f"{app_id}:{subcat}",
                        payload={
                            "app_id": app_id,
                            "subcategory": subcat,
                            "reviews": selected,
                            "summary_type": summary_type,
                        },
                    )
                )

        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        app_id = int(item.payload["app_id"])
        subcat = str(item.payload["subcategory"])
        reviews = item.payload["reviews"]
        summary_type = str(item.payload.get("summary_type") or "general")
        game = dataset.games.get(app_id) or {"name": "Unknown"}

        lines: list[str] = []
        for i, r in enumerate(reviews, 1):
            voted_up = "Positive" if bool(r.get("voted_up")) else "Negative"
            text = sanitize_text(str(r.get("review") or ""), max_chars=300).replace("\n", " ").strip()
            lines.append(f"{i}. [{voted_up}] {text}")
        reviews_text = "\n".join(lines)

        if summary_type == "issue":
            template = self._template_issues
        elif summary_type == "request":
            template = self._template_requests
        else:
            template = self._template_general

        return template.substitute(
            game_context=format_game_context(game),
            summary_context="None",
            subcategory=subcat,
            review_count=str(len(reviews)),
            reviews_text=reviews_text,
        )

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        errors: list[str] = []
        try:
            payload = json.loads(output_text)
        except Exception as exc:
            return ValidationResult(ok=False, errors=[f"invalid_json: {exc}"], parsed=None)
        if not isinstance(payload, dict):
            return ValidationResult(ok=False, errors=["not_object"], parsed=None)

        expected_keys = {"summary", "pros", "cons"}
        if set(payload.keys()) != expected_keys:
            errors.append(f"wrong_keys: {sorted(payload.keys())}")

        summary = payload.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            errors.append("summary_missing")

        summary_type = str(item.payload.get("summary_type") or "general")

        def _list(key: str) -> list[str]:
            v = payload.get(key)
            if v is None:
                return []
            if not isinstance(v, list):
                errors.append(f"{key}_not_list")
                return []
            out = [str(x).strip() for x in v if str(x).strip()]
            return out

        pros = _list("pros")
        cons = _list("cons")

        if summary_type == "issue":
            if pros:
                errors.append("issue_pros_must_be_empty")
            if len(cons) > 7:
                errors.append("cons_too_many")
        elif summary_type == "request":
            if cons:
                errors.append("request_cons_must_be_empty")
            if len(pros) > 7:
                errors.append("pros_too_many")
        else:
            if len(pros) > 5:
                errors.append("pros_too_many")
            if len(cons) > 5:
                errors.append("cons_too_many")

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed=payload if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        app_id = int(item.payload["app_id"])
        game = dataset.games.get(app_id) or {}
        reviews = item.payload.get("reviews") or []
        cleaned: list[dict[str, Any]] = []
        for r in reviews:
            cleaned.append(
                {
                    "review_id": str(r.get("review_id") or ""),
                    "voted_up": bool(r.get("voted_up")),
                    "text": sanitize_text(str(r.get("review") or ""), max_chars=300).replace("\n", " ").strip(),
                }
            )
        return {
            "game": {"app_id": app_id, "name": str(game.get("name") or "Unknown")},
            "subcategory": str(item.payload.get("subcategory") or ""),
            "summary_type": str(item.payload.get("summary_type") or "general"),
            "reviews": cleaned,
        }
