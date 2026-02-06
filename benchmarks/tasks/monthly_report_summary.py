from __future__ import annotations

import json
import random
import re
from string import Template
from typing import Any

from .base import Dataset, TaskItem, ValidationResult, format_game_context, read_prompt_file, sanitize_text
from .subcategory_summary import _PRIORITY_SUBCATEGORIES, _SUBCATEGORY_KEYWORDS  # reuse heuristics


_REQUEST_PATTERNS = [
    re.compile(r"\bplease\b", re.IGNORECASE),
    re.compile(r"\bi wish\b", re.IGNORECASE),
    re.compile(r"\bwould love\b", re.IGNORECASE),
    re.compile(r"\b(can you|could you)\b", re.IGNORECASE),
    re.compile(r"\b(add|include|implement)\b", re.IGNORECASE),
    re.compile(r"\bneeds? (a|an|to)\b", re.IGNORECASE),
]


def _matches_keywords(text: str, keywords: list[str]) -> bool:
    t = (text or "").lower()
    return any(kw in t for kw in keywords)


def _is_request(text: str) -> bool:
    return any(p.search(text or "") for p in _REQUEST_PATTERNS)


class MonthlyReportSummaryTask:
    name = "monthly_report_summary"
    response_mime_type = "application/json"

    expected_schema = """{
  "summary": "<2-3 sentence executive summary>",
  "key_points": ["<key insight 1>", "<key insight 2>", "<key insight 3>"],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}"""

    response_json_schema: dict | None = {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"}},
            "actions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "key_points", "actions"],
    }

    constraints = (
        "- Use only the data provided (counts, rates, snippets)\n"
        "- key_points: exactly 3\n"
        "- actions: exactly 3, developer-actionable\n"
        "- If month-over-month comparison provided, mention significant changes (>5% delta)\n"
        "- Never use the word 'sentiment'; say 'recommendation rate' or 'thumbs up/down'\n"
        "- JSON only, no extra keys\n"
    )

    def __init__(self, *, prompt_version: str = "v1") -> None:
        self._template = Template(read_prompt_file(f"monthly_report_summary_{prompt_version}.txt"))
        if prompt_version != "v1":
            self.name = f"monthly_report_summary_{prompt_version}"

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]:
        app_ids = sorted(dataset.games.keys())[:3]
        if suite == "quick":
            app_ids = app_ids[:1]
        items: list[TaskItem] = []
        for app_id in app_ids:
            reviews = [r for r in dataset.reviews if int(r.get("app_id") or 0) == app_id]
            total = len(reviews)
            positives = sum(1 for r in reviews if bool(r.get("voted_up")))
            rec_rate = (positives / total) if total else 0.0

            issues: list[dict[str, Any]] = []
            requests: list[dict[str, Any]] = []
            if reference_labels:
                # Aggregate from reference LLM labels
                issue_counts: dict[str, list[dict[str, Any]]] = {}
                request_counts: dict[str, list[dict[str, Any]]] = {}
                for r in reviews:
                    rid = str(r.get("review_id") or "")
                    labels = reference_labels.get(rid) or {}
                    issue_subcats = labels.get("issue_subcategories") or []
                    request_subcats = labels.get("request_subcategories") or []
                    evidence = labels.get("evidence") or {}

                    for sub in issue_subcats:
                        issue_counts.setdefault(sub, []).append({"review": r, "evidence": evidence.get(sub)})
                    for sub in request_subcats:
                        request_counts.setdefault(sub, []).append({"review": r, "evidence": evidence.get(sub)})

                def _build(items_map: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
                    out: list[dict[str, Any]] = []
                    for subcat, entries in items_map.items():
                        hit_pos = sum(1 for e in entries if bool(e["review"].get("voted_up")))
                        snippet = ""
                        for e in entries:
                            ev = e.get("evidence") or []
                            if isinstance(ev, list) and ev:
                                snippet = str(ev[0])
                                break
                        if not snippet:
                            snippet = sanitize_text(str(entries[0]["review"].get("review") or ""), max_chars=160).replace("\n", " ").strip()
                        out.append(
                            {
                                "subcategory": subcat,
                                "count": len(entries),
                                "recommendation_rate": (hit_pos / len(entries)) if entries else 0.0,
                                "snippets": [snippet],
                            }
                        )
                    out.sort(key=lambda x: int(x.get("count") or 0), reverse=True)
                    return out[:3]

                issues = _build(issue_counts)
                requests = _build(request_counts)
            else:
                # Fallback: keyword heuristics
                for subcat in _PRIORITY_SUBCATEGORIES:
                    kws = _SUBCATEGORY_KEYWORDS.get(subcat) or []
                    hits = [r for r in reviews if _matches_keywords(str(r.get("review") or ""), kws)]
                    if not hits:
                        continue
                    hit_pos = sum(1 for r in hits if bool(r.get("voted_up")))
                    issues.append(
                        {
                            "subcategory": subcat,
                            "count": len(hits),
                            "recommendation_rate": (hit_pos / len(hits)) if hits else 0.0,
                            "snippets": [sanitize_text(str(hits[0].get("review") or ""), max_chars=160).replace("\n", " ").strip()],
                        }
                    )
                    req_hits = [r for r in hits if _is_request(str(r.get("review") or ""))]
                    if req_hits:
                        req_pos = sum(1 for r in req_hits if bool(r.get("voted_up")))
                        requests.append(
                            {
                                "subcategory": subcat,
                                "count": len(req_hits),
                                "recommendation_rate": (req_pos / len(req_hits)) if req_hits else 0.0,
                                "snippets": [sanitize_text(str(req_hits[0].get("review") or ""), max_chars=160).replace("\n", " ").strip()],
                            }
                        )

            issues.sort(key=lambda x: int(x.get("count") or 0), reverse=True)
            requests.sort(key=lambda x: int(x.get("count") or 0), reverse=True)
            issues = issues[:3]
            requests = requests[:3]

            items.append(
                TaskItem(
                    id=str(app_id),
                    payload={
                        "app_id": app_id,
                        "total_reviews": total,
                        "recommendation_rate": rec_rate,
                        "top_issues": issues,
                        "top_requests": requests,
                    },
                )
            )
        return items

    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str:
        app_id = int(item.payload["app_id"])
        game = dataset.games.get(app_id) or {"name": "Unknown"}
        game_name = str(game.get("name") or "Unknown")

        total = int(item.payload.get("total_reviews") or 0)
        rec_rate = float(item.payload.get("recommendation_rate") or 0.0)
        issues = list(item.payload.get("top_issues") or [])
        requests = list(item.payload.get("top_requests") or [])

        def _format_issue_list(items: list[dict[str, Any]]) -> str:
            if not items:
                return "- (none)"
            lines: list[str] = []
            for it in items:
                sub = str(it.get("subcategory") or "unknown")
                count = int(it.get("count") or 0)
                rr = float(it.get("recommendation_rate") or 0.0)
                snippet = ""
                snips = it.get("snippets") or []
                if isinstance(snips, list) and snips:
                    snippet = f' Example: "{str(snips[0])[:120]}"'
                lines.append(f"- {sub}: {count} mentions ({rr:.1%} rec).{snippet}")
            return "\n".join(lines)

        period = str(dataset.manifest.get("created_at") or "Dataset snapshot")

        return self._template.substitute(
            game_name=game_name,
            period=period,
            total_reviews=str(total),
            recommendation_rate=f"{rec_rate:.1%}",
            comparison_text="",
            top_issues=_format_issue_list(issues),
            top_requests=_format_issue_list(requests),
        )

    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult:
        errors: list[str] = []
        try:
            payload = json.loads(output_text)
        except Exception as exc:
            return ValidationResult(ok=False, errors=[f"invalid_json: {exc}"], parsed=None)
        if not isinstance(payload, dict):
            return ValidationResult(ok=False, errors=["not_object"], parsed=None)

        expected_keys = {"summary", "key_points", "actions"}
        if set(payload.keys()) != expected_keys:
            errors.append(f"wrong_keys: {sorted(payload.keys())}")

        if not isinstance(payload.get("summary"), str) or not str(payload.get("summary")).strip():
            errors.append("summary_missing")

        for key in ("key_points", "actions"):
            v = payload.get(key)
            if not isinstance(v, list):
                errors.append(f"{key}_not_list")
                continue
            items = [str(x).strip() for x in v if str(x).strip()]
            if len(items) != 3:
                errors.append(f"{key}_must_be_3")

        ok = not errors
        return ValidationResult(ok=ok, errors=errors, parsed=payload if ok else None)

    def build_judge_input(self, *, item: TaskItem, dataset: Dataset) -> dict[str, Any]:
        app_id = int(item.payload.get("app_id") or 0)
        game = dataset.games.get(app_id) or {}
        top_issues = item.payload.get("top_issues") or []
        top_requests = item.payload.get("top_requests") or []

        def _clean(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
            out: list[dict[str, Any]] = []
            for it in items:
                out.append(
                    {
                        "subcategory": str(it.get("subcategory") or ""),
                        "count": int(it.get("count") or 0),
                        "recommendation_rate": float(it.get("recommendation_rate") or 0.0),
                        "snippets": [sanitize_text(str(s or ""), max_chars=160).replace("\n", " ").strip() for s in (it.get("snippets") or [])][:2],
                    }
                )
            return out

        return {
            "game": {"app_id": app_id, "name": str(game.get("name") or "Unknown")},
            "period": str(dataset.manifest.get("created_at") or "Dataset snapshot"),
            "total_reviews": int(item.payload.get("total_reviews") or 0),
            "recommendation_rate": float(item.payload.get("recommendation_rate") or 0.0),
            "top_issues": _clean(list(top_issues)),
            "top_requests": _clean(list(top_requests)),
        }
