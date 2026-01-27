"""Chat-with-insights helpers (lightweight RAG over stored labels + reviews)."""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Dict, List, Optional, Sequence
import re
import time

from . import llm, storage
from .steam_api import fetch_app_details


@dataclass
class ChatEvidence:
    review_id: str
    subcategory: str
    snippet: str
    votes_up: int
    created_at: Optional[str]
    voted_up: Optional[bool]
    review_text: str


def _normalize_text(value: str) -> str:
    lowered = value.lower().replace("_", " ").replace("/", " ")
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _has_token(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    pattern = r"\b" + re.escape(needle) + r"\b"
    return re.search(pattern, haystack) is not None


def _match_subcategories(question: str, available: Sequence[str]) -> List[str]:
    normalized = _normalize_text(question)
    matches: List[str] = []
    for key in available:
        main, sub = key.split("/", 1)
        variants = {
            _normalize_text(key),
            _normalize_text(f"{main} {sub}"),
            _normalize_text(sub),
            _normalize_text(main),
            _normalize_text(f"{sub} category"),
        }
        if any(_has_token(normalized, variant) for variant in variants if variant):
            matches.append(key)
    return matches


def _question_flags(question: str) -> tuple[bool, bool]:
    normalized = _normalize_text(question)
    wants_issue = bool(re.search(r"\b(issue|issues|bug|bugs|problem|problems|crash|crashes|broken|fix)\b", normalized))
    wants_request = bool(re.search(r"\b(request|requests|feature|features|add|wish|please|could you)\b", normalized))
    return wants_issue, wants_request


_FTS_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "game",
    "games",
    "player",
    "players",
    "review",
    "reviews",
    "steam",
    "you",
    "your",
}


def _fts_query_from_question(question: str) -> str:
    """Build a safe FTS5 query from free-form text.

    We avoid passing raw user strings into MATCH because punctuation can break the query parser.
    """
    tokens = re.findall(r"[a-z0-9]{2,}", (question or "").lower())
    if not tokens:
        return ""
    filtered: List[str] = []
    for token in tokens:
        if token in _FTS_STOPWORDS:
            continue
        if token not in filtered:
            filtered.append(token)
        if len(filtered) >= 12:
            break
    if not filtered:
        filtered = tokens[:6]
    return " OR ".join([f'"{token}"' for token in filtered if token])


def _top_subcategories_from_reviews(
    *,
    reviews: Sequence[dict],
    labels: Dict[str, Dict[str, Any]],
    available_subcats: Sequence[str],
    wants_issue: bool,
    wants_request: bool,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str,
    language: str,
    now_ts: float,
    limit: int = 5,
) -> List[str]:
    allowed = {key for key in available_subcats if isinstance(key, str)}
    counts: Dict[str, int] = {}
    for review in reviews:
        review_id = _review_id(review)
        if not review_id:
            continue
        label = labels.get(review_id)
        if not label:
            continue
        if not _passes_filters(
            review,
            sentiment=sentiment,
            min_helpful=min_helpful,
            max_days=max_days,
            playtime_bucket=playtime_bucket,
            language=language,
            now_ts=now_ts,
        ):
            continue

        payload = label.get("payload") or {}
        subcats = payload.get("subcategories") or []
        issue_subcats = set(payload.get("issue_subcategories") or [])
        request_subcats = set(payload.get("request_subcategories") or [])

        for subcat in subcats:
            if not isinstance(subcat, str) or not subcat:
                continue
            if subcat not in allowed:
                continue
            if wants_issue and not wants_request and subcat not in issue_subcats:
                continue
            if wants_request and not wants_issue and subcat not in request_subcats:
                continue
            counts[subcat] = counts.get(subcat, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    return [key for key, _ in ranked[:limit] if key]


def _review_id(review: dict) -> Optional[str]:
    value = review.get("recommendationid") or review.get("review_id")
    if value is None:
        return None
    return str(value)


def _passes_filters(
    review: dict,
    *,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str,
    language: str,
    now_ts: float,
) -> bool:
    if sentiment in {"positive", "negative"}:
        voted_up = review.get("voted_up")
        if voted_up is None:
            return False
        if sentiment == "positive" and not voted_up:
            return False
        if sentiment == "negative" and voted_up:
            return False

    if min_helpful > 0:
        votes_up = int(review.get("votes_up") or 0)
        if votes_up < min_helpful:
            return False

    if max_days is not None:
        created = review.get("timestamp_created")
        if not created:
            return False
        age_days = (now_ts - float(created)) / (60 * 60 * 24)
        if age_days > max_days:
            return False

    lang = (language or "").strip().lower()
    if lang and lang != "all":
        review_lang = str(review.get("language") or "").strip().lower()
        if not review_lang:
            return False
        if review_lang != lang:
            return False

    bucket = (playtime_bucket or "").strip().lower()
    if bucket and bucket != "all":
        author = review.get("author") or {}
        minutes = int(author.get("playtime_forever") or 0)
        if bucket in {"lt2h", "<2h"}:
            if minutes >= 120:
                return False
        elif bucket in {"2to20h", "2-20h", "2–20h"}:
            if minutes < 120 or minutes >= 1200:
                return False
        elif bucket in {"20hplus", "20h+", "20h"}:
            if minutes < 1200:
                return False

    return True


def _evidence_snippet(raw: Any) -> str:
    if raw is None:
        return ""
    text = str(raw).replace("\n", " ").replace("\r", " ").strip()
    if not text:
        return ""
    return text[:160]


def _collect_evidence(
    *,
    labels: Dict[str, Dict[str, Any]],
    reviews: Dict[str, dict],
    candidate_subcategories: Sequence[str],
    wants_issue: bool,
    wants_request: bool,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str,
    language: str,
    max_reviews: int,
    max_snippets: int,
) -> tuple[List[ChatEvidence], int]:
    now_ts = time.time()
    evidence: List[ChatEvidence] = []
    filtered_review_count = 0

    candidate_set = set(candidate_subcategories)

    review_items = list(reviews.values())[:max_reviews] if max_reviews else list(reviews.values())
    review_items.sort(key=lambda item: (int(item.get("votes_up") or 0), int(item.get("timestamp_created") or 0)), reverse=True)

    for review in review_items:
        review_id = _review_id(review)
        if not review_id:
            continue
        if review_id not in labels:
            continue
        if not _passes_filters(
            review,
            sentiment=sentiment,
            min_helpful=min_helpful,
            max_days=max_days,
            playtime_bucket=playtime_bucket,
            language=language,
            now_ts=now_ts,
        ):
            continue
        filtered_review_count += 1

        payload = labels[review_id].get("payload") or {}
        subcats = payload.get("subcategories") or []
        issue_subcats = set(payload.get("issue_subcategories") or [])
        request_subcats = set(payload.get("request_subcategories") or [])
        evidence_map = payload.get("evidence") if isinstance(payload.get("evidence"), dict) else {}

        for subcat in subcats:
            if subcat not in candidate_set:
                continue
            if wants_issue and not wants_request and subcat not in issue_subcats:
                continue
            if wants_request and not wants_issue and subcat not in request_subcats:
                continue

            if len(evidence) >= max_snippets:
                continue

            snippets = evidence_map.get(subcat) or []
            snippet_list = snippets if isinstance(snippets, list) else [snippets]
            snippet_added = False
            for item in snippet_list:
                if len(evidence) >= max_snippets:
                    break
                cleaned = _evidence_snippet(item)
                if not cleaned:
                    continue
                if any(existing.snippet == cleaned for existing in evidence):
                    continue
                evidence.append(
                    ChatEvidence(
                        review_id=review_id,
                        subcategory=subcat,
                        snippet=cleaned,
                        votes_up=int(review.get("votes_up") or 0),
                        created_at=str(review.get("timestamp_created") or "") or None,
                        voted_up=bool(review.get("voted_up")) if review.get("voted_up") is not None else None,
                        review_text=str(review.get("review") or ""),
                    )
                )
                snippet_added = True
                break

            if not snippet_added and len(evidence) < max_snippets:
                fallback = _evidence_snippet(review.get("review") or "")
                if fallback and not any(existing.snippet == fallback for existing in evidence):
                    evidence.append(
                        ChatEvidence(
                            review_id=review_id,
                            subcategory=subcat,
                            snippet=fallback,
                            votes_up=int(review.get("votes_up") or 0),
                            created_at=str(review.get("timestamp_created") or "") or None,
                            voted_up=bool(review.get("voted_up")) if review.get("voted_up") is not None else None,
                            review_text=str(review.get("review") or ""),
                        )
                    )

    return evidence, filtered_review_count


def build_chat_context(
    *,
    app_id: int,
    question: str,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str,
    language: str,
    max_reviews: int,
    max_snippets: int,
) -> Dict[str, Any]:
    result = storage.load_analysis_result(app_id)
    if not result or not result.get("insights"):
        raise ValueError("No analysis insights available for this game.")

    insights = result.get("insights") or {}
    subcategory_insights = insights.get("subcategory_insights") or []
    available_subcats = [entry.get("subcategory") for entry in subcategory_insights if entry.get("subcategory")]
    available_subcats = [key for key in available_subcats if isinstance(key, str)]

    wants_issue, wants_request = _question_flags(question)
    labels = storage.load_review_labels(app_id)

    query = _fts_query_from_question(question)
    ranked_ids = storage.search_review_ids(app_id, query, limit=max_reviews, language=language) if query else []
    if ranked_ids:
        raw_reviews = storage.load_reviews_by_ids(app_id, ranked_ids)
    else:
        raw_reviews = storage.load_reviews(app_id, limit=max_reviews)

    matched = _match_subcategories(question, available_subcats)
    if not matched:
        normalized = _normalize_text(question)
        matched_main = [
            main for main in llm._ALLOWED_MAIN_CATEGORIES if _has_token(normalized, _normalize_text(main))
        ]
        if matched_main:
            matched = [
                key for key in available_subcats if key.split("/", 1)[0] in matched_main
            ]

    if not matched:
        now_ts = time.time()
        derived = _top_subcategories_from_reviews(
            reviews=raw_reviews,
            labels=labels,
            available_subcats=available_subcats,
            wants_issue=wants_issue,
            wants_request=wants_request,
            sentiment=sentiment,
            min_helpful=min_helpful,
            max_days=max_days,
            playtime_bucket=playtime_bucket,
            language=language,
            now_ts=now_ts,
            limit=5,
        )
        if derived:
            matched = derived
        else:
            subcategory_insights = sorted(
                subcategory_insights,
                key=lambda entry: int(entry.get("count") or 0),
                reverse=True,
            )
            matched = [entry.get("subcategory") for entry in subcategory_insights[:5] if entry.get("subcategory")]

    matched = [key for key in matched if key]

    review_map: Dict[str, dict] = {}
    for review in raw_reviews:
        review_id = _review_id(review)
        if not review_id:
            continue
        review_map[review_id] = review

    evidence, filtered_review_count = _collect_evidence(
        labels=labels,
        reviews=review_map,
        candidate_subcategories=matched,
        wants_issue=wants_issue,
        wants_request=wants_request,
        sentiment=sentiment,
        min_helpful=min_helpful,
        max_days=max_days,
        playtime_bucket=playtime_bucket,
        language=language,
        max_reviews=max_reviews,
        max_snippets=max_snippets,
    )

    if not evidence and ranked_ids:
        # If keyword matching missed, fall back to the most common subcategories
        # among the retrieved reviews.
        now_ts = time.time()
        fallback = _top_subcategories_from_reviews(
            reviews=raw_reviews,
            labels=labels,
            available_subcats=available_subcats,
            wants_issue=wants_issue,
            wants_request=wants_request,
            sentiment=sentiment,
            min_helpful=min_helpful,
            max_days=max_days,
            playtime_bucket=playtime_bucket,
            language=language,
            now_ts=now_ts,
            limit=5,
        )
        fallback = [key for key in fallback if key and key not in matched]
        if fallback:
            matched = fallback
            evidence, filtered_review_count = _collect_evidence(
                labels=labels,
                reviews=review_map,
                candidate_subcategories=matched,
                wants_issue=wants_issue,
                wants_request=wants_request,
                sentiment=sentiment,
                min_helpful=min_helpful,
                max_days=max_days,
                playtime_bucket=playtime_bucket,
                language=language,
                max_reviews=max_reviews,
                max_snippets=max_snippets,
            )

    subcat_index = {entry.get("subcategory"): entry for entry in subcategory_insights if entry.get("subcategory")}
    stats = []
    for key in matched:
        entry = subcat_index.get(key, {})
        stats.append(
            {
                "subcategory": key,
                "count": int(entry.get("count") or 0),
                "recommendation_rate": float(entry.get("recommendation_rate") or 0.0),
                "issue_count": int(entry.get("issue_count") or 0),
                "request_count": int(entry.get("request_count") or 0),
            }
        )

    game_details = fetch_app_details(app_id) or {}
    game_name = game_details.get("name") or str(app_id)

    return {
        "game_name": game_name,
        "question": question.strip(),
        "matched_subcategories": matched,
        "subcategory_stats": stats,
        "evidence": evidence,
        "wants_issue": wants_issue,
        "wants_request": wants_request,
        "total_reviews": len(raw_reviews),
        "filtered_reviews": filtered_review_count,
        "sentiment": sentiment,
        "min_helpful": min_helpful,
        "max_days": max_days,
        "playtime_bucket": playtime_bucket,
        "language": language,
    }


def build_chat_prompt(context: Dict[str, Any]) -> str:
    evidence_lines = [
        {
            "review_id": item.review_id,
            "subcategory": item.subcategory,
            "snippet": item.snippet,
            "votes_up": item.votes_up,
            "created_at": item.created_at,
            "voted_up": item.voted_up,
        }
        for item in context["evidence"]
    ]
    evidence_json = json.dumps(evidence_lines, ensure_ascii=True)
    stats_json = json.dumps(context["subcategory_stats"], ensure_ascii=True)

    return (
        "You are an insights assistant. Use ONLY the data provided.\n"
        "If evidence is missing or insufficient, say so explicitly.\n"
        "Return JSON only with fields: answer (string), used_subcategories (list), citations (list of {review_id, subcategory, snippet}).\n\n"
        f"Game: {context['game_name']}\n"
        f"Question: {context['question']}\n"
        f"Filters: sentiment={context['sentiment']}, min_helpful={context['min_helpful']}, max_days={context['max_days']}, playtime_bucket={context.get('playtime_bucket')}, language={context.get('language')}\n"
        f"Matched subcategories: {context['matched_subcategories']}\n"
        f"Subcategory stats (count, recommendation_rate, issue_count, request_count): {stats_json}\n"
        f"Evidence snippets: {evidence_json}\n"
        "\n"
        "Guidelines:\n"
        "- Answer in 3-6 sentences.\n"
        "- Cite only the provided snippets.\n"
        "- If the question implies issues/requests, prioritize those stats.\n"
    )


def answer_chat(
    *,
    app_id: int,
    question: str,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str = "all",
    language: str = "all",
    max_reviews: int,
    max_snippets: int,
    llm_provider: Optional[str] = None,
    llm_model: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    ollama_host: Optional[str] = None,
) -> Dict[str, Any]:
    context = build_chat_context(
        app_id=app_id,
        question=question,
        sentiment=sentiment,
        min_helpful=min_helpful,
        max_days=max_days,
        playtime_bucket=playtime_bucket,
        language=language,
        max_reviews=max_reviews,
        max_snippets=max_snippets,
    )

    prompt = build_chat_prompt(context)
    raw, model_id = llm.run_chat_completion(
        prompt,
        provider_override=llm_provider,
        model_override=llm_model,
        openai_api_key=openai_api_key,
        ollama_host=ollama_host,
    )

    try:
        payload = llm._load_json_mapping(raw)
    except Exception:
        payload = {}

    answer = str(payload.get("answer") or "").strip()
    used_subcategories = payload.get("used_subcategories")
    if not isinstance(used_subcategories, list):
        used_subcategories = context["matched_subcategories"]
    used_subcategories = [str(item) for item in used_subcategories if item]

    citations = payload.get("citations")
    if not isinstance(citations, list):
        citations = []

    evidence_index = {(item.review_id, item.subcategory, item.snippet): item for item in context["evidence"]}
    normalized_citations = []
    for item in citations:
        if not isinstance(item, dict):
            continue
        review_id = str(item.get("review_id") or "")
        subcategory = str(item.get("subcategory") or "")
        snippet = str(item.get("snippet") or "")
        key = (review_id, subcategory, snippet)
        evidence_item = evidence_index.get(key)
        if evidence_item:
            normalized_citations.append(
                {
                    "review_id": evidence_item.review_id,
                    "subcategory": evidence_item.subcategory,
                    "snippet": evidence_item.snippet,
                    "votes_up": evidence_item.votes_up,
                    "created_at": evidence_item.created_at,
                    "voted_up": evidence_item.voted_up,
                    "review_text": evidence_item.review_text,
                }
            )

    if not answer:
        summary_bits = []
        for entry in context["subcategory_stats"]:
            summary_bits.append(
                f"{entry['subcategory']} ({entry['count']} reviews, {round(entry['recommendation_rate'] * 100)}% recommended)"
            )
        answer = (
            "Here is what I can infer from the available tagged reviews: "
            + "; ".join(summary_bits[:4])
            + "."
        )

    if not normalized_citations and context["evidence"]:
        normalized_citations = [
            {
                "review_id": item.review_id,
                "subcategory": item.subcategory,
                "snippet": item.snippet,
                "votes_up": item.votes_up,
                "created_at": item.created_at,
                "voted_up": item.voted_up,
                "review_text": item.review_text,
            }
            for item in context["evidence"]
        ]

    return {
        "answer": answer,
        "used_subcategories": used_subcategories,
        "citations": normalized_citations,
        "model": model_id,
        "review_count": context["total_reviews"],
        "filtered_review_count": context["filtered_reviews"],
    }
