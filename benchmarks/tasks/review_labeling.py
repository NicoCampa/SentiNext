from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass
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


_ALLOWED_SUBCATEGORIES: set[str] = {
    # gameplay
    "gameplay/mechanics",
    "gameplay/controls",
    "gameplay/balance",
    "gameplay/difficulty",
    "gameplay/progression",
    "gameplay/ai",
    # technical
    "technical/performance",
    "technical/bugs",
    "technical/stability_crashes",
    "technical/compatibility",
    "technical/networking",
    "technical/installation",
    "technical/save_data",
    # content_design
    "content_design/amount_variety",
    "content_design/level_design",
    "content_design/quests_modes",
    "content_design/narrative_characters",
    "content_design/replayability",
    "content_design/pacing",
    "content_design/customization",
    # ui_ux_accessibility
    "ui_ux_accessibility/menus_hud",
    "ui_ux_accessibility/readability",
    "ui_ux_accessibility/quality_of_life",
    "ui_ux_accessibility/controller_support",
    "ui_ux_accessibility/accessibility_options",
    # onboarding
    "onboarding/tutorial",
    "onboarding/learning_curve",
    "onboarding/clarity",
    "onboarding/tooltips",
    # presentation
    "presentation/visuals_art_style",
    "presentation/animation",
    "presentation/audio_music",
    "presentation/voice_acting",
    "presentation/atmosphere",
    "presentation/localization",
    # online_community
    "online_community/multiplayer_experience",
    "online_community/matchmaking",
    "online_community/social_features",
    "online_community/toxicity_moderation",
    "online_community/mods_ugc",
    "online_community/cheating_anti_cheat",
    # developer_updates
    "developer_updates/patch_quality",
    "developer_updates/update_frequency",
    "developer_updates/roadmap_events",
    "developer_updates/communication",
    "developer_updates/customer_support",
    "developer_updates/response_time",
    # monetization_value
    "monetization_value/pricing",
    "monetization_value/regional_pricing",
    "monetization_value/dlc",
    "monetization_value/microtransactions",
    "monetization_value/battle_pass_fomo",
    "monetization_value/pay_to_win_grind",
    "monetization_value/value_for_money",
    # other
    "other/general",
    "other/mixed",
    "other/meta",
    "other/unclear",
    "other/off_topic",
    "other/meme",
}


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


class ReviewLabelingTask:
    name = "review_labeling"
    response_mime_type = "application/json"

    expected_schema = """{
  "subcategories": ["<main>/<sub>", "..."],
  "issue_subcategories": ["<main>/<sub>", "..."],
  "request_subcategories": ["<main>/<sub>", "..."],
  "evidence": { "<main>/<sub>": ["<verbatim quote>", "..."] }
}"""

    response_json_schema: dict | None = {
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
        "- subcategories: 1-6 unique items; subcategories[0] is primary\n"
        "- issue_subcategories/request_subcategories are subsets of subcategories\n"
        "- evidence keys must match subcategories\n"
        "- evidence quotes must be verbatim substrings of the review (<=160 chars)\n"
        "- JSON only, no extra keys\n"
    )

    def __init__(self, *, prompt_file: str = "review_labeling_v1.txt") -> None:
        self._template = Template(read_prompt_file(prompt_file))
        # Derive task name from prompt file (e.g., review_labeling_v2.txt -> review_labeling_v2)
        stem = prompt_file.rsplit(".", 1)[0]
        if stem != "review_labeling_v1":
            self.name = stem

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        counts = {"quick": 12, "core": 60, "full": 200}
        n = counts.get(suite, 60)
        selected = select_balanced_reviews(dataset.reviews, n=n, rng=rng)
        items: list[TaskItem] = []
        for r in selected:
            rid = str(r.get("review_id") or "")
            app_id = int(r.get("app_id") or 0)
            items.append(TaskItem(id=f"{app_id}:{rid}", payload={"review": r}))
        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        review = item.payload["review"]
        app_id = int(review.get("app_id") or 0)
        game = dataset.games.get(app_id) or {"name": "Unknown"}
        review_text = sanitize_text(str(review.get("review") or ""), max_chars=1200)

        return self._template.substitute(
            game_context=format_game_context(game),
            review_language=str(review.get("language") or "unknown"),
            reviewer_playtime=str(review.get("playtime_hours") or 0),
            reviewer_recommendation="thumbs_up" if bool(review.get("voted_up")) else "thumbs_down",
            review_text=review_text,
        )

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        review = item.payload["review"]
        review_text = _normalize_ws(str(review.get("review") or ""))
        is_english = str(review.get("language") or "english") == "english"
        errors: list[str] = []
        try:
            payload = json.loads(output_text)
        except Exception as exc:
            return ValidationResult(ok=False, errors=[f"invalid_json: {exc}"], parsed=None)

        if not isinstance(payload, dict):
            return ValidationResult(ok=False, errors=["not_object"], parsed=None)

        expected_keys = {"subcategories", "issue_subcategories", "request_subcategories", "evidence"}
        if set(payload.keys()) != expected_keys:
            errors.append(f"wrong_keys: {sorted(payload.keys())}")

        subcats = payload.get("subcategories")
        if not isinstance(subcats, list):
            errors.append("subcategories_not_list")
            subcats = []
        subcats = [str(x).strip() for x in subcats if str(x).strip()]
        if not (1 <= len(subcats) <= 6):
            errors.append("subcategories_count")
        if len(set(subcats)) != len(subcats):
            errors.append("subcategories_not_unique")

        for s in subcats:
            if s not in _ALLOWED_SUBCATEGORIES:
                errors.append(f"invalid_subcategory:{s}")

        def _list_of_strings(key: str) -> list[str]:
            v = payload.get(key)
            if not isinstance(v, list):
                errors.append(f"{key}_not_list")
                return []
            return [str(x).strip() for x in v if str(x).strip()]

        issues = _list_of_strings("issue_subcategories")
        reqs = _list_of_strings("request_subcategories")
        subcat_set = set(subcats)
        if any(x not in subcat_set for x in issues):
            errors.append("issues_not_subset")
        if any(x not in subcat_set for x in reqs):
            errors.append("requests_not_subset")

        evidence = payload.get("evidence")
        if not isinstance(evidence, dict):
            errors.append("evidence_not_object")
            evidence = {}
        ev_keys = {str(k).replace("\\", "") for k in evidence.keys()} if isinstance(evidence, dict) else set()
        if subcats and ev_keys != set(subcats):
            errors.append("evidence_keys_mismatch")

        for k in ev_keys:
            quotes = evidence.get(k)
            if not isinstance(quotes, list) or not quotes:
                errors.append(f"evidence_missing:{k}")
                continue
            if len(quotes) > 3:
                errors.append(f"evidence_too_many:{k}")
            for q in quotes:
                q_str = str(q)
                if len(q_str) > 160:
                    q_str = q_str[:160]  # truncate to match production behaviour
                if q_str and not _fuzzy_evidence_match(q_str, review_text):
                    tag = "evidence_not_in_review" if is_english else "evidence_not_in_review_nonenglish"
                    errors.append(f"{tag}:{k}")

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed=payload if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        review = item.payload["review"]
        app_id = int(review.get("app_id") or 0)
        game = dataset.games.get(app_id) or {}
        return {
            "game": {
                "app_id": app_id,
                "name": str(game.get("name") or "Unknown"),
                "type": str(game.get("type") or "game"),
                "genres": game.get("genres") or [],
                "categories": game.get("categories") or [],
                "short_description": str(game.get("short_description") or "")[:400],
            },
            "review": {
                "review_id": str(review.get("review_id") or ""),
                "language": str(review.get("language") or "unknown"),
                "voted_up": bool(review.get("voted_up")),
                "playtime_hours": review.get("playtime_hours"),
                "text": sanitize_text(str(review.get("review") or ""), max_chars=1200),
            },
        }
