from __future__ import annotations

import json
import random
import re
from pathlib import Path
from string import Template
from typing import Any

from .base import (
    Dataset,
    TaskItem,
    ValidationResult,
    format_game_context,
    read_prompt_file,
    sanitize_text,
    select_balanced_reviews,
)


# Chart example that uses safe substitution (no $ conflicts)
_CHART_EXAMPLE = (
    '```chart\n'
    '{"type":"pie","title":"Recommendation Rate","data":{"labels":["Recommended","Not Recommended"],"datasets":[{"data":[742,258]}]}}\n'
    '```'
)


def _load_scenarios() -> list[dict[str, Any]]:
    """Load scenario definitions from the JSON file."""
    path = Path(__file__).resolve().parents[1] / "prompts" / "chat_scenarios.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _select_n_scenarios(
    scenarios: list[dict[str, Any]], *, n: int, rng: random.Random
) -> list[dict[str, Any]]:
    """Select n scenarios with balanced category coverage."""
    # Group by category
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for s in scenarios:
        by_cat.setdefault(s["category"], []).append(s)

    selected: list[dict[str, Any]] = []
    cats = sorted(by_cat.keys())

    # Round-robin: pick one from each category until we have n
    idx = 0
    while len(selected) < n and cats:
        cat = cats[idx % len(cats)]
        pool = by_cat[cat]
        if pool:
            pick = pool.pop(rng.randrange(len(pool)))
            selected.append(pick)
        else:
            cats.remove(cat)
            if not cats:
                break
            idx = idx % len(cats)
            continue
        idx += 1

    return selected


def _compute_rec_split(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute recommendation split from reviews."""
    total = len(reviews)
    positives = sum(1 for r in reviews if r.get("voted_up"))
    return {
        "total_reviews": total,
        "recommended": positives,
        "not_recommended": total - positives,
        "recommendation_rate": round(positives / total, 4) if total else 0.0,
    }


def _aggregate_subcategories(
    reviews: list[dict[str, Any]],
    reference_labels: dict[str, dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Aggregate subcategory stats from reference labels."""
    if not reference_labels:
        return []

    counts: dict[str, dict[str, int]] = {}

    for review in reviews:
        rid = str(review.get("review_id") or "")
        labels = reference_labels.get(rid)
        if not labels:
            continue

        subcats = labels.get("subcategories") or []
        issue_subcats = set(labels.get("issue_subcategories") or [])
        request_subcats = set(labels.get("request_subcategories") or [])
        voted_up = bool(review.get("voted_up"))

        for subcat in subcats:
            if not isinstance(subcat, str) or not subcat:
                continue
            if subcat not in counts:
                counts[subcat] = {"count": 0, "positive": 0, "issues": 0, "requests": 0}
            counts[subcat]["count"] += 1
            if voted_up:
                counts[subcat]["positive"] += 1
            if subcat in issue_subcats:
                counts[subcat]["issues"] += 1
            if subcat in request_subcats:
                counts[subcat]["requests"] += 1

    result = []
    for subcat, data in sorted(counts.items(), key=lambda x: x[1]["count"], reverse=True):
        result.append({
            "subcategory": subcat,
            "count": data["count"],
            "recommendation_rate": round(data["positive"] / data["count"], 3) if data["count"] else 0.0,
            "issue_count": data["issues"],
            "request_count": data["requests"],
        })

    return result[:15]


def _extract_keywords(question: str) -> list[str]:
    """Extract search keywords from a question."""
    stopwords = {
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
        "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this",
        "to", "what", "when", "where", "which", "who", "why", "with", "game",
        "games", "player", "players", "review", "reviews", "steam", "you", "your",
        "do", "does", "did", "about", "think", "say", "saying", "tell", "show",
        "me", "give", "can", "could", "would", "there", "any", "most", "many",
        "much", "some", "all", "very", "also", "not", "no", "been", "have", "has",
        "was", "were", "will", "they", "them", "their", "its", "our", "we",
    }
    tokens = re.findall(r"[a-z0-9]+", question.lower())
    return [t for t in tokens if t not in stopwords and len(t) > 2]


def _select_evidence(
    reviews: list[dict[str, Any]],
    scenario: dict[str, Any],
    reference_labels: dict[str, dict[str, Any]] | None,
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Select relevant evidence reviews for a scenario."""
    recipe = scenario.get("context_recipe") or {}
    n = recipe.get("review_sample_size") or 10
    selection = recipe.get("review_selection", "balanced")

    if n <= 0:
        return []

    # Prefer English reviews for cleaner evidence
    english = [r for r in reviews if r.get("language") == "english"]

    if selection == "non_english":
        pool = [r for r in reviews if r.get("language") != "english"]
        return select_balanced_reviews(pool or reviews, n=n, rng=rng)

    pool = english if len(english) >= n else reviews

    if selection == "keyword":
        keywords = recipe.get("keywords") or _extract_keywords(scenario["question"])
        hits = [
            r for r in pool
            if any(kw in str(r.get("review") or "").lower() for kw in keywords)
        ]
        if len(hits) >= max(3, n // 2):
            return select_balanced_reviews(hits, n=n, rng=rng)
        return select_balanced_reviews(pool, n=n, rng=rng)

    if selection == "negative":
        negatives = [r for r in pool if not r.get("voted_up")]
        return select_balanced_reviews(negatives or pool, n=n, rng=rng)

    if selection == "positive":
        positives = [r for r in pool if r.get("voted_up")]
        return select_balanced_reviews(positives or pool, n=n, rng=rng)

    # "balanced" (default)
    return select_balanced_reviews(pool, n=n, rng=rng)


def _compute_time_buckets(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Split reviews into time buckets for trend analysis."""
    timestamped = [
        r for r in reviews if r.get("timestamp_created")
    ]
    if not timestamped:
        return []

    timestamped.sort(key=lambda r: int(r.get("timestamp_created") or 0))

    # Split into 4 equal time buckets
    bucket_size = max(1, len(timestamped) // 4)
    buckets = []
    for i in range(4):
        start = i * bucket_size
        end = start + bucket_size if i < 3 else len(timestamped)
        chunk = timestamped[start:end]
        if not chunk:
            continue

        total = len(chunk)
        positives = sum(1 for r in chunk if r.get("voted_up"))
        first_ts = int(chunk[0].get("timestamp_created") or 0)
        last_ts = int(chunk[-1].get("timestamp_created") or 0)

        buckets.append({
            "period": f"Period {i + 1}",
            "review_count": total,
            "recommended": positives,
            "not_recommended": total - positives,
            "recommendation_rate": round(positives / total, 3) if total else 0.0,
            "start_timestamp": first_ts,
            "end_timestamp": last_ts,
        })

    return buckets


def _compute_playtime_buckets(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Split reviews by playtime for segment analysis."""
    thresholds = [
        ("< 2 hours", 0, 120),
        ("2-20 hours", 120, 1200),
        ("20-100 hours", 1200, 6000),
        ("100+ hours", 6000, 999999),
    ]

    buckets = []
    for label, low, high in thresholds:
        chunk = [
            r for r in reviews
            if low <= int((r.get("author") or {}).get("playtime_forever") or 0) < high
        ]
        if not chunk:
            continue

        total = len(chunk)
        positives = sum(1 for r in chunk if r.get("voted_up"))
        buckets.append({
            "bucket": label,
            "review_count": total,
            "recommended": positives,
            "not_recommended": total - positives,
            "recommendation_rate": round(positives / total, 3) if total else 0.0,
        })

    return buckets


def _compute_period_comparison(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    """Split reviews into two halves for comparison."""
    timestamped = [
        r for r in reviews if r.get("timestamp_created")
    ]
    if len(timestamped) < 4:
        return {}

    timestamped.sort(key=lambda r: int(r.get("timestamp_created") or 0))
    mid = len(timestamped) // 2
    older = timestamped[:mid]
    newer = timestamped[mid:]

    def _stats(chunk: list[dict[str, Any]]) -> dict[str, Any]:
        total = len(chunk)
        pos = sum(1 for r in chunk if r.get("voted_up"))
        return {
            "review_count": total,
            "recommended": pos,
            "not_recommended": total - pos,
            "recommendation_rate": round(pos / total, 3) if total else 0.0,
        }

    return {
        "older_period": _stats(older),
        "newer_period": _stats(newer),
    }


def _format_stats_block(rec_split: dict[str, Any]) -> str:
    """Format recommendation stats for prompt inclusion."""
    lines = [
        f"Total reviews: {rec_split['total_reviews']}",
        f"Recommended (thumbs up): {rec_split['recommended']}",
        f"Not Recommended (thumbs down): {rec_split['not_recommended']}",
        f"Recommendation rate: {rec_split['recommendation_rate'] * 100:.1f}%",
    ]
    return "\n".join(lines)


def _format_subcategory_block(subcats: list[dict[str, Any]]) -> str:
    """Format subcategory insights for prompt inclusion."""
    if not subcats:
        return "No subcategory data available."

    lines = [f"Total subcategories analyzed: {len(subcats)}", ""]
    for idx, s in enumerate(subcats[:10], 1):
        rec_pct = s["recommendation_rate"] * 100
        lines.append(
            f"{idx}. {s['subcategory']}: {s['count']} mentions, "
            f"{rec_pct:.1f}% recommend, "
            f"{s['issue_count']} issues, {s['request_count']} requests"
        )
    return "\n".join(lines)


def _format_reviews_block(reviews: list[dict[str, Any]]) -> str:
    """Format evidence reviews for prompt inclusion."""
    if not reviews:
        return "No reviews available for this query."

    lines = []
    for idx, r in enumerate(reviews, 1):
        votes_up = int(r.get("votes_up") or 0)
        voted_up = r.get("voted_up")
        rec = "positive" if voted_up else "negative"
        author = r.get("author") or {}
        playtime_mins = int(author.get("playtime_forever") or 0)
        playtime_hours = playtime_mins / 60
        review_id = r.get("recommendationid") or r.get("review_id") or f"r{idx}"

        text = sanitize_text(str(r.get("review") or ""), max_chars=500).replace("\n", " ").strip()

        lines.append(
            f"[Review #{review_id}] ({votes_up} helpful votes, {rec}, {playtime_hours:.0f}h playtime)"
        )
        lines.append(f'"{text}"\n')

    return "\n".join(lines)


def _format_extras_block(extras: dict[str, Any]) -> str:
    """Format trend/segment/comparison extras for prompt inclusion."""
    parts = []

    time_buckets = extras.get("time_buckets")
    if time_buckets:
        parts.append("\n### Sentiment Trend (by time period):")
        for b in time_buckets:
            rec_pct = b["recommendation_rate"] * 100
            parts.append(
                f"{b['period']}: {rec_pct:.1f}% positive ({b['review_count']} reviews)"
            )

    playtime_buckets = extras.get("playtime_buckets")
    if playtime_buckets:
        parts.append("\n### Sentiment by Playtime:")
        for b in playtime_buckets:
            rec_pct = b["recommendation_rate"] * 100
            parts.append(
                f"{b['bucket']}: {rec_pct:.1f}% positive ({b['review_count']} reviews)"
            )

    period_comparison = extras.get("period_comparison")
    if period_comparison:
        parts.append("\n### Period Comparison:")
        older = period_comparison.get("older_period", {})
        newer = period_comparison.get("newer_period", {})
        if older:
            parts.append(
                f"Older period: {older.get('recommendation_rate', 0) * 100:.1f}% positive "
                f"({older.get('review_count', 0)} reviews)"
            )
        if newer:
            parts.append(
                f"Newer period: {newer.get('recommendation_rate', 0) * 100:.1f}% positive "
                f"({newer.get('review_count', 0)} reviews)"
            )

    return "\n".join(parts)


class ChatAnswerTask:
    """Benchmark task for evaluating chat answer synthesis quality.

    Tests how well an LLM produces helpful, faithful, well-structured answers
    to user questions about game reviews, given pre-computed analytics context.
    """

    name = "chat_answer"

    expected_schema = (
        "Free-form text answer to the user's question about game reviews. "
        "May include markdown formatting and ```chart JSON blocks when charts "
        "are requested."
    )

    constraints = (
        "- Answer must be based ONLY on the provided context data\n"
        "- Must not invent statistics, review counts, or percentages not in the context\n"
        "- If referencing reviews, use the Review IDs provided in the evidence\n"
        "- Charts (if requested) must use ```chart JSON format with Chart.js structure\n"
        "- Answer length should match question complexity\n"
        "- Use 'recommendation rate' not 'sentiment'\n"
    )

    response_mime_type: str | None = None
    response_json_schema: dict | None = None

    def __init__(self, *, prompt_version: str = "v1") -> None:
        self._template = Template(read_prompt_file(f"chat_answer_{prompt_version}.txt"))
        if prompt_version != "v1":
            self.name = f"chat_answer_{prompt_version}"
        self._prompt_version = prompt_version

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        scenarios = _load_scenarios()

        suite_counts = {"quick": 10, "core": 25, "full": len(scenarios)}
        target = suite_counts.get(suite, len(scenarios))

        if target < len(scenarios):
            scenarios = _select_n_scenarios(scenarios, n=target, rng=rng)

        items: list[TaskItem] = []
        for scenario in scenarios:
            app_id = int(scenario["app_id"])
            game = dataset.games.get(app_id)
            if not game:
                continue

            game_reviews = [
                r for r in dataset.reviews
                if int(r.get("app_id") or 0) == app_id
            ]
            if not game_reviews:
                continue

            recipe = scenario.get("context_recipe") or {}

            # Recommendation split
            rec_split = _compute_rec_split(game_reviews) if recipe.get("include_stats") else {}

            # Subcategory insights
            subcats = (
                _aggregate_subcategories(game_reviews, reference_labels)
                if recipe.get("include_subcategory_breakdown")
                else []
            )

            # Evidence reviews
            evidence = _select_evidence(game_reviews, scenario, reference_labels, rng)

            # Scenario-specific extras
            extras: dict[str, Any] = {}
            if recipe.get("include_time_buckets"):
                extras["time_buckets"] = _compute_time_buckets(game_reviews)
            if recipe.get("include_playtime_buckets"):
                extras["playtime_buckets"] = _compute_playtime_buckets(game_reviews)
            if recipe.get("include_period_comparison"):
                extras["period_comparison"] = _compute_period_comparison(game_reviews)

            items.append(TaskItem(
                id=f"{app_id}:{scenario['id']}",
                payload={
                    "app_id": app_id,
                    "scenario": scenario,
                    "game": dict(game),
                    "rec_split": rec_split,
                    "subcategory_insights": subcats,
                    "evidence_reviews": evidence,
                    "extras": extras,
                },
            ))

        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        game = item.payload["game"]
        scenario = item.payload["scenario"]
        rec_split = item.payload.get("rec_split") or {}
        subcats = item.payload.get("subcategory_insights") or []
        evidence = item.payload.get("evidence_reviews") or []
        extras = item.payload.get("extras") or {}

        # Format game metadata
        genres = game.get("genres") or []
        if isinstance(genres, list):
            genre_str = ", ".join(
                str(g.get("description", g) if isinstance(g, dict) else g)
                for g in genres[:5]
            )
        else:
            genre_str = str(genres)

        # Build stats block
        stats_text = _format_stats_block(rec_split) if rec_split else "No statistics available."

        # Build subcategory section
        subcat_text = _format_subcategory_block(subcats)
        subcategory_section = f"### Subcategory Breakdown:\n{subcat_text}" if subcats else ""

        # Append extras to stats or subcategory section
        extras_text = _format_extras_block(extras)
        if extras_text:
            subcategory_section = f"{subcategory_section}\n{extras_text}" if subcategory_section else extras_text

        # Build evidence block
        evidence_text = _format_reviews_block(evidence)

        return self._template.safe_substitute(
            game_name=str(game.get("name") or "Unknown"),
            game_genres=genre_str,
            game_description=str(game.get("short_description") or "")[:300],
            computed_stats=stats_text,
            subcategory_section=subcategory_section,
            evidence_reviews=evidence_text,
            review_count=str(len(evidence)),
            user_question=scenario["question"],
            complexity_hint=scenario.get("complexity", "simple"),
            chart_example=_CHART_EXAMPLE,
        )

    def validate(
        self, *, output_text: str, item: TaskItem, dataset: Dataset
    ) -> ValidationResult:
        errors: list[str] = []

        if not output_text or not output_text.strip():
            return ValidationResult(ok=False, errors=["empty_response"], parsed=None)

        stripped = output_text.strip()

        if len(stripped) < 50:
            errors.append("too_short")

        # Chart validation for chart-requesting scenarios
        scenario = item.payload.get("scenario") or {}
        if scenario.get("category") == "chart":
            if "```chart" not in stripped:
                errors.append("missing_chart_block")
            else:
                chart_match = re.search(
                    r"```chart\s*\n?(.*?)\n?```", stripped, re.DOTALL
                )
                if chart_match:
                    try:
                        chart = json.loads(chart_match.group(1).strip())
                        if not isinstance(chart, dict):
                            errors.append("chart_not_object")
                        elif chart.get("type") not in {"pie", "bar", "line", "doughnut"}:
                            errors.append("chart_invalid_type")
                        elif not chart.get("data", {}).get("labels"):
                            errors.append("chart_missing_labels")
                    except json.JSONDecodeError:
                        errors.append("chart_invalid_json")

        ok = not errors
        return ValidationResult(
            ok=ok,
            errors=errors,
            parsed={"answer": stripped} if ok else None,
        )

    def build_judge_input(
        self, *, item: TaskItem, dataset: Dataset
    ) -> dict[str, Any]:
        scenario = item.payload.get("scenario") or {}
        game = item.payload.get("game") or {}

        # Clean evidence for judge
        evidence = []
        for r in item.payload.get("evidence_reviews") or []:
            review_id = r.get("recommendationid") or r.get("review_id") or ""
            author = r.get("author") or {}
            playtime_mins = int(author.get("playtime_forever") or 0)
            evidence.append({
                "review_id": str(review_id),
                "voted_up": bool(r.get("voted_up")),
                "playtime_hours": round(playtime_mins / 60, 1),
                "text": sanitize_text(
                    str(r.get("review") or ""), max_chars=500
                ).replace("\n", " ").strip(),
            })

        return {
            "game": {
                "app_id": int(item.payload.get("app_id") or 0),
                "name": str(game.get("name") or "Unknown"),
            },
            "question": scenario.get("question", ""),
            "category": scenario.get("category", ""),
            "complexity": scenario.get("complexity", "simple"),
            "computed_stats": item.payload.get("rec_split") or {},
            "subcategory_insights": (item.payload.get("subcategory_insights") or [])[:10],
            "sample_reviews": evidence,
            "extras": item.payload.get("extras") or {},
        }
