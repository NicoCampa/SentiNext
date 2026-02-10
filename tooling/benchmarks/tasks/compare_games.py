from __future__ import annotations

import json
import random
from itertools import combinations
from string import Template
from typing import Any

from .base import Dataset, TaskItem, ValidationResult, read_prompt_file, sanitize_text, select_balanced_reviews
from .subcategory_summary import _PRIORITY_SUBCATEGORIES, _SUBCATEGORY_KEYWORDS


# Main categories derived from priority subcategories
_MAIN_CATEGORIES = sorted(set(s.split("/")[0] for s in _PRIORITY_SUBCATEGORIES))


class CompareGamesOverviewTask:
    name = "compare_games_overview"
    response_mime_type = "application/json"

    expected_schema = """{
  "summary": "<2-4 sentence overview>",
  "winners": {"<aspect>": [<app_ids>]},
  "key_differences": ["<point>", "..."],
  "strengths_per_game": {<app_id>: ["<strength>", "..."]},
  "weaknesses_per_game": {<app_id>: ["<weakness>", "..."]},
  "recommendations": {<app_id>: "<who it's best for>"}
}"""

    response_json_schema: dict | None = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "winners": {
                "type": "object",
                "additionalProperties": {"type": "array", "items": {"type": "integer"}},
            },
            "key_differences": {"type": "array", "items": {"type": "string"}},
            "strengths_per_game": {
                "type": "object",
                "additionalProperties": {"type": "array", "items": {"type": "string"}},
            },
            "weaknesses_per_game": {
                "type": "object",
                "additionalProperties": {"type": "array", "items": {"type": "string"}},
            },
            "recommendations": {
                "type": "object",
                "additionalProperties": {"type": "string"},
            },
        },
        "required": ["summary", "winners", "key_differences", "strengths_per_game", "weaknesses_per_game", "recommendations"],
    }

    constraints = (
        "- Use only the game summaries and review samples provided\n"
        "- Be specific with data (use percentages, review counts)\n"
        "- Highlight competitive advantages (>10% difference is significant)\n"
        "- JSON only, no extra keys\n"
    )

    def __init__(self) -> None:
        self._template_overview = Template(read_prompt_file("compare_games_overview_v1.txt"))
        self._template_category = Template(read_prompt_file("compare_games_category_v1.txt"))
        self._template_subcategory = Template(read_prompt_file("compare_games_subcategory_v1.txt"))

    def _build_games_payload(
        self,
        *,
        app_ids: tuple[int, int],
        dataset: Dataset,
        per_game_samples: int,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
        filter_category: str | None = None,
        filter_subcategory: str | None = None,
    ) -> list[dict[str, Any]]:
        games_payload: list[dict[str, Any]] = []
        for app_id in app_ids:
            game = dataset.games.get(app_id) or {}
            name = str(game.get("name") or "Unknown")
            reviews = [r for r in dataset.reviews if int(r.get("app_id") or 0) == app_id]

            # Filter reviews if category/subcategory specified
            if filter_subcategory and reference_labels:
                reviews = [
                    r for r in reviews
                    if filter_subcategory in (reference_labels.get(str(r.get("review_id") or ""), {}).get("subcategories") or [])
                ]
            elif filter_category and reference_labels:
                reviews = [
                    r for r in reviews
                    if any(
                        s.startswith(filter_category + "/")
                        for s in (reference_labels.get(str(r.get("review_id") or ""), {}).get("subcategories") or [])
                    )
                ]
            elif filter_subcategory:
                kws = _SUBCATEGORY_KEYWORDS.get(filter_subcategory) or []
                if kws:
                    reviews = [r for r in reviews if any(kw in (str(r.get("review") or "")).lower() for kw in kws)]
            elif filter_category:
                cat_kws: list[str] = []
                for subcat, kws in _SUBCATEGORY_KEYWORDS.items():
                    if subcat.startswith(filter_category + "/"):
                        cat_kws.extend(kws)
                if cat_kws:
                    reviews = [r for r in reviews if any(kw in (str(r.get("review") or "")).lower() for kw in cat_kws)]

            total = len(reviews)
            positives = sum(1 for r in reviews if bool(r.get("voted_up")))
            rec_rate = (positives / total) if total else 0.0

            selected = select_balanced_reviews(reviews, n=per_game_samples, rng=rng)
            samples: list[dict[str, Any]] = []
            for r in selected:
                samples.append(
                    {
                        "review_id": str(r.get("review_id") or ""),
                        "voted_up": bool(r.get("voted_up")),
                        "review": sanitize_text(str(r.get("review") or ""), max_chars=220).replace("\n", " ").strip(),
                    }
                )

            games_payload.append(
                {
                    "app_id": app_id,
                    "name": name,
                    "total_reviews": total,
                    "recommendation_rate": rec_rate,
                    "samples": samples,
                }
            )
        return games_payload

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        app_ids = sorted(dataset.games.keys())[:3]
        pairs = list(combinations(app_ids, 2))
        if suite == "quick":
            pairs = pairs[:1]
        items: list[TaskItem] = []
        per_game_samples = {"quick": 10, "core": 15, "full": 25}.get(suite, 15)

        for a, b in pairs:
            # Overview comparison
            games_payload = self._build_games_payload(
                app_ids=(a, b), dataset=dataset, per_game_samples=per_game_samples,
                rng=rng, reference_labels=reference_labels,
            )
            items.append(
                TaskItem(
                    id=f"{a}_vs_{b}",
                    payload={
                        "suite": suite,
                        "app_ids": [a, b],
                        "games": games_payload,
                        "comparison_type": "overview",
                    },
                )
            )

            # Category comparison (1 per pair for quick, 2 for core/full)
            cat_count = 1 if suite == "quick" else 2
            selected_cats = _MAIN_CATEGORIES[:cat_count]
            for cat in selected_cats:
                cat_games = self._build_games_payload(
                    app_ids=(a, b), dataset=dataset, per_game_samples=per_game_samples,
                    rng=rng, reference_labels=reference_labels, filter_category=cat,
                )
                items.append(
                    TaskItem(
                        id=f"{a}_vs_{b}:cat:{cat}",
                        payload={
                            "suite": suite,
                            "app_ids": [a, b],
                            "games": cat_games,
                            "comparison_type": "category",
                            "category": cat,
                        },
                    )
                )

            # Subcategory comparison (skip for quick, 1 for core/full)
            if suite != "quick":
                subcat = _PRIORITY_SUBCATEGORIES[0] if _PRIORITY_SUBCATEGORIES else "technical/performance"
                sub_games = self._build_games_payload(
                    app_ids=(a, b), dataset=dataset, per_game_samples=per_game_samples,
                    rng=rng, reference_labels=reference_labels, filter_subcategory=subcat,
                )
                items.append(
                    TaskItem(
                        id=f"{a}_vs_{b}:sub:{subcat}",
                        payload={
                            "suite": suite,
                            "app_ids": [a, b],
                            "games": sub_games,
                            "comparison_type": "subcategory",
                            "subcategory": subcat,
                        },
                    )
                )

        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        comparison_type = str(item.payload.get("comparison_type") or "overview")
        game_summaries: list[str] = []
        review_samples: list[str] = []
        games_payload = item.payload.get("games") or []
        for g in games_payload:
            app_id = int(g.get("app_id") or 0)
            name = str(g.get("name") or "Unknown")
            total = int(g.get("total_reviews") or 0)
            rec_rate = float(g.get("recommendation_rate") or 0.0)
            game_summaries.append(
                f"Game: \"{name}\" (App ID: {app_id}, Recommendation: {rec_rate:.1%}, Reviews: {total})"
            )

            lines: list[str] = []
            for i, r in enumerate(g.get("samples") or [], 1):
                voted_up = "Positive" if bool(r.get("voted_up")) else "Negative"
                snippet = str(r.get("review") or "")
                lines.append(f"{i}. [{voted_up}] {snippet}")
            review_samples.append(f"APP {app_id} ({name}) SAMPLE REVIEWS:\n" + "\n".join(lines))

        subs = {
            "game_summaries": "\n".join(game_summaries),
            "review_samples": "\n\n".join(review_samples),
        }

        if comparison_type == "category":
            subs["category"] = str(item.payload.get("category") or "")
            return self._template_category.substitute(**subs)
        elif comparison_type == "subcategory":
            subs["subcategory"] = str(item.payload.get("subcategory") or "")
            return self._template_subcategory.substitute(**subs)
        else:
            return self._template_overview.substitute(**subs)

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        errors: list[str] = []
        try:
            payload = json.loads(output_text)
        except Exception as exc:
            return ValidationResult(ok=False, errors=[f"invalid_json: {exc}"], parsed=None)
        if not isinstance(payload, dict):
            return ValidationResult(ok=False, errors=["not_object"], parsed=None)

        expected_keys = {
            "summary",
            "winners",
            "key_differences",
            "strengths_per_game",
            "weaknesses_per_game",
            "recommendations",
        }
        if set(payload.keys()) != expected_keys:
            errors.append(f"wrong_keys: {sorted(payload.keys())}")

        if not isinstance(payload.get("summary"), str) or not str(payload.get("summary")).strip():
            errors.append("summary_missing")

        def _dict_int_keys(key: str) -> dict[int, Any]:
            v = payload.get(key)
            if not isinstance(v, dict):
                errors.append(f"{key}_not_object")
                return {}
            out: dict[int, Any] = {}
            for k, val in v.items():
                try:
                    out[int(k)] = val
                except Exception:
                    errors.append(f"{key}_bad_key")
            return out

        winners = payload.get("winners")
        if not isinstance(winners, dict):
            errors.append("winners_not_object")
        else:
            for aspect, ids in winners.items():
                if not isinstance(ids, list) or any(not isinstance(x, (int, float, str)) for x in ids):
                    errors.append("winners_bad_ids")
                    break

        kd = payload.get("key_differences")
        if not isinstance(kd, list) or not all(isinstance(x, str) and x.strip() for x in kd):
            errors.append("key_differences_bad")

        strengths = _dict_int_keys("strengths_per_game")
        weaknesses = _dict_int_keys("weaknesses_per_game")
        recs = _dict_int_keys("recommendations")
        for dkey, dval in [("strengths_per_game", strengths), ("weaknesses_per_game", weaknesses)]:
            for _k, v in dval.items():
                if not isinstance(v, list) or any(not isinstance(x, str) or not x.strip() for x in v):
                    errors.append(f"{dkey}_bad_values")
                    break

        for _k, v in recs.items():
            if not isinstance(v, str) or not v.strip():
                errors.append("recommendations_bad_values")
                break

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed=payload if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        games = item.payload.get("games") or []
        cleaned: list[dict[str, Any]] = []
        for g in games:
            cleaned.append(
                {
                    "app_id": int(g.get("app_id") or 0),
                    "name": str(g.get("name") or "Unknown"),
                    "total_reviews": int(g.get("total_reviews") or 0),
                    "recommendation_rate": float(g.get("recommendation_rate") or 0.0),
                    "samples": [
                        {
                            "review_id": str(r.get("review_id") or ""),
                            "voted_up": bool(r.get("voted_up")),
                            "text": str(r.get("review") or ""),
                        }
                        for r in (g.get("samples") or [])
                    ],
                }
            )
        result: dict[str, Any] = {"games": cleaned}
        comparison_type = str(item.payload.get("comparison_type") or "overview")
        result["comparison_type"] = comparison_type
        if comparison_type == "category":
            result["category"] = str(item.payload.get("category") or "")
        elif comparison_type == "subcategory":
            result["subcategory"] = str(item.payload.get("subcategory") or "")
        return result
