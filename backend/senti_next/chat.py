"""Chat-with-insights helpers (lightweight RAG over stored labels + reviews)."""
from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from typing import Any, Dict, List, Optional, Sequence, Callable
import re
import time

from . import llm, storage
from .steam_api import fetch_app_details

logger = logging.getLogger(__name__)


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
    """Build a safe full-text query from free-form text."""
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
    user_id: str,
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
    result = storage.load_analysis_result(user_id, app_id)
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
    user_id: str,
    app_id: int,
    question: str,
    sentiment: str,
    min_helpful: int,
    max_days: Optional[int],
    playtime_bucket: str = "all",
    language: str = "all",
    max_reviews: int,
    max_snippets: int,
) -> Dict[str, Any]:
    context = build_chat_context(
        user_id=user_id,
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
    raw, model_id = llm.run_chat_completion(prompt)

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


# ============================================================================
# Game-Aware Chat Functions (Chat with Your Data)
# ============================================================================

@dataclass
class GameChatCitation:
    """Citation for a review in game-aware chat."""
    review_id: str
    app_id: int
    game_name: str
    snippet: str
    votes_up: int
    voted_up: Optional[bool]
    playtime_hours: float


def extract_search_terms(message: str) -> List[str]:
    """Extract search keywords from a user question using simple NLP.

    Uses a lightweight approach without requiring an LLM call.
    Filters out stopwords and question words to find relevant terms.
    """
    # Lowercase and tokenize
    text = message.lower()

    # Remove common question patterns
    question_patterns = [
        r"^what (do|does|did|are|is|was|were) ",
        r"^how (do|does|did|are|is|was|were|many|much) ",
        r"^why (do|does|did|are|is|was|were) ",
        r"^can you ",
        r"^could you ",
        r"^tell me ",
        r"^show me ",
        r"^find ",
        r"^search for ",
        r"^look for ",
    ]
    for pattern in question_patterns:
        text = re.sub(pattern, "", text)

    # Extract word tokens
    tokens = re.findall(r"[a-z0-9]+", text)

    # Filter out stopwords (extended list for chat context)
    stopwords = _FTS_STOPWORDS | {
        "about", "think", "say", "saying", "said", "talk", "talking",
        "mention", "mentioning", "mentioned", "feel", "feeling",
        "think", "thinking", "like", "likes", "want", "wants",
        "reviews", "players", "people", "users", "reviewers",
        "game", "games", "steam", "any", "some", "most", "many",
    }

    filtered = []
    for token in tokens:
        if token not in stopwords and len(token) > 2:
            if token not in filtered:
                filtered.append(token)

    return filtered[:10]  # Limit to 10 keywords


def _truncate_review_text(text: str, max_chars: int = 500) -> str:
    """Truncate review text for prompt inclusion."""
    if not text or len(text) <= max_chars:
        return text
    # Try to break at a sentence boundary
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    if last_period > max_chars // 2:
        return truncated[: last_period + 1]
    return truncated + "..."


def search_reviews_for_question(
    app_ids: List[int],
    question: str,
    date_filter: str = "all",
    max_per_game: int = 50,
    status_callback: Optional[Callable[[str], None]] = None,
) -> Dict[int, List[dict]]:
    """Search reviews for a question across multiple games.

    Args:
        app_ids: List of app IDs to search (max 2)
        question: User's question
        date_filter: Date filter ("30d", "90d", "365d", "all")
        max_per_game: Maximum reviews per game
        status_callback: Optional callback for status updates

    Returns:
        Dict mapping app_id to list of matching reviews
    """
    if status_callback:
        status_callback("Analyzing your question...")

    # Extract search keywords
    keywords = extract_search_terms(question)
    query = " ".join(keywords) if keywords else ""

    logger.info(f"Extracted search keywords from question: {keywords}")

    results: Dict[int, List[dict]] = {}

    for app_id in app_ids[:2]:  # Max 2 games
        if status_callback:
            # Count total reviews for this game
            total_count = storage.count_reviews(app_id)
            status_callback(f"Searching {total_count:,} reviews...")

        reviews = storage.search_reviews_with_date_filter(
            app_id=app_id,
            query=query,
            date_filter=date_filter,
            limit=max_per_game,
            order_by="votes_up",
        )
        results[app_id] = reviews
        logger.info(f"Found {len(reviews)} reviews for app {app_id}")

    total_found = sum(len(r) for r in results.values())
    if status_callback:
        status_callback(f"Found {total_found} relevant reviews")

    return results


def build_game_aware_prompt(
    message: str,
    games: List[Dict[str, Any]],
    reviews_by_game: Dict[int, List[dict]],
    recommendation_splits: Optional[Dict[int, Dict[str, Any]]] = None,
    subcategory_insights: Optional[Dict[int, List[Dict[str, Any]]]] = None,
    full_insights: Optional[Dict[int, Dict[str, Any]]] = None,
    time_period_comparisons: Optional[Dict[int, List[Dict[str, Any]]]] = None,
    language_breakdowns: Optional[Dict[int, List[Dict[str, Any]]]] = None,
    intent: Optional[Any] = None,
    sort_preference: Optional[str] = None,
    history: List[Dict[str, Any]] = None,
    language: Optional[str] = None,
) -> str:
    """Build a prompt for game-aware chat with review context.

    Uses a two-channel structure:
    - Channel A: Computed facts (SQL aggregations) - authoritative for stats/charts
    - Channel B: Evidence snippets (sample reviews) - qualitative examples only

    Args:
        message: User's current message
        games: List of game metadata dicts
        reviews_by_game: Dict mapping app_id to list of reviews
        recommendation_splits: Optional dict of SQL aggregation results per app_id
        subcategory_insights: Optional dict of subcategory insights per app_id
        full_insights: Optional dict of full insights data per app_id
        intent: Optional ChatIntent for the current query
        sort_preference: Optional sort preference for subcategories
        history: Conversation history
        language: Preferred language for responses (e.g., 'en', 'it', 'fr', 'de')

    Returns:
        Complete prompt string for the LLM
    """
    from .intent import ChatIntent

    if history is None:
        history = []

    prompt_parts = []

    # System instruction
    prompt_parts.append(
        "You are a game review analyst with access to real player reviews from Steam. "
        "Your role is to answer questions about games based on actual player feedback.\n"
    )

    # Add language instruction if specified
    if language:
        language_map = {
            'it': 'Italian',
            'fr': 'French',
            'de': 'German',
            'en': 'English'
        }
        language_name = language_map.get(language, 'English')
        prompt_parts.append(
            f"IMPORTANT: Respond in {language_name}. All your responses should be in {language_name}. "
            f"However, keep technical terms, category names, and subcategory names in English as they appear in the data.\n"
        )

    # Add game context and reviews
    for game in games:
        app_id = game["app_id"]
        reviews = reviews_by_game.get(app_id, [])
        split = recommendation_splits.get(app_id) if recommendation_splits else None
        subcats = subcategory_insights.get(app_id, []) if subcategory_insights else []
        insights = full_insights.get(app_id, {}) if full_insights else {}

        # Game metadata
        genres = game.get("genres", [])
        if isinstance(genres, list):
            genre_str = ", ".join(str(g.get("description", g) if isinstance(g, dict) else g) for g in genres[:5])
        else:
            genre_str = str(genres)

        prompt_parts.append(f"\n## Game: {game.get('name', 'Unknown')}")
        if genre_str:
            prompt_parts.append(f"Genres: {genre_str}")
        if game.get("short_description"):
            prompt_parts.append(f"Description: {game['short_description'][:200]}")

        # CHANNEL A: Computed Facts (SQL Aggregation)
        if split:
            prompt_parts.append("\n### Computed Statistics (AUTHORITATIVE - use for charts/numbers):")
            prompt_parts.append(f"Total reviews in time window: {split['total']}")
            prompt_parts.append(f"Recommended (thumbs up): {split['recommended']}")
            prompt_parts.append(f"Not Recommended (thumbs down): {split['not_recommended']}")
            if split['total'] > 0:
                rec_rate = (split['recommended'] / split['total']) * 100
                prompt_parts.append(f"Recommendation rate: {rec_rate:.1f}%")
            prompt_parts.append(f"Date filter applied: {split['date_filter']}")
            prompt_parts.append(f"Data source: {split['definition']}")
            prompt_parts.append("")

        # NEW: TREND Section - Sentiment trend over time
        if intent == ChatIntent.TREND and insights:
            sentiment_trend = insights.get("sentiment_trend") or []
            if sentiment_trend:
                prompt_parts.append("\n### Sentiment Trend (Weekly):")
                for entry in sentiment_trend[:12]:  # Show up to 12 weeks
                    week = entry.get("week", "Unknown")
                    rec_rate = entry.get("recommendation_rate", 0) * 100
                    count = entry.get("count", 0)
                    prompt_parts.append(f"{week}: {rec_rate:.1f}% positive ({count} reviews)")
                prompt_parts.append("")

        # NEW: SEGMENT Section - Sentiment by playtime bucket
        if intent == ChatIntent.SEGMENT and insights:
            playtime_breakdown = insights.get("playtime_breakdown") or []
            if playtime_breakdown:
                prompt_parts.append("\n### Sentiment by Playtime Bucket:")
                for bucket in playtime_breakdown:
                    label = bucket.get("bucket", "Unknown")
                    rec_rate = bucket.get("recommendation_rate", 0) * 100
                    count = bucket.get("count", 0)
                    issue_count = bucket.get("issue_count", 0)
                    prompt_parts.append(f"{label}: {rec_rate:.1f}% positive ({count} reviews, {issue_count} issues)")
                prompt_parts.append("")

                # Add issues by experience level if available
                prompt_parts.append("\n### Top Issues by Experience Level:")
                for bucket in playtime_breakdown:
                    label = bucket.get("bucket", "Unknown")
                    top_issues = bucket.get("top_issues") or []
                    if top_issues:
                        issues_str = ", ".join(top_issues[:5])
                        prompt_parts.append(f"{label}: {issues_str}")
                prompt_parts.append("")

        # NEW: COMPARISON Section - Time Period Comparison
        if intent == ChatIntent.COMPARISON and time_period_comparisons:
            periods = time_period_comparisons.get(app_id) or []
            if periods:
                prompt_parts.append("\n### Time Period Comparison (AUTHORITATIVE - use for charts):")
                prompt_parts.append(f"Divided into {len(periods)} equal periods:\n")
                for period in periods:
                    label = period.get("period_label", "Unknown")
                    rec = period.get("recommended", 0)
                    not_rec = period.get("not_recommended", 0)
                    total = period.get("total", 0)
                    rec_rate = period.get("recommendation_rate", 0) * 100
                    start_date = period.get("start_date", "")[:10]  # YYYY-MM-DD
                    end_date = period.get("end_date", "")[:10]

                    prompt_parts.append(
                        f"**{label}** ({start_date} to {end_date}):\n"
                        f"  - Total reviews: {total}\n"
                        f"  - Recommended: {rec} ({rec_rate:.1f}%)\n"
                        f"  - Not Recommended: {not_rec}"
                    )
                prompt_parts.append("")

        # NEW: COMPARISON Section - Early Access vs Release
        if intent == ChatIntent.COMPARISON and insights:
            comparison_data = insights.get("comparison_data") or insights.get("ea_vs_release") or {}
            if comparison_data:
                prompt_parts.append("\n### Early Access vs Release Comparison:")
                ea_data = comparison_data.get("early_access") or {}
                release_data = comparison_data.get("release") or {}

                if ea_data:
                    ea_rec = ea_data.get("recommendation_rate", 0) * 100
                    ea_count = ea_data.get("count", 0)
                    ea_top_issues = ea_data.get("top_issues") or []
                    prompt_parts.append(f"Early Access: {ea_rec:.1f}% positive ({ea_count} reviews)")
                    if ea_top_issues:
                        prompt_parts.append(f"  Top issues: {', '.join(ea_top_issues[:5])}")

                if release_data:
                    rel_rec = release_data.get("recommendation_rate", 0) * 100
                    rel_count = release_data.get("count", 0)
                    rel_top_issues = release_data.get("top_issues") or []
                    prompt_parts.append(f"Release: {rel_rec:.1f}% positive ({rel_count} reviews)")
                    if rel_top_issues:
                        prompt_parts.append(f"  Top issues: {', '.join(rel_top_issues[:5])}")
                prompt_parts.append("")

        # NEW: RISK Section - Refund risk indicators
        if intent == ChatIntent.RISK and insights:
            risk_indicators = insights.get("risk_indicators") or {}
            if risk_indicators:
                prompt_parts.append("\n### Risk Indicators:")
                refund_risk = risk_indicators.get("refund_risk", 0) * 100
                core_disappointment = risk_indicators.get("core_fan_disappointment", 0) * 100
                churn_signal = risk_indicators.get("churn_signal", 0) * 100
                prompt_parts.append(f"Refund risk: {refund_risk:.1f}% (% of negative reviews with <2h playtime)")
                prompt_parts.append(f"Core fan disappointment: {core_disappointment:.1f}% (% of negatives with 50h+ playtime)")
                prompt_parts.append(f"Churn signal: {churn_signal:.1f}% (players who recently stopped)")
                prompt_parts.append("")

            # Also show low-playtime negative reviews if available
            low_playtime_negatives = insights.get("low_playtime_negatives") or []
            if low_playtime_negatives:
                prompt_parts.append("\n### Top Issues from Quick Refund Risk Reviews (<2h):")
                for issue in low_playtime_negatives[:5]:
                    prompt_parts.append(f"- {issue.get('subcategory', 'Unknown')}: {issue.get('count', 0)} mentions")
                prompt_parts.append("")

        # NEW: FEATURE_REQUESTS Section - Most requested features
        if intent == ChatIntent.FEATURE_REQUESTS and subcats:
            # Sort by request_count
            request_sorted = sorted(subcats, key=lambda x: x.get("request_count", 0), reverse=True)
            request_sorted = [s for s in request_sorted if s.get("request_count", 0) > 0]

            if request_sorted:
                prompt_parts.append("\n### Most Requested Features (by request count):")
                for idx, subcat in enumerate(request_sorted[:10], 1):
                    name = subcat.get("subcategory", "Unknown")
                    request_count = subcat.get("request_count", 0)
                    count = subcat.get("count", 0)
                    rec_rate = subcat.get("recommendation_rate", 0) * 100
                    prompt_parts.append(
                        f"{idx}. {name}: {request_count} requests ({count} mentions total, {rec_rate:.1f}% recommend)"
                    )
                prompt_parts.append("")

        # NEW: LANGUAGE Section - Sentiment breakdown by language
        if intent == ChatIntent.LANGUAGE and language_breakdowns:
            lang_data = language_breakdowns.get(app_id, [])
            if lang_data:
                prompt_parts.append("\n### Sentiment by Language (AUTHORITATIVE - use for charts):")
                prompt_parts.append(f"Total languages analyzed: {len(lang_data)}\n")
                for entry in lang_data:
                    lang_name = entry.get("language", "unknown")
                    count = entry.get("count", 0)
                    rec = entry.get("recommended", 0)
                    not_rec = entry.get("not_recommended", 0)
                    rec_rate = entry.get("recommendation_rate", 0) * 100
                    prompt_parts.append(
                        f"**{lang_name}**: {count} reviews, {rec_rate:.1f}% recommend "
                        f"({rec} positive, {not_rec} negative)"
                    )
                prompt_parts.append("")

        # Subcategory breakdown (with smart sorting based on intent)
        if subcats and intent not in (ChatIntent.FEATURE_REQUESTS,):
            prompt_parts.append("\n### Subcategory Breakdown:")
            prompt_parts.append(f"Total subcategories analyzed: {len(subcats)}")

            # Apply smart sorting based on sort_preference
            if sort_preference == "issue_count":
                sorted_subcats = sorted(subcats, key=lambda x: x.get("issue_count", 0), reverse=True)
                prompt_parts.append("\nTop subcategories by issue count:")
            elif sort_preference == "request_count":
                sorted_subcats = sorted(subcats, key=lambda x: x.get("request_count", 0), reverse=True)
                prompt_parts.append("\nTop subcategories by request count:")
            elif sort_preference == "recommendation_rate_asc":
                sorted_subcats = sorted(subcats, key=lambda x: x.get("recommendation_rate", 1.0))
                prompt_parts.append("\nSubcategories by lowest recommendation rate:")
            elif sort_preference == "recommendation_rate_desc":
                sorted_subcats = sorted(subcats, key=lambda x: x.get("recommendation_rate", 0), reverse=True)
                prompt_parts.append("\nSubcategories by highest recommendation rate:")
            else:
                sorted_subcats = sorted(subcats, key=lambda x: x.get("count", 0), reverse=True)
                prompt_parts.append("\nTop subcategories by mention count:")

            for idx, subcat in enumerate(sorted_subcats[:10], 1):
                name = subcat.get("subcategory", "Unknown")
                count = subcat.get("count", 0)
                rec_rate = subcat.get("recommendation_rate", 0) * 100
                issue_count = subcat.get("issue_count", 0)
                request_count = subcat.get("request_count", 0)

                # Calculate issue rate
                issue_rate = (issue_count / count * 100) if count > 0 else 0

                prompt_parts.append(
                    f"{idx}. {name}: {count} mentions, "
                    f"{rec_rate:.1f}% recommend, "
                    f"{issue_count} issues ({issue_rate:.1f}% issue rate), "
                    f"{request_count} requests"
                )
            prompt_parts.append("")

        # CHANNEL B: Evidence (Sample Reviews)
        if reviews:
            prompt_parts.append(f"\n### Evidence Snippets ({len(reviews)} sample reviews):\n")
            for idx, review in enumerate(reviews[:50], 1):
                votes_up = int(review.get("votes_up") or 0)
                voted_up = review.get("voted_up")
                sentiment = "positive" if voted_up else "negative"

                # Get playtime
                author = review.get("author") or {}
                playtime_mins = int(author.get("playtime_forever") or 0)
                playtime_hours = playtime_mins / 60

                # Review text (truncated)
                review_text = _truncate_review_text(str(review.get("review") or ""), 500)
                review_id = review.get("recommendationid") or review.get("review_id") or f"r{idx}"

                prompt_parts.append(
                    f"[Review #{review_id}] ({votes_up} helpful votes, {sentiment}, {playtime_hours:.0f}h playtime)"
                )
                prompt_parts.append(f'"{review_text}"\n')
        else:
            prompt_parts.append("\n### No reviews found matching your query.\n")

    # Add conversation history (last 6 exchanges)
    if history:
        prompt_parts.append("\n## Previous Conversation:\n")
        for msg in history[-12:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")[:500]
            if role == "user":
                prompt_parts.append(f"User: {content}")
            else:
                prompt_parts.append(f"Assistant: {content}")
        prompt_parts.append("")

    # Instructions
    prompt_parts.append("\n## Instructions:")
    prompt_parts.append("1. **For charts/statistics**: Use ONLY the 'Computed Statistics' section (if provided). These are authoritative SQL aggregations over ALL reviews in the time window.")
    prompt_parts.append("2. **For qualitative insights**: Use the 'Evidence Snippets' as examples. These are representative samples, not the complete dataset.")
    prompt_parts.append("3. When quoting a review, mention the review ID (e.g., \"Review #12345 mentions...\")")
    prompt_parts.append("4. If there's insufficient data, clearly state that")
    prompt_parts.append("5. If comparing games, organize your response by game")
    prompt_parts.append("6. **Chart generation**: If the user asks for a chart/plot/graph:")
    prompt_parts.append("   - Use the exact numbers from 'Computed Statistics' or 'Subcategory Breakdown' sections")
    prompt_parts.append("   - Include a fenced code block with language 'chart' containing JSON for Chart.js")
    prompt_parts.append("   - Example:\n```chart\n{\"type\":\"pie\",\"title\":\"Recommendation Rate\",\"data\":{\"labels\":[\"Recommended\",\"Not Recommended\"],\"datasets\":[{\"data\":[742,258]}]}}\n```")
    prompt_parts.append("7. Never guess or estimate numbers - use provided statistics or state if unavailable")
    prompt_parts.append("8. **For trend questions**: Use 'Sentiment Trend' data if available, create line charts showing progression over time")
    prompt_parts.append("9. **For segment questions** (veterans vs newcomers, playtime): Use 'Sentiment by Playtime Bucket' data")
    prompt_parts.append("10. **For comparison questions** (EA vs release, before/after): Use 'Early Access vs Release Comparison' data")
    prompt_parts.append("11. **For risk questions** (refund risk, churn): Use 'Risk Indicators' data and explain what each metric means")
    prompt_parts.append("12. **For feature request questions**: Use 'Most Requested Features' sorted by request count")
    prompt_parts.append("13. **For language questions** (issues by language, regional feedback): Use 'Sentiment by Language' data to compare feedback across different player communities")

    # Current question
    prompt_parts.append(f"\n## Current Question:\n{message}")
    prompt_parts.append("\n## Your Answer:")

    return "\n".join(prompt_parts)


def answer_game_aware_chat(
    *,
    user_id: str,
    app_ids: List[int],
    message: str,
    date_filter: str = "all",
    max_reviews_per_game: int = 50,
    history: Optional[List[Dict[str, Any]]] = None,
    status_callback: Optional[Callable[[str], None]] = None,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """Answer a chat question with game review context.

    Uses intent-based routing:
    - AGGREGATION: SQL aggregation for charts/stats (accurate, all reviews)
    - EXAMPLES: Keyword search for specific review content
    - MIXED: Both SQL aggregation + example reviews
    - TREND: Time-based queries (sentiment over time)
    - SEGMENT: Playtime/experience-based queries
    - COMPARISON: Before/after comparisons
    - RISK: Refund risk, churn analysis
    - FEATURE_REQUESTS: What players want

    Args:
        user_id: User ID for accessing starred games
        app_ids: List of app IDs to include in context (max 2)
        message: User's question
        date_filter: Date filter for reviews ("30d", "90d", "365d", "all")
        max_reviews_per_game: Maximum reviews per game (default 50)
        history: Optional conversation history
        status_callback: Optional callback for status updates
        language: Preferred language for responses (e.g., 'en', 'it', 'fr', 'de')

    Returns:
        Dict with response, citations, and metadata
    """
    from .intent import (
        classify_intent,
        should_use_sql_aggregation,
        should_load_full_insights,
        detect_sort_preference,
        extract_time_comparison_params,
        ChatIntent,
    )

    if not app_ids:
        # No games selected - fall back to general chat
        return {
            "response": "",
            "citations": [],
            "games_used": [],
            "reviews_searched": 0,
            "has_game_context": False,
        }

    # Limit to 2 games
    app_ids = app_ids[:2]

    # Step 1: Classify intent and extract search term
    intent, search_term, is_entity = classify_intent(message)
    sort_preference = detect_sort_preference(message)
    time_comparison_params = None
    if intent == ChatIntent.COMPARISON:
        time_comparison_params = extract_time_comparison_params(message)
    logger.info(
        f"Classified intent: {intent.value}, search_term: {search_term}, "
        f"is_entity: {is_entity}, sort_preference: {sort_preference}, "
        f"time_comparison: {time_comparison_params} "
        f"for message: {message[:100]}"
    )

    # Load game metadata
    if status_callback:
        status_callback("Retrieving game info...")

    games = storage.load_game_metadata_for_chat(user_id, app_ids)
    if not games:
        # Try fetching from Steam API directly
        games = []
        for app_id in app_ids:
            details = fetch_app_details(app_id)
            if details:
                games.append({
                    "app_id": app_id,
                    "name": details.get("name", str(app_id)),
                    "genres": details.get("genres", []),
                    "categories": details.get("categories", []),
                    "short_description": details.get("short_description", ""),
                })

    if not games:
        return {
            "response": "I couldn't find information about the selected games.",
            "citations": [],
            "games_used": [],
            "reviews_searched": 0,
            "has_game_context": False,
        }

    # Step 2: Route based on intent
    recommendation_splits: Dict[int, Dict[str, Any]] = {}
    subcategory_insights: Dict[int, List[Dict[str, Any]]] = {}
    full_insights: Dict[int, Dict[str, Any]] = {}
    reviews_by_game: Dict[int, List[dict]] = {}
    time_period_comparisons: Dict[int, List[Dict[str, Any]]] = {}
    language_breakdowns: Dict[int, List[Dict[str, Any]]] = {}

    # Load full insights for advanced intents
    if should_load_full_insights(intent):
        if status_callback:
            status_callback("Loading analysis insights...")

        for app_id in app_ids:
            result = storage.load_analysis_result(user_id, app_id)
            if result and result.get("insights"):
                insights = result.get("insights") or {}
                full_insights[app_id] = insights
                subcat_list = insights.get("subcategory_insights") or []
                subcategory_insights[app_id] = subcat_list
                logger.info(f"App {app_id}: Loaded full insights with {len(subcat_list)} subcategories")

    # Handle time period comparisons
    if time_comparison_params:
        if status_callback:
            status_callback("Computing time period comparison...")

        for app_id in app_ids:
            periods = storage.get_time_period_comparison(
                app_id=app_id,
                days_ago_start=time_comparison_params["days_ago_start"],
                days_ago_end=time_comparison_params["days_ago_end"],
                num_periods=time_comparison_params["num_periods"],
            )
            time_period_comparisons[app_id] = periods
            logger.info(f"App {app_id}: Computed {len(periods)} time period comparisons")

    # Handle language breakdown queries
    if intent == ChatIntent.LANGUAGE:
        if status_callback:
            status_callback("Computing language breakdown...")

        for app_id in app_ids:
            lang_data = storage.get_language_breakdown(app_id, date_filter)
            language_breakdowns[app_id] = lang_data
            logger.info(f"App {app_id}: Found {len(lang_data)} languages in reviews")

    if should_use_sql_aggregation(intent):
        # AGGREGATION/MIXED/TREND/SEGMENT/COMPARISON/RISK/FEATURE_REQUESTS: Use SQL for accurate stats
        if status_callback:
            status_callback("Computing recommendation statistics...")

        for app_id in app_ids:
            # Get overall recommendation split
            split = storage.get_recommendation_split(app_id, date_filter)
            recommendation_splits[app_id] = split
            logger.info(
                f"App {app_id}: {split['recommended']} recommended, "
                f"{split['not_recommended']} not recommended (total {split['total']})"
            )

        # Sample evidence reviews (not keyword search!)
        if intent in (ChatIntent.MIXED, ChatIntent.AGGREGATION, ChatIntent.TREND,
                      ChatIntent.SEGMENT, ChatIntent.COMPARISON, ChatIntent.RISK,
                      ChatIntent.FEATURE_REQUESTS):
            if status_callback:
                status_callback("Sampling representative reviews...")

            for app_id in app_ids:
                # Get top positive and negative reviews as evidence
                positive_samples = storage.sample_reviews_by_sentiment(
                    app_id, sentiment="positive", date_filter=date_filter, limit=3
                )
                negative_samples = storage.sample_reviews_by_sentiment(
                    app_id, sentiment="negative", date_filter=date_filter, limit=3
                )
                reviews_by_game[app_id] = positive_samples + negative_samples

    if intent == ChatIntent.TOPIC_EXAMPLES:
        # TOPIC_EXAMPLES: Use LLM subcategory labels (bugs, AI, performance, etc.)
        if status_callback:
            status_callback(f"Finding reviews about {search_term}...")

        for app_id in app_ids:
            if search_term:
                topic_reviews = storage.get_reviews_by_subcategory(
                    app_id=app_id,
                    subcategory=search_term,
                    date_filter=date_filter,
                    limit=max_reviews_per_game,
                )
                reviews_by_game[app_id] = topic_reviews
                logger.info(
                    f"App {app_id}: Found {len(topic_reviews)} reviews "
                    f"with subcategory matching '{search_term}'"
                )
            else:
                # No specific term, fall back to general sampling
                reviews_by_game[app_id] = []

    elif intent == ChatIntent.ENTITY_EXAMPLES or (intent == ChatIntent.MIXED and not recommendation_splits):
        # ENTITY_EXAMPLES: Use keyword search (Sonic, Mario, specific names)
        if status_callback:
            if search_term:
                status_callback(f"Searching for reviews mentioning '{search_term}'...")
            else:
                status_callback("Searching relevant reviews...")

        # Use the search term if available, otherwise use the full message
        query = search_term if search_term else message

        for app_id in app_ids:
            entity_reviews = storage.search_reviews_with_date_filter(
                app_id=app_id,
                query=query,
                date_filter=date_filter,
                limit=max_reviews_per_game,
                order_by="votes_up",
            )
            reviews_by_game[app_id] = entity_reviews
            logger.info(
                f"App {app_id}: Found {len(entity_reviews)} reviews "
                f"matching entity '{query}'"
            )

    total_reviews = sum(len(r) for r in reviews_by_game.values())

    # Build prompt
    if status_callback:
        status_callback("Generating response...")

    prompt = build_game_aware_prompt(
        message=message,
        games=games,
        reviews_by_game=reviews_by_game,
        recommendation_splits=recommendation_splits if recommendation_splits else None,
        subcategory_insights=subcategory_insights if subcategory_insights else None,
        full_insights=full_insights if full_insights else None,
        time_period_comparisons=time_period_comparisons if time_period_comparisons else None,
        language_breakdowns=language_breakdowns if language_breakdowns else None,
        intent=intent,
        sort_preference=sort_preference,
        history=history or [],
        language=language,
    )

    # Call LLM
    response_text, model_id = llm.run_chat_completion(prompt)

    # Extract citations from the response (look for review ID mentions)
    citations = []
    review_id_pattern = re.compile(r"Review #(\d+)")
    mentioned_ids = set(review_id_pattern.findall(response_text))

    for app_id, reviews in reviews_by_game.items():
        game_name = next((g["name"] for g in games if g["app_id"] == app_id), str(app_id))
        for review in reviews:
            review_id = str(review.get("recommendationid") or review.get("review_id") or "")
            if review_id in mentioned_ids:
                author = review.get("author") or {}
                playtime_mins = int(author.get("playtime_forever") or 0)
                citations.append({
                    "review_id": review_id,
                    "app_id": app_id,
                    "game_name": game_name,
                    "snippet": _truncate_review_text(str(review.get("review") or ""), 200),
                    "votes_up": int(review.get("votes_up") or 0),
                    "voted_up": review.get("voted_up"),
                    "playtime_hours": playtime_mins / 60,
                })

    return {
        "response": response_text,
        "citations": citations,
        "games_used": [{"app_id": g["app_id"], "name": g["name"]} for g in games],
        "reviews_searched": total_reviews,
        "has_game_context": True,
        "model": model_id,
    }
