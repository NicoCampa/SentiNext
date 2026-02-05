"""Review classification helpers (Google Gemini)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import contextvars
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from string import Template
from textwrap import dedent
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

import pandas as pd

import requests

from . import storage
from . import credits

logger = logging.getLogger(__name__)

# LLM Provider configuration
GEMINI_MODEL = os.getenv("SENTINEXT_GEMINI_MODEL", "gemini-flash-lite-latest")
GEMINI_MODEL_CHEAP = os.getenv("SENTINEXT_GEMINI_MODEL_CHEAP", "gemini-flash-lite-latest")

# Timeout and retry configuration
LLM_TIMEOUT_SECONDS = int(os.getenv("SENTINEXT_LLM_TIMEOUT", "30"))
LLM_MAX_RETRIES = int(os.getenv("SENTINEXT_LLM_MAX_RETRIES", "3"))
LLM_BASE_RETRY_DELAY = float(os.getenv("SENTINEXT_LLM_RETRY_DELAY", "2.0"))

# Context for logging LLM usage (propagated via contextvars)
_LLM_USAGE_CONTEXT: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar(
    "llm_usage_context",
    default={},
)


@contextmanager
def llm_usage_context(
    *,
    user_id: Optional[str] = None,
    operation: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> Any:
    """Attach context for LLM usage logging within the current task."""
    current = _LLM_USAGE_CONTEXT.get() or {}
    merged = {
        **current,
        **{k: v for k, v in {
            "user_id": user_id,
            "operation": operation,
            "app_id": app_id,
            "session_id": session_id,
        }.items() if v is not None},
    }
    token = _LLM_USAGE_CONTEXT.set(merged)
    try:
        yield
    finally:
        _LLM_USAGE_CONTEXT.reset(token)


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _record_llm_usage(
    response: Any,
    model_name: str,
    *,
    prompt_tokens: Optional[int] = None,
    response_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
) -> None:
    """Record token usage metadata if available (best-effort)."""
    try:
        usage = getattr(response, "usage_metadata", None)
        if usage is None and prompt_tokens is None and response_tokens is None and total_tokens is None:
            return

        ctx = _LLM_USAGE_CONTEXT.get() or {}
        user_id = ctx.get("user_id")
        if not user_id:
            return

        storage.log_llm_usage(
            user_id=str(user_id),
            operation=str(ctx.get("operation") or "unknown"),
            model=_model_id("google", model_name),
            prompt_tokens=prompt_tokens if prompt_tokens is not None else _safe_int(getattr(usage, "prompt_token_count", None)),
            response_tokens=response_tokens if response_tokens is not None else _safe_int(getattr(usage, "response_token_count", None)),
            total_tokens=total_tokens if total_tokens is not None else _safe_int(getattr(usage, "total_token_count", None)),
            cached_tokens=_safe_int(getattr(usage, "cached_content_token_count", None)) if usage is not None else None,
            tool_use_prompt_tokens=_safe_int(getattr(usage, "tool_use_prompt_token_count", None)) if usage is not None else None,
            thoughts_tokens=_safe_int(getattr(usage, "thoughts_token_count", None)) if usage is not None else None,
            traffic_type=str(getattr(usage, "traffic_type", None)) if usage is not None and getattr(usage, "traffic_type", None) else None,
            app_id=ctx.get("app_id"),
            session_id=ctx.get("session_id"),
        )
    except Exception as exc:
        logger.debug("Failed to record LLM usage: %s", exc)


def _billing_context() -> tuple[Optional[str], Optional[str], Optional[int], Optional[str]]:
    ctx = _LLM_USAGE_CONTEXT.get() or {}
    return (
        ctx.get("user_id"),
        ctx.get("operation"),
        ctx.get("app_id"),
        ctx.get("session_id"),
    )


def _reserve_credits_for_operation(
    operation: str,
    *,
    amount: Optional[int] = None,
    description: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
) -> Optional[dict]:
    user_id, _ctx_operation, ctx_app_id, ctx_session_id = _billing_context()
    if not user_id:
        return None

    op = operation
    cost = amount if amount is not None else credits.CREDIT_COSTS.get(op)
    if cost is None or cost <= 0:
        return None

    credits.reserve_credits_or_raise(
        user_id=str(user_id),
        amount=int(cost),
        operation=op,
        description=description,
        app_id=app_id if app_id is not None else ctx_app_id,
        session_id=session_id if session_id is not None else ctx_session_id,
    )

    return {
        "user_id": str(user_id),
        "amount": int(cost),
        "operation": op,
        "app_id": app_id if app_id is not None else ctx_app_id,
        "session_id": session_id if session_id is not None else ctx_session_id,
    }


def _refund_reserved_credits(reservation: Optional[dict], reason: str) -> None:
    if not reservation:
        return
    credits.refund_credits(
        user_id=reservation["user_id"],
        amount=reservation["amount"],
        operation=reservation["operation"],
        description=reason,
        app_id=reservation.get("app_id"),
        session_id=reservation.get("session_id"),
    )


class LLMErrorType(Enum):
    """Classification of LLM errors for retry decisions."""
    BAD_REQUEST = "bad_request"  # 400 - don't retry
    RATE_LIMITED = "rate_limited"  # 429 - retry with longer delay
    SERVER_ERROR = "server_error"  # 500-504 - retry with backoff
    TIMEOUT = "timeout"  # Request timeout - retry
    UNKNOWN = "unknown"  # Unknown error - limited retry


class LLMError(Exception):
    """Exception for LLM API errors with classification."""

    def __init__(self, message: str, error_type: LLMErrorType, status_code: Optional[int] = None, retryable: bool = True):
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code
        self.retryable = retryable


def _classify_error(status_code: Optional[int], error_message: str = "") -> Tuple[LLMErrorType, bool]:
    """Classify an error and determine if it's retryable.

    Returns:
        Tuple of (error_type, is_retryable)
    """
    if status_code == 400:
        return LLMErrorType.BAD_REQUEST, False
    elif status_code == 429:
        return LLMErrorType.RATE_LIMITED, True
    elif status_code is not None and 500 <= status_code <= 504:
        return LLMErrorType.SERVER_ERROR, True
    elif "timeout" in error_message.lower() or "timed out" in error_message.lower():
        return LLMErrorType.TIMEOUT, True
    return LLMErrorType.UNKNOWN, True


def _calculate_retry_delay(attempt: int, error_type: LLMErrorType, extracted_delay: Optional[float] = None) -> float:
    """Calculate retry delay with exponential backoff.

    Args:
        attempt: Current attempt number (1-indexed)
        error_type: Type of error encountered
        extracted_delay: Delay extracted from error message (e.g., rate limit retry-after)

    Returns:
        Delay in seconds before next retry
    """
    if extracted_delay is not None:
        return extracted_delay + 1  # Add buffer

    base_delay = LLM_BASE_RETRY_DELAY

    if error_type == LLMErrorType.RATE_LIMITED:
        # Longer base delay for rate limits
        base_delay = 20.0
    elif error_type == LLMErrorType.SERVER_ERROR:
        base_delay = 5.0

    # Exponential backoff with jitter
    delay = base_delay * (2 ** (attempt - 1))
    jitter = random.uniform(0, delay * 0.1)
    return min(delay + jitter, 60.0)  # Cap at 60 seconds
PROMPT_VERSION_V1 = "steam_review_insights_v13_subcategories_primary_json"
PROMPT_VERSION = "steam_review_insights_v14_taxonomy_v11_json"
ACTIVE_PROMPT_VERSION = PROMPT_VERSION
ACCEPTED_PROMPT_VERSIONS = {ACTIVE_PROMPT_VERSION, PROMPT_VERSION_V1}

# Batch size configuration (lower = faster individual responses, higher = fewer API calls)
# Gemini works well with 3-5 reviews per batch
BATCH_SIZE = int(os.getenv("SENTINEXT_BATCH_SIZE", "3"))

MAX_REVIEW_CHARS = 3000
MIN_REVIEW_WORDS = 2
_WORD_RE = re.compile(r"\w+", flags=re.UNICODE)


def _maybe_load_dotenv() -> None:
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return

    try:
        cwd = Path.cwd().resolve()
    except Exception:
        return

    for candidate in [cwd, *cwd.parents]:
        env_path = candidate / ".env"
        if not env_path.is_file():
            continue
        try:
            content = env_path.read_text(encoding="utf-8")
        except Exception:
            return

        for raw_line in content.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip()
            if value and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            os.environ[key] = value
        return

_PROMPT_TEMPLATE = Template(
    dedent(
        """Extract actionable developer insights from a Steam review by labeling it with the taxonomy below.

        Reply with STRICT JSON only (a single JSON object). No prose, no markdown, no code fences.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Categories: $game_categories
        Description: $game_description

        REVIEWER CONTEXT:
        Review Language: $review_language
        Playtime: $reviewer_playtime hours
        Recommendation: $reviewer_recommendation

        OUTPUT JSON SCHEMA (use these exact keys; no extras):
        {
          "subcategories": ["<main>/<sub>", "..."],
          "issue_subcategories": ["<main>/<sub>", "..."],
          "request_subcategories": ["<main>/<sub>", "..."],
          "evidence": { "<main>/<sub>": ["<verbatim quote>", "..."] }
        }

        FIELD CONSTRAINTS:
        - subcategories: 1-6 unique items
        - subcategories[0]: primary label (dominant theme)
        - issue_subcategories: subset of subcategories
        - request_subcategories: subset of subcategories
        - evidence: keys must match subcategories

        RULES:
        - Choose 1-6 unique subcategories from the taxonomy below, each formatted as "<main>/<sub>".
        - Put the primary label first: subcategories[0] MUST be the dominant theme of the review.
        - issue_subcategories: only problems/complaints (subset of subcategories).
        - request_subcategories: only explicit requests (subset of subcategories; e.g., "please add", "can you", "I wish").
        - evidence: for EVERY tag in subcategories, include 1-3 short verbatim quotes from the review (<=160 chars).
          Do not invent quotes. Use double quotes in JSON strings and escape as needed.
        - If review is vague/generic: subcategories=["other/general"], issue_subcategories=[], request_subcategories=[],
          evidence={"other/general":["short quote from review"]}.
        - JSON MUST be valid: double quotes only, no trailing commas, no comments, no code fences.
        - Fill with real values only. Do not output placeholders like "<main>/<sub>", "<verbatim quote>", or "...".

        EXAMPLES (for format only; do not copy; do not output examples):
        Example 1 (Issues only):
        {
          "subcategories": ["technical/performance", "technical/bugs"],
          "issue_subcategories": ["technical/performance", "technical/bugs"],
          "request_subcategories": [],
          "evidence": {
            "technical/performance": ["FPS drops"],
            "technical/bugs": ["Quest breaks"]
          }
        }

        Example 2 (Issue + request):
        {
          "subcategories": ["gameplay/difficulty", "ui_ux_accessibility/quality_of_life"],
          "issue_subcategories": ["gameplay/difficulty"],
          "request_subcategories": ["ui_ux_accessibility/quality_of_life"],
          "evidence": {
            "gameplay/difficulty": ["Too hard"],
            "ui_ux_accessibility/quality_of_life": ["Add FOV slider"]
          }
        }

        TAXONOMY (allowed main/sub):
        - gameplay: mechanics (combat/movement/core loop), controls (input/controller), balance, difficulty, progression, ai
        - technical: performance, bugs, stability_crashes (freezes/CTD/unstable), compatibility (deck/ultrawide/VR/HDR), networking,
          installation (launcher/DRM/account linking), save_data (Steam Cloud sync, corrupted saves, progress loss)
        - content_design: amount_variety, level_design, quests_modes, narrative_characters, replayability, pacing, customization
        - ui_ux_accessibility: menus_hud, readability, quality_of_life, controller_support, accessibility_options
        - onboarding: tutorial, learning_curve, clarity, tooltips
        - presentation: visuals_art_style, animation, audio_music, voice_acting, atmosphere, localization
        - online_community: multiplayer_experience (non-technical), matchmaking, social_features, toxicity_moderation, mods_ugc,
          cheating_anti_cheat
        - developer_updates: patch_quality, update_frequency, roadmap_events, communication, customer_support,
          response_time (ONLY explicit wait/time-to-fix is mentioned)
        - monetization_value: pricing, regional_pricing, dlc, microtransactions, battle_pass_fomo, pay_to_win_grind, value_for_money
        - other: general, mixed, meta, unclear, off_topic, meme

        REVIEW TEXT (verbatim):
        <<<BEGIN REVIEW>>>
        $review_text
        <<<END REVIEW>>>
        """
    )
)

_BATCH_PROMPT_TEMPLATE = Template(
    dedent(
        """Extract actionable developer insights from Steam reviews by labeling each review with the taxonomy below.

        Reply with STRICT JSON only (a single JSON object). No prose, no markdown, no code fences.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Categories: $game_categories
        Description: $game_description

        OUTPUT JSON SCHEMA:
        - The top-level JSON MUST be an object.
        - Each key MUST be a review_id from the input (as a string).
        - Each value MUST be an object with these exact keys (no extras):
        {
          "<review_id>": {
            "subcategories": ["<main>/<sub>", "..."],
            "issue_subcategories": ["<main>/<sub>", "..."],
            "request_subcategories": ["<main>/<sub>", "..."],
            "evidence": { "<main>/<sub>": ["<verbatim quote>", "..."] }
          }
        }

        FIELD CONSTRAINTS (apply per review):
        - subcategories: 1-6 unique items
        - subcategories[0]: primary label (dominant theme)
        - issue_subcategories: subset of subcategories
        - request_subcategories: subset of subcategories
        - evidence: keys must match subcategories

        RULES:
        - For EVERY review_id provided, include EXACTLY one output entry.
        - Do not add any top-level keys besides the review_id keys.
        - Choose 1-6 unique subcategories from the taxonomy below, each formatted as "<main>/<sub>".
        - Put the primary label first: subcategories[0] MUST be the dominant theme of the review.
        - issue_subcategories: only problems/complaints (subset of subcategories).
        - request_subcategories: only explicit requests (subset of subcategories; e.g., "please add", "can you", "I wish").
        - evidence: for EVERY tag in subcategories, include 1-3 short verbatim quotes from THAT SAME review (<=160 chars).
          Do not invent quotes. Use double quotes in JSON strings and escape as needed.
        - If review is vague/generic: subcategories=["other/general"], issue_subcategories=[], request_subcategories=[],
          evidence={"other/general":["short quote from review"]}.
        - JSON MUST be valid: double quotes only, no trailing commas, no comments, no code fences.
        - Fill with real values only. Do not output placeholders like "<main>/<sub>", "<verbatim quote>", or "...".

        TAXONOMY (allowed main/sub):
        - gameplay: mechanics (combat/movement/core loop), controls (input/controller), balance, difficulty, progression, ai
        - technical: performance, bugs, stability_crashes (freezes/CTD/unstable), compatibility (deck/ultrawide/VR/HDR), networking,
          installation (launcher/DRM/account linking), save_data (Steam Cloud sync, corrupted saves, progress loss)
        - content_design: amount_variety, level_design, quests_modes, narrative_characters, replayability, pacing, customization
        - ui_ux_accessibility: menus_hud, readability, quality_of_life, controller_support, accessibility_options
        - onboarding: tutorial, learning_curve, clarity, tooltips
        - presentation: visuals_art_style, animation, audio_music, voice_acting, atmosphere, localization
        - online_community: multiplayer_experience (non-technical), matchmaking, social_features, toxicity_moderation, mods_ugc,
          cheating_anti_cheat
        - developer_updates: patch_quality, update_frequency, roadmap_events, communication, customer_support,
          response_time (ONLY explicit wait/time-to-fix is mentioned)
        - monetization_value: pricing, regional_pricing, dlc, microtransactions, battle_pass_fomo, pay_to_win_grind, value_for_money
        - other: general, mixed, meta, unclear, off_topic, meme

        REVIEWS (each block is independent; do not mix evidence across blocks):
        <<<BEGIN REVIEWS>>>
        $reviews_text
        <<<END REVIEWS>>>
        """
    )
)

_DEFAULT_LABEL = {
    "main_category": "other",
    "subcategory": "general",
    "subcategories": ["other/general"],
    "issue_subcategories": [],
    "request_subcategories": [],
    "evidence": {},
}
_ALLOWED_MAIN_CATEGORIES = {
    "gameplay",
    "technical",
    "content_design",
    "ui_ux_accessibility",
    "onboarding",
    "presentation",
    "online_community",
    "developer_updates",
    "monetization_value",
    "other",
}
_ALLOWED_SUBCATEGORIES = {
    "gameplay": {"mechanics", "controls", "balance", "difficulty", "progression", "ai"},
    "technical": {"performance", "bugs", "stability_crashes", "compatibility", "networking", "installation", "save_data"},
    "content_design": {
        "amount_variety",
        "level_design",
        "quests_modes",
        "narrative_characters",
        "replayability",
        "pacing",
        "customization",
    },
    "ui_ux_accessibility": {"menus_hud", "readability", "quality_of_life", "controller_support", "accessibility_options"},
    "onboarding": {"tutorial", "learning_curve", "clarity", "tooltips"},
    "presentation": {"visuals_art_style", "animation", "audio_music", "voice_acting", "atmosphere", "localization"},
    "online_community": {
        "multiplayer_experience",
        "matchmaking",
        "social_features",
        "toxicity_moderation",
        "mods_ugc",
        "cheating_anti_cheat",
    },
    "developer_updates": {
        "patch_quality",
        "update_frequency",
        "roadmap_events",
        "communication",
        "customer_support",
        "response_time",
    },
    "monetization_value": {
        "pricing",
        "regional_pricing",
        "dlc",
        "microtransactions",
        "battle_pass_fomo",
        "pay_to_win_grind",
        "value_for_money",
    },
    "other": {"general", "mixed", "meta", "unclear", "off_topic", "meme"},
}
_ALLOWED_SUBCATEGORY_KEYS = {
    f"{main}/{sub}" for main, subs in _ALLOWED_SUBCATEGORIES.items() for sub in subs
}
_SUBCATEGORY_SEPARATORS = ("/", ":", ".")

_MAIN_CATEGORY_ALIASES: dict[str, str] = {
    "content_and_design": "content_design",
    "contentdesign": "content_design",
    "developer_and_updates": "developer_updates",
    "developerupdates": "developer_updates",
    "monetization_and_value": "monetization_value",
    "monetizationvalue": "monetization_value",
    "online_and_community": "online_community",
    "onlinecommunity": "online_community",
    "uiux_accessibility": "ui_ux_accessibility",
    "uiuxaccessibility": "ui_ux_accessibility",
    "ui_ux": "ui_ux_accessibility",
}

_SUBCATEGORY_ALIASES: dict[str, dict[str, str]] = {
    "technical": {
        "bug": "bugs",
        "crash": "stability_crashes",
        "crashes": "stability_crashes",
        "stability": "stability_crashes",
    },
    "gameplay": {
        "mechanic": "mechanics",
        "control": "controls",
    },
    "content_design": {
        "quest_mode": "quests_modes",
        "quest_modes": "quests_modes",
    },
    "ui_ux_accessibility": {
        "menu_hud": "menus_hud",
        "qol": "quality_of_life",
    },
    "developer_updates": {
        "support": "customer_support",
    },
    "monetization_value": {
        "microtransaction": "microtransactions",
        "dlcs": "dlc",
        "price": "pricing",
    },
    "presentation": {
        "audio_music_voice": "audio_music",
    },
}
MAX_EVIDENCE_SNIPPET_CHARS = 160
HYBRID_RULES_VERSION = "v2"


def _hybrid_rules_model_id() -> str:
    """Return a stable identifier for hybrid-rules labeling."""
    return f"rules:{HYBRID_RULES_VERSION}"


_DANGEROUS_PATTERNS = [
    re.compile(r"<<<\s*END\s*REVIEW", re.IGNORECASE),
    re.compile(r"<<<\s*BEGIN\s*REVIEW", re.IGNORECASE),
    re.compile(r"<<<\s*END\s*REVIEWS", re.IGNORECASE),
    re.compile(r"<<<\s*BEGIN\s*REVIEWS", re.IGNORECASE),
    re.compile(r"IGNORE\s+(?:PREVIOUS|ABOVE|ALL)\s+INSTRUCTIONS", re.IGNORECASE),
    re.compile(r"DISREGARD\s+(?:PREVIOUS|ABOVE|ALL)", re.IGNORECASE),
    re.compile(r"^SYSTEM\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^ASSISTANT\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^USER\s*:", re.IGNORECASE | re.MULTILINE),
]


def _sanitize_review_text(text: str) -> str:
    """Sanitize review text to prevent prompt injection attacks."""
    if not text:
        return ""
    sanitized = text
    for pattern in _DANGEROUS_PATTERNS:
        sanitized = pattern.sub("[FILTERED]", sanitized)
    # Remove excessive newlines that could break formatting
    sanitized = re.sub(r"\n{3,}", "\n\n", sanitized)
    return sanitized[:MAX_REVIEW_CHARS]


def _clean_snippet(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    if not text:
        return ""
    if len(text) > MAX_EVIDENCE_SNIPPET_CHARS:
        return text[: MAX_EVIDENCE_SNIPPET_CHARS - 3].rstrip() + "..."
    return text


def _review_word_count(text: str) -> int:
    if not text:
        return 0
    return len(_WORD_RE.findall(text))


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+", flags=re.UNICODE)




def _split_sentences(text: str) -> list[str]:
    if not text:
        return []
    parts = _SENTENCE_SPLIT_RE.split(text)
    return [part.strip() for part in parts if part and part.strip()]


_REQUEST_SIGNAL_PATTERNS = [
    re.compile(r"\b(please|pls)\s+(add|include|implement|support|allow|give)\b", flags=re.IGNORECASE),
    re.compile(r"\b(please|pls)\s+fix\b", flags=re.IGNORECASE),
    re.compile(r"\b(can|could)\s+you\b", flags=re.IGNORECASE),
    re.compile(r"\b(i\s+wish|i['’]?d\s+like|would\s+love|would\s+like)\b", flags=re.IGNORECASE),
    re.compile(r"\b(should|needs?|need)\s+(an?\s+)?(option|mode|feature)\b", flags=re.IGNORECASE),
    re.compile(r"\b(need|needs|should)\s+fix\b", flags=re.IGNORECASE),
]


def _has_request_signal(text: str) -> bool:
    if not text:
        return False
    for pattern in _REQUEST_SIGNAL_PATTERNS:
        if pattern.search(text):
            return True
    return False


def _is_negated(sentence: str, match_start: int, match_text: str = "") -> bool:
    window = sentence[max(0, match_start - 32) : match_start].lower()
    if re.search(r"\b(no|without|never)\b", window):
        return True
    # e.g. "bug-free", "crash-free" (only relevant to bug/crash matches)
    if match_text:
        lowered = match_text.lower()
        if lowered.startswith(("bug", "crash")) and re.search(r"\b(bug|crash)[- ]?free\b", sentence.lower()):
            return True
    return False


def _compile_patterns(patterns: Sequence[str]) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(pattern, flags=re.IGNORECASE) for pattern in patterns)


_HYBRID_RULES: list[dict[str, Any]] = [
    {
        "key": "technical/stability_crashes",
        "weight": 12,
        "patterns": _compile_patterns(
            [
                r"\bctd\b",
                r"\bcrash(?:es|ed|ing)?\b",
                r"\bcrash[- ]?to[- ]?desktop\b",
                r"\bcrash\s+on\s+launch\b",
                r"\bfreez(?:e|es|ing|en)\b",
                r"\bhang(?:s|ing)?\b",
                r"\bsoft[- ]?lock(?:ed|s)?\b",
            ]
        ),
    },
    {
        "key": "technical/save_data",
        "weight": 10,
        "patterns": _compile_patterns(
            [
                r"\bsteam\s+cloud\b",
                r"\bcloud\s+sync\b",
                r"\bcloud\s+saves?\b",
                r"\bsync\s+(?:conflict|issue|issues|problem|problems|fail|fails|failed)\b",
                r"\bcan['’]?t\s+save\b",
                r"\bcannot\s+save\b",
                r"\bwon['’]?t\s+save\b",
                r"\bsave\s+corrupt(?:ion|ed)?\b",
                r"\bcorrupt(?:ed)?\s+save\b",
                r"\bprogress\s+los(?:s|t)\b",
                r"\blost\s+(?:my\s+)?save\b",
                r"\bmissing\s+save\b",
                r"\bsave\s+file\b",
                r"\bsave\s*game\b",
                r"\bautosave\b.*\b(?:broken|not\s+work(?:ing)?|fail(?:s|ed)?)\b",
            ]
        ),
    },
    {
        "key": "technical/performance",
        "weight": 9,
        "patterns": _compile_patterns(
            [
                r"\bfps\b",
                r"\bframe\s*(?:rate|rates|time|times|pacing)\b",
                r"\bframe\s*drops?\b",
                r"\bfps\s*drops?\b",
                r"\bstutter(?:ing|s)?\b",
                r"\bmicro[- ]?stutter(?:ing|s)?\b",
                r"\binput\s+lag\b",
            ]
        ),
    },
    {
        "key": "technical/bugs",
        "weight": 9,
        "patterns": _compile_patterns(
            [
                r"\bbug(?:s|gy)?\b",
                r"\bglitch(?:es|y)?\b",
                r"\bbroken\b",
                r"\bdoesn['’]?t\s+work\b",
                r"\bnot\s+working\b",
                r"\bclipping\b",
            ]
        ),
    },
    {
        "key": "technical/networking",
        "weight": 8,
        "patterns": _compile_patterns(
            [
                r"\bdisconnect(?:s|ed|ing)?\b",
                r"\blatency\b",
                r"\bnetcode\b",
                r"\brubber[- ]?band(?:ing)?\b",
                r"\bserver\s+(?:issue|issues|problem|problems|down)\b",
            ]
        ),
    },
    {
        "key": "technical/compatibility",
        "weight": 8,
        "patterns": _compile_patterns(
            [
                r"\bsteam\s*deck\b",
                r"\bultra[- ]?wide\b",
                r"\bhdr\b",
                r"\bvr\b",
                r"\bproton\b",
                r"\blinux\b",
            ]
        ),
    },
    {
        "key": "technical/installation",
        "weight": 8,
        "patterns": _compile_patterns(
            [
                r"\blauncher\b",
                r"\binstall(?:ation)?\b.*\b(?:fail|fails|failed|stuck|issue|issues|problem|problems|error)\b",
                r"\bupdate\b.*\b(?:fail|fails|failed|stuck|loop|issue|issues|problem|problems|error)\b",
                r"\bpatch\b.*\b(?:fail|fails|failed|stuck|break|breaks|broke)\b",
                r"\baccount\s+link(?:ing|ed)?\b",
            ]
        ),
    },
    {
        "key": "ui_ux_accessibility/readability",
        "weight": 7,
        "patterns": _compile_patterns(
            [
                r"\btext\b.*\b(?:too\s+small|tiny|unreadable)\b",
                r"\bfont\b.*\b(?:too\s+small|tiny|unreadable)\b",
                r"\b(?:motion|sea)\s*sickness\b",
            ]
        ),
    },
    {
        "key": "ui_ux_accessibility/controller_support",
        "weight": 7,
        "patterns": _compile_patterns(
            [
                r"\b(no|missing)\s+controller\s+support\b",
                r"\bcontroller\b.*\b(?:not\s+work(?:ing)?|broken|unresponsive|doesn['’]?t\s+work)\b",
                r"\bgamepad\b.*\b(?:not\s+work(?:ing)?|broken|unresponsive|doesn['’]?t\s+work)\b",
                r"\b(keybind|rebind|remap)\w*\b.*\b(missing|can['’]?t|cannot|doesn['’]?t|won['’]?t)\b",
            ]
        ),
    },
]


def _rules_score(text: str) -> tuple[dict[str, int], dict[str, list[str]]]:
    scores: dict[str, int] = {}
    evidence: dict[str, list[str]] = {}

    sentences = _split_sentences(text)
    if not sentences:
        sentences = [text.strip()]

    for rule in _HYBRID_RULES:
        key = str(rule.get("key") or "").strip().lower()
        patterns = rule.get("patterns") or ()
        try:
            weight = int(rule.get("weight") or 0)
        except Exception:
            weight = 0
        if not key or key not in _ALLOWED_SUBCATEGORY_KEYS or not weight:
            continue

        matched_sentence = ""
        matched_start = -1
        for sentence in sentences:
            for pattern in patterns:
                match = pattern.search(sentence)
                if not match:
                    continue
                if _is_negated(sentence, match.start(), match.group(0)):
                    continue
                matched_sentence = sentence
                matched_start = match.start()
                break
            if matched_sentence:
                break

        if not matched_sentence or matched_start < 0:
            continue

        scores[key] = scores.get(key, 0) + weight
        if key not in evidence:
            evidence[key] = [_clean_snippet(matched_sentence)]

    return scores, evidence


def _classify_review_rules(
    review_text: str,
    reviewer_voted_up: bool = True,
) -> Optional[Dict[str, Any]]:
    text = (review_text or "").strip()
    if not text:
        return None

    truncated = text[:MAX_REVIEW_CHARS]
    scores, evidence = _rules_score(truncated)
    if not scores:
        return None

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_key, best_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0

    # Conservative thresholds: accept only when a single topic clearly dominates.
    threshold = 9
    margin = 4
    if _review_word_count(truncated) <= 12:
        threshold = 7
        margin = 3

    if best_score < threshold or (best_score - second_score) < margin:
        return None

    best_main, best_sub = best_key.split("/", 1)

    # If another main category is also strongly indicated, fall back to the LLM.
    for key, score in ranked[1:]:
        main = key.split("/", 1)[0]
        if main != best_main and score >= threshold - 1:
            return None

    candidate_keys = [key for key, score in ranked if score >= max(3, best_score - 2)]
    candidate_keys = candidate_keys[:6] or [best_key]

    request_signal = _has_request_signal(truncated)
    issue_signal = True

    issue_subcategories = candidate_keys if issue_signal else []
    request_subcategories = candidate_keys if request_signal else []

    payload: Dict[str, Any] = {
        "main_category": best_main,
        "subcategory": best_sub,
        "subcategories": candidate_keys,
        "issue_subcategories": issue_subcategories,
        "request_subcategories": request_subcategories,
        "evidence": evidence,
        "_label_source": "rules",
        "_label_model": _hybrid_rules_model_id(),
    }
    return payload


def _normalize_subcategory_value(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        main = value.get("main_category") or value.get("main")
        sub = value.get("subcategory") or value.get("sub")
        if main and sub:
            value = f"{main}/{sub}"
        else:
            return None
    if not isinstance(value, str):
        return None
    raw = value.strip().lower()
    if not raw:
        return None

    def _sanitize_token(token: str) -> str:
        token = (token or "").strip().lower()
        if not token:
            return ""
        token = re.sub(r"[\s\-]+", "_", token)
        token = token.replace("&", "_")
        token = token.replace("+", "_")
        token = re.sub(r"[^a-z0-9_]", "", token)
        token = re.sub(r"_+", "_", token)
        return token.strip("_")

    for sep in _SUBCATEGORY_SEPARATORS:
        if sep not in raw:
            continue
        parts = [part.strip() for part in raw.split(sep) if part.strip()]
        if len(parts) < 2:
            continue

        for split_index in range(1, len(parts)):
            main_candidate = "_".join(filter(None, (_sanitize_token(part) for part in parts[:split_index])))
            sub_candidate = "_".join(filter(None, (_sanitize_token(part) for part in parts[split_index:])))
            if not main_candidate or not sub_candidate:
                continue

            main_candidate = _MAIN_CATEGORY_ALIASES.get(main_candidate, main_candidate)
            if main_candidate not in _ALLOWED_SUBCATEGORIES:
                continue

            sub_aliases = _SUBCATEGORY_ALIASES.get(main_candidate, {})
            sub_candidate = sub_aliases.get(sub_candidate, sub_candidate)
            if sub_candidate not in _ALLOWED_SUBCATEGORIES[main_candidate]:
                if sub_candidate.endswith("s"):
                    singular = sub_candidate[:-1]
                    singular = sub_aliases.get(singular, singular)
                    if singular in _ALLOWED_SUBCATEGORIES[main_candidate]:
                        sub_candidate = singular
                    else:
                        continue
                else:
                    plural = f"{sub_candidate}s"
                    plural = sub_aliases.get(plural, plural)
                    if plural in _ALLOWED_SUBCATEGORIES[main_candidate]:
                        sub_candidate = plural
                    else:
                        continue

            return f"{main_candidate}/{sub_candidate}"

    return None


def _parse_subcategory_list(value: Any) -> list[str]:
    results: list[str] = []
    if isinstance(value, dict):
        for main_key, subs in value.items():
            if not isinstance(subs, list):
                continue
            for sub in subs:
                normalized = _normalize_subcategory_value(f"{main_key}/{sub}")
                if normalized and normalized not in results:
                    results.append(normalized)
        return results
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        items = [value]
    else:
        return results
    for item in items:
        normalized = _normalize_subcategory_value(item)
        if normalized and normalized not in results:
            results.append(normalized)
    return results


def _parse_evidence(value: Any, allowed_subcategories: list[str]) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    allowed = set(allowed_subcategories)
    evidence: dict[str, list[str]] = {}
    for raw_key, raw_snippets in value.items():
        normalized_key = _normalize_subcategory_value(raw_key)
        if not normalized_key or (allowed and normalized_key not in allowed):
            continue
        if isinstance(raw_snippets, list):
            snippets = raw_snippets
        else:
            snippets = [raw_snippets]
        cleaned = []
        for snippet in snippets:
            text = _clean_snippet(snippet)
            if text and text not in cleaned:
                cleaned.append(text)
        if not cleaned:
            continue
        existing = evidence.get(normalized_key, [])
        for item in cleaned:
            if item in existing:
                continue
            if len(existing) >= 4:
                break
            existing.append(item)
        if existing:
            evidence[normalized_key] = existing
    return evidence


_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", flags=re.IGNORECASE | re.DOTALL)


def _strip_code_fences(raw: str) -> str:
    if not raw:
        return ""
    match = _CODE_FENCE_RE.search(raw)
    if match:
        return match.group(1).strip()
    return raw.strip()


def _load_json_mapping(raw: str) -> Dict[str, Any]:
    cleaned = _strip_code_fences(raw)
    if not cleaned:
        raise ValueError("Empty response from LLM")

    decoder = json.JSONDecoder()
    try:
        obj, _ = decoder.raw_decode(cleaned)
    except json.JSONDecodeError:
        obj = None
    if isinstance(obj, dict):
        return obj

    start = cleaned.find("{")
    if start >= 0:
        try:
            obj, _ = decoder.raw_decode(cleaned[start:])
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON from LLM: {exc}") from exc
        if isinstance(obj, dict):
            return obj

    raise ValueError(f"No JSON object found in LLM response: {raw!r}")


def _build_prompt(
    review_text: str,
    game_context: Optional[Dict[str, Any]] = None,
    reviewer_playtime: float = 0,
    reviewer_voted_up: bool = True,
    review_language: Optional[str] = None,
) -> str:
    truncated = _sanitize_review_text(review_text or "")

    # Build game context strings
    if game_context:
        game_name = game_context.get("name", "Unknown")
        game_type = game_context.get("type", "game")
        genres = game_context.get("genres", [])
        categories = game_context.get("categories", [])
        description = game_context.get("short_description", "")[:200]  # Limit description length

        game_genres = ", ".join(genres) if genres else "Unknown"
        game_categories = ", ".join(categories[:5]) if categories else "Unknown"  # Limit to 5
        game_description = description if description else "Not available"
    else:
        game_name = "Unknown"
        game_type = "game"
        game_genres = "Unknown"
        game_categories = "Unknown"
        game_description = "Not available"

    # Format playtime
    playtime_hours = round(reviewer_playtime / 60, 1) if reviewer_playtime else 0
    recommendation = "Positive" if reviewer_voted_up else "Negative"

    return _PROMPT_TEMPLATE.substitute(
        review_text=truncated,
        game_name=game_name,
        game_type=game_type,
        game_genres=game_genres,
        game_categories=game_categories,
        game_description=game_description,
        review_language=review_language or "english",
        reviewer_playtime=playtime_hours,
        reviewer_recommendation=recommendation,
    )





def _run_gemini(prompt: str, model: str) -> str:
    """Run Gemini API call with timeout and retry handling.

    Features:
    - Configurable timeout (default 30s)
    - Exponential backoff for transient errors (500-504)
    - Longer delays for rate limits (429)
    - No retry for bad requests (400)
    """
    _maybe_load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise LLMError(
            "GEMINI_API_KEY or GOOGLE_API_KEY is not set.",
            LLMErrorType.BAD_REQUEST,
            retryable=False
        )

    try:
        from google import genai
        from google.genai.errors import ClientError

        start_time = time.time()
        logger.info(f"Starting Gemini API call with model {model}")

        client = genai.Client(api_key=api_key)

        attempt = 0
        last_error: Optional[Exception] = None

        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                # Direct API call - SDK has default 60s timeout
                response = client.models.generate_content(
                    model=model,
                    contents=prompt
                )

                content = response.text
                elapsed = time.time() - start_time
                logger.info(f"Gemini API call completed in {elapsed:.2f}s (attempt {attempt})")

                if not content:
                    raise LLMError("Empty response from Gemini.", LLMErrorType.UNKNOWN, retryable=False)
                _record_llm_usage(response, model)
                return content

            except ClientError as e:
                last_error = e
                status_code = _extract_status_code(e)
                error_type, retryable = _classify_error(status_code, str(e))

                logger.warning(
                    f"Gemini API error (status={status_code}, type={error_type.value}): {e} "
                    f"(attempt {attempt}/{LLM_MAX_RETRIES})"
                )

                if not retryable:
                    raise LLMError(
                        f"Gemini API error (non-retryable): {str(e)}",
                        error_type,
                        status_code=status_code,
                        retryable=False
                    )

                if attempt < LLM_MAX_RETRIES:
                    extracted_delay = _extract_retry_delay(e) if status_code == 429 else None
                    retry_delay = _calculate_retry_delay(attempt, error_type, extracted_delay)
                    logger.info(f"Retrying in {retry_delay:.1f}s...")
                    time.sleep(retry_delay)
                    continue

                # Max retries exceeded
                error_msg = f"Gemini API error after {LLM_MAX_RETRIES} attempts: {str(e)}"
                if status_code == 429:
                    error_msg = (
                        "Gemini rate limit exceeded. Free tier allows 10 requests/minute. "
                        "Consider: 1) Reducing SENTINEXT_MAX_PARALLEL_BATCHES to 1-2, "
                        "or 2) Upgrading Gemini API plan."
                    )
                raise LLMError(error_msg, error_type, status_code=status_code, retryable=False)

        raise LLMError(
            f"Gemini API call failed after {LLM_MAX_RETRIES} attempts",
            LLMErrorType.UNKNOWN,
            retryable=False
        )

    except ImportError:
        raise LLMError(
            "google-genai package not installed. Run: pip install google-genai",
            LLMErrorType.BAD_REQUEST,
            retryable=False
        )
    except LLMError:
        raise  # Re-raise our custom errors
    except Exception as e:
        logger.error(f"Unexpected Gemini API error: {e}")
        raise LLMError(f"Gemini API error: {str(e)}", LLMErrorType.UNKNOWN, retryable=False)


def _model_id(provider: str, model: str) -> str:
    return f"{provider}:{model}"


@dataclass
class LLMResponse:
    """Response from an LLM call, potentially with tool calls."""

    content: Optional[str] = None
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    model: str = ""


async def call_llm_with_tools(
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    model: Optional[str] = None,
    timeout: Optional[int] = None,
) -> LLMResponse:
    """Call Gemini with function calling enabled.

    Features:
    - Configurable timeout (default 30s)
    - Exponential backoff for transient errors (500-504)
    - Longer delays for rate limits (429)
    - No retry for bad requests (400)

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
                  Roles: 'system', 'user', 'assistant', 'tool'
        tools: List of tool definitions in Gemini function declaration format.
        model: Optional model override (defaults to GEMINI_MODEL).
        timeout: Optional timeout in seconds (defaults to LLM_TIMEOUT_SECONDS).

    Returns:
        LLMResponse with either content or tool_calls populated.

    Raises:
        LLMError: On API errors with classification for retry decisions.
    """
    _maybe_load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise LLMError(
            "GEMINI_API_KEY or GOOGLE_API_KEY is not set.",
            LLMErrorType.BAD_REQUEST,
            retryable=False
        )

    model_name = model or GEMINI_MODEL
    effective_timeout = timeout if timeout is not None else LLM_TIMEOUT_SECONDS

    reservation: Optional[dict] = None

    try:
        from google import genai
        from google.genai import types
        from google.genai.errors import ClientError

        logger.info(f"Starting Gemini tool-calling API request with model {model_name}")
        start_time = time.time()

        client = genai.Client(api_key=api_key)

        # Reserve credits per agent iteration (per LLM call)
        user_id, ctx_operation, ctx_app_id, ctx_session_id = _billing_context()
        billing_operation = ctx_operation if ctx_operation in credits.CREDIT_COSTS else "chat_agent"
        reservation = _reserve_credits_for_operation(
            billing_operation,
            description="Agentic chat LLM call",
            app_id=ctx_app_id,
            session_id=ctx_session_id,
        )

        # Convert messages to Gemini format
        gemini_contents = _convert_messages_to_gemini(messages)

        def _to_gemini_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
            """Convert a JSON-schema-like dict to a Gemini schema dict (recursive)."""
            if not isinstance(schema, dict):
                return {"type": "STRING"}

            t = str(schema.get("type") or "string").upper()
            if t == "INT":
                t = "INTEGER"

            out: Dict[str, Any] = {"type": t}

            desc = schema.get("description")
            if isinstance(desc, str) and desc:
                out["description"] = desc

            enum = schema.get("enum")
            if isinstance(enum, list) and enum:
                out["enum"] = enum

            if t == "ARRAY":
                out["items"] = _to_gemini_schema(schema.get("items") or {})
            elif t == "OBJECT":
                props = schema.get("properties") or {}
                if isinstance(props, dict) and props:
                    out["properties"] = {k: _to_gemini_schema(v) for k, v in props.items()}
                required = schema.get("required") or []
                if isinstance(required, list) and required:
                    out["required"] = required

            return out

        # Build function declarations for tools
        function_declarations = []
        for tool in tools:
            # Build proper parameter schema
            properties = tool.get("parameters", {}).get("properties", {})
            required = tool.get("parameters", {}).get("required", [])

            # Convert to Gemini schema format
            gemini_properties = {prop_name: _to_gemini_schema(prop_def) for prop_name, prop_def in properties.items()}

            func_decl = types.FunctionDeclaration(
                name=tool["name"],
                description=tool.get("description", ""),
                parameters=types.Schema(
                    type="OBJECT",
                    properties=gemini_properties,
                    required=required if isinstance(required, list) else [],
                ) if gemini_properties else None,
            )
            function_declarations.append(func_decl)

        # Create tool config
        gemini_tools = [types.Tool(function_declarations=function_declarations)]

        attempt = 0

        while attempt < LLM_MAX_RETRIES:
            attempt += 1
            try:
                # Run the async-compatible call with timeout
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=gemini_contents,
                        config=types.GenerateContentConfig(
                            tools=gemini_tools,
                            tool_config=types.ToolConfig(
                                function_calling_config=types.FunctionCallingConfig(
                                    mode="AUTO",
                                )
                            ),
                        ),
                    ),
                    timeout=effective_timeout
                )

                elapsed = time.time() - start_time
                logger.info(f"Gemini tool-calling API call completed in {elapsed:.2f}s (attempt {attempt})")

                # Parse response for tool calls or content
                tool_calls = []
                content = None

                content_obj = None
                if response.candidates:
                    content_obj = response.candidates[0].content

                if content_obj and content_obj.parts:
                    for part in content_obj.parts:
                        # Check for function call
                        if hasattr(part, 'function_call') and part.function_call:
                            fc = part.function_call
                            tool_calls.append({
                                "name": fc.name,
                                "parameters": dict(fc.args) if fc.args else {},
                            })
                        # Check for text content
                        elif hasattr(part, 'text') and part.text:
                            content = part.text

                # Token accounting (fallback to count_tokens if usage metadata missing)
                prompt_tokens = None
                response_tokens = None
                total_tokens = None
                usage = getattr(response, "usage_metadata", None)
                if usage is not None:
                    prompt_tokens = _safe_int(getattr(usage, "prompt_token_count", None))
                    response_tokens = _safe_int(getattr(usage, "response_token_count", None))
                    total_tokens = _safe_int(getattr(usage, "total_token_count", None))

                if prompt_tokens is None or response_tokens is None or total_tokens is None:
                    if prompt_tokens is None:
                        try:
                            count_cfg = types.CountTokensConfig(tools=gemini_tools)
                            prompt_count = await asyncio.to_thread(
                                client.models.count_tokens,
                                model=model_name,
                                contents=gemini_contents,
                                config=count_cfg,
                            )
                            prompt_tokens = _safe_int(getattr(prompt_count, "total_tokens", None))
                        except Exception as exc:
                            logger.debug("Failed to count prompt tokens: %s", exc)

                    if response_tokens is None:
                        try:
                            if content_obj:
                                response_count = await asyncio.to_thread(
                                    client.models.count_tokens,
                                    model=model_name,
                                    contents=content_obj,
                                )
                                response_tokens = _safe_int(getattr(response_count, "total_tokens", None))
                            else:
                                response_tokens = 0
                        except Exception as exc:
                            logger.debug("Failed to count response tokens: %s", exc)

                    if total_tokens is None and prompt_tokens is not None and response_tokens is not None:
                        total_tokens = prompt_tokens + response_tokens

                _record_llm_usage(
                    response,
                    model_name,
                    prompt_tokens=prompt_tokens,
                    response_tokens=response_tokens,
                    total_tokens=total_tokens,
                )
                return LLMResponse(
                    content=content,
                    tool_calls=tool_calls,
                    model=_model_id("google", model_name),
                )

            except asyncio.TimeoutError:
                logger.warning(
                    f"Gemini tool-calling API call timed out after {effective_timeout}s "
                    f"(attempt {attempt}/{LLM_MAX_RETRIES})"
                )
                error_type = LLMErrorType.TIMEOUT
                if attempt < LLM_MAX_RETRIES:
                    retry_delay = _calculate_retry_delay(attempt, error_type)
                    logger.info(f"Retrying in {retry_delay:.1f}s...")
                    await asyncio.sleep(retry_delay)
                    continue
                raise LLMError(
                    f"Gemini tool-calling API call timed out after {effective_timeout}s",
                    LLMErrorType.TIMEOUT,
                    retryable=False
                )

            except ClientError as e:
                status_code = _extract_status_code(e)
                error_type, retryable = _classify_error(status_code, str(e))

                logger.warning(
                    f"Gemini tool-calling API error (status={status_code}, type={error_type.value}): {e} "
                    f"(attempt {attempt}/{LLM_MAX_RETRIES})"
                )

                if not retryable:
                    raise LLMError(
                        f"Gemini tool-calling API error (non-retryable): {str(e)}",
                        error_type,
                        status_code=status_code,
                        retryable=False
                    )

                if attempt < LLM_MAX_RETRIES:
                    extracted_delay = _extract_retry_delay(e) if status_code == 429 else None
                    retry_delay = _calculate_retry_delay(attempt, error_type, extracted_delay)
                    logger.info(f"Retrying in {retry_delay:.1f}s...")
                    await asyncio.sleep(retry_delay)
                    continue

                # Max retries exceeded
                error_msg = f"Gemini tool-calling API error after {LLM_MAX_RETRIES} attempts: {str(e)}"
                if status_code == 429:
                    error_msg = "Gemini rate limit exceeded. Free tier allows 10 requests/minute."
                raise LLMError(error_msg, error_type, status_code=status_code, retryable=False)

        raise LLMError(
            f"Gemini tool-calling API call failed after {LLM_MAX_RETRIES} attempts",
            LLMErrorType.UNKNOWN,
            retryable=False
        )

    except ImportError:
        _refund_reserved_credits(reservation, "Refund: tool-calling LLM import failed")
        raise LLMError(
            "google-genai package not installed. Run: pip install google-genai",
            LLMErrorType.BAD_REQUEST,
            retryable=False
        )
    except LLMError:
        _refund_reserved_credits(reservation, "Refund: tool-calling LLM failed")
        raise  # Re-raise our custom errors
    except credits.InsufficientCreditsError:
        raise
    except Exception as e:
        _refund_reserved_credits(reservation, "Refund: tool-calling LLM error")
        logger.error(f"Unexpected Gemini tool-calling API error: {e}")
        raise LLMError(f"Gemini tool-calling API error: {str(e)}", LLMErrorType.UNKNOWN, retryable=False)


def _convert_messages_to_gemini(messages: List[Dict[str, Any]]) -> List[Any]:
    """Convert chat messages to Gemini content format.

    Args:
        messages: List of message dicts with 'role' and 'content'.

    Returns:
        List of Gemini Content objects.
    """
    from google.genai import types

    gemini_contents = []
    system_instruction = None

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "system":
            # Gemini handles system as a separate instruction, prepend to first user message
            system_instruction = content
            continue

        elif role == "user":
            # Prepend system instruction to first user message if present
            if system_instruction:
                content = f"{system_instruction}\n\n{content}"
                system_instruction = None
            gemini_contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=content)],
                )
            )

        elif role == "assistant":
            # Check if this is a tool call response
            tool_calls = msg.get("tool_calls")
            if tool_calls:
                parts = []
                for tc in tool_calls:
                    parts.append(
                        types.Part.from_function_call(
                            name=tc.get("name", ""),
                            args=tc.get("parameters", {}),
                        )
                    )
                gemini_contents.append(
                    types.Content(role="model", parts=parts)
                )
            elif content:
                gemini_contents.append(
                    types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=content)],
                    )
                )

        elif role == "tool":
            # Tool results - parse JSON content and create function response parts
            try:
                tool_results = json.loads(content) if isinstance(content, str) else content
                if isinstance(tool_results, list):
                    parts = []
                    for result in tool_results:
                        tool_name = result.get("tool", "unknown")
                        tool_result = result.get("result", {})
                        parts.append(
                            types.Part.from_function_response(
                                name=tool_name,
                                response=tool_result,
                            )
                        )
                    gemini_contents.append(
                        types.Content(role="user", parts=parts)
                    )
            except (json.JSONDecodeError, TypeError):
                # If can't parse as JSON, just add as text
                gemini_contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=str(content))],
                    )
                )

    return gemini_contents


def _extract_status_code(error: Exception) -> Optional[int]:
    """Extract HTTP status code from a Gemini ClientError."""
    status_code = getattr(error, "status_code", None)
    if status_code is None:
        status_code = getattr(error, "status", None)
    if status_code is None:
        status_code = getattr(error, "code", None)
    if status_code is None:
        match = re.search(r"code[\"']?\s*:\s*(\d{3})", str(error))
        if match:
            try:
                status_code = int(match.group(1))
            except ValueError:
                pass
    return status_code


def _extract_retry_delay(error: Exception, default: float = 20) -> float:
    """Extract retry delay from a Gemini error message."""
    try:
        raw_message = getattr(error, "message", None)
        if raw_message is not None:
            raw_text = str(raw_message)
        else:
            raw_text = str(error)
        match = re.search(r"retry in ([\d.]+)s", raw_text, flags=re.IGNORECASE)
        if match:
            return float(match.group(1)) + 1
    except Exception:
        pass
    return default


def _run_llm(
    prompt: str,
) -> tuple[str, str]:
    return _run_gemini(prompt, GEMINI_MODEL), _model_id("google", GEMINI_MODEL)


def run_chat_completion(
    prompt: str,
) -> tuple[str, str]:
    """Run a chat completion with a pre-built prompt and return (content, model_id)."""
    reservation: Optional[dict] = None
    try:
        user_id, operation, app_id, session_id = _billing_context()
        if operation in credits.CREDIT_COSTS:
            reservation = _reserve_credits_for_operation(
                operation,
                description="Chat completion",
                app_id=app_id,
                session_id=session_id,
            )
        return _run_llm(prompt)
    except credits.InsufficientCreditsError:
        raise
    except Exception:
        _refund_reserved_credits(reservation, "Refund: chat completion failed")
        raise


# Language name mapping for translation prompts
LANGUAGE_NAMES = {
    "en": "English",
    "it": "Italian",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "pl": "Polish",
    "tr": "Turkish",
    "nl": "Dutch",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "fi": "Finnish",
    "cs": "Czech",
    "hu": "Hungarian",
    "ro": "Romanian",
    "uk": "Ukrainian",
    "th": "Thai",
    "vi": "Vietnamese",
    "ar": "Arabic",
    "id": "Indonesian",
    "el": "Greek",
}


def translate_text(text: str, target_language: str) -> tuple[str, str]:
    """Translate text to the target language using the LLM.

    Uses GEMINI_MODEL_CHEAP for cost efficiency since translation is a simpler task.

    Args:
        text: The text to translate
        target_language: Target language code (e.g., 'en', 'it', 'fr', 'de')

    Returns:
        Tuple of (translated_text, model_id)
    """
    if not text or not text.strip():
        return text, _model_id("google", GEMINI_MODEL_CHEAP)

    target_name = LANGUAGE_NAMES.get(target_language, target_language)

    prompt = f"""Translate the following text to {target_name}.
Only output the translated text, nothing else. Preserve the original formatting and tone.
If the text is already in {target_name}, return it unchanged.

Text to translate:
{text}"""

    reservation: Optional[dict] = None
    try:
        reservation = _reserve_credits_for_operation(
            "translate",
            description=f"Translate to {target_name}",
        )
        # Use cheap model for translation
        translated = _run_gemini(prompt, GEMINI_MODEL_CHEAP)
        model_used = _model_id("google", GEMINI_MODEL_CHEAP)
        return translated.strip(), model_used
    except credits.InsufficientCreditsError:
        raise
    except Exception:
        _refund_reserved_credits(reservation, "Refund: translation failed")
        raise


def _parse_payload(raw: str) -> Dict[str, Any]:
    if not raw:
        raise ValueError("Empty response from LLM")

    payload = _load_json_mapping(raw)
    return _parse_payload_mapping(payload)


def _parse_payload_mapping(payload: Mapping[str, Any]) -> Dict[str, Any]:
    # Multi-label subcategories (canonical format "main/sub").
    # `subcategories[0]` is treated as the primary label; main/sub are derived from it.
    candidate_subcategories = _parse_subcategory_list(payload.get("subcategories"))
    if not candidate_subcategories:
        main_value = payload.get("main_category") or payload.get("main")
        sub_value = payload.get("subcategory") or payload.get("sub")
        normalized_primary = _normalize_subcategory_value({"main_category": main_value, "subcategory": sub_value})
        if normalized_primary:
            candidate_subcategories = [normalized_primary]
    if not candidate_subcategories:
        raise ValueError("No valid subcategories found in LLM response.")
    if len(candidate_subcategories) > 6:
        candidate_subcategories = candidate_subcategories[:6]

    issue_subcategories = _parse_subcategory_list(payload.get("issue_subcategories"))
    request_subcategories = _parse_subcategory_list(payload.get("request_subcategories"))

    primary_key = candidate_subcategories[0]
    main_category, subcategory = primary_key.split("/", 1)

    def _ordered_unique(items: Sequence[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            ordered.append(item)
        return ordered

    subcategories = candidate_subcategories
    issue_subcategories = [entry for entry in _ordered_unique(issue_subcategories) if entry in subcategories][:6]
    request_subcategories = [entry for entry in _ordered_unique(request_subcategories) if entry in subcategories][:6]
    evidence = _parse_evidence(payload.get("evidence"), subcategories)

    return {
        "main_category": main_category,
        "subcategory": subcategory,
        "subcategories": subcategories,
        "issue_subcategories": issue_subcategories,
        "request_subcategories": request_subcategories,
        "evidence": evidence,
    }


def normalize_taxonomy_payload(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Normalize a stored label payload to the currently supported taxonomy.

    This is used to keep older cached labels compatible when subcategory keys are renamed
    (e.g., v1 -> v1.1) without forcing a full re-labeling run.
    """
    if not isinstance(payload, Mapping):
        return _DEFAULT_LABEL.copy()

    proxy: Dict[str, Any] = {
        "subcategories": payload.get("subcategories"),
        "issue_subcategories": payload.get("issue_subcategories"),
        "request_subcategories": payload.get("request_subcategories"),
        "evidence": payload.get("evidence"),
        # Optional fallback fields (some payloads may contain these).
        "main_category": payload.get("main_category") or payload.get("main"),
        "subcategory": payload.get("subcategory") or payload.get("sub"),
    }

    try:
        normalized = _parse_payload_mapping(proxy)
    except Exception:
        fallback = _DEFAULT_LABEL.copy()
        fallback["evidence"] = _parse_evidence(payload.get("evidence"), fallback["subcategories"])
        return fallback

    for extra_key in ("_label_source", "_label_model"):
        if extra_key in payload:
            normalized[extra_key] = payload.get(extra_key)

    return normalized


def _build_batch_prompt(
    items: Sequence[Mapping[str, Any]],
    *,
    game_context: Optional[Dict[str, Any]] = None,
) -> str:
    # Build game context strings (same shape as `_build_prompt`, but once per batch).
    if game_context:
        game_name = game_context.get("name", "Unknown")
        game_type = game_context.get("type", "game")
        genres = game_context.get("genres", [])
        categories = game_context.get("categories", [])
        description = game_context.get("short_description", "")[:200]

        game_genres = ", ".join(genres) if genres else "Unknown"
        game_categories = ", ".join(categories[:5]) if categories else "Unknown"
        game_description = description if description else "Not available"
    else:
        game_name = "Unknown"
        game_type = "game"
        game_genres = "Unknown"
        game_categories = "Unknown"
        game_description = "Not available"

    blocks: list[str] = []
    for item in items:
        review_id = str(item.get("review_id") or "")
        review_text = str(item.get("review_text") or "")
        review_language = str(item.get("review_language") or "english")
        reviewer_playtime = float(item.get("reviewer_playtime") or 0)
        reviewer_voted_up = bool(item.get("reviewer_voted_up", True))
        truncated = _sanitize_review_text(review_text or "")
        playtime_hours = round(reviewer_playtime / 60, 1) if reviewer_playtime else 0
        recommendation = "Positive" if reviewer_voted_up else "Negative"
        blocks.append(
            dedent(
                f"""[review_id={review_id}]
                Language: {review_language}
                Playtime_hours: {playtime_hours}
                Recommendation: {recommendation}
                <<<BEGIN REVIEW>>>
                {truncated}
                <<<END REVIEW>>>"""
            ).strip()
        )

    return _BATCH_PROMPT_TEMPLATE.substitute(
        game_name=game_name,
        game_type=game_type,
        game_genres=game_genres,
        game_categories=game_categories,
        game_description=game_description,
        reviews_text="\n\n".join(blocks),
    )


def classify_reviews_batch(
    items: Sequence[Mapping[str, Any]],
    *,
    game_context: Optional[Dict[str, Any]] = None,
) -> tuple[Dict[str, Dict[str, Any]], str]:
    if not items:
        return {}, _model_id("google", GEMINI_MODEL)

    expected_ids = [str(item.get("review_id") or "") for item in items]
    if any(not rid for rid in expected_ids):
        raise ValueError("Missing review_id in batch input.")

    logger.info(f"Classifying batch of {len(items)} reviews with LLM")
    reservation: Optional[dict] = None
    try:
        reservation = _reserve_credits_for_operation(
            "classify",
            amount=len(items) * credits.CREDIT_COSTS["classify"],
            description=f"Classify {len(items)} reviews",
        )

        prompt = _build_batch_prompt(items, game_context=game_context)
        raw, model_used = _run_llm(prompt)
        logger.info(f"LLM batch classification complete: {len(items)} reviews processed")
        payload = _load_json_mapping(raw)
    except credits.InsufficientCreditsError:
        raise
    except Exception:
        _refund_reserved_credits(reservation, "Refund: review classification failed")
        raise

    results: Dict[str, Dict[str, Any]] = {}
    failed_ids = []
    for review_id in expected_ids:
        entry = payload.get(review_id)
        if not isinstance(entry, dict):
            logger.warning(f"Missing/invalid payload for review_id={review_id}, using default label")
            results[review_id] = _DEFAULT_LABEL.copy()
            failed_ids.append(review_id)
            continue
        try:
            results[review_id] = _parse_payload_mapping(entry)
        except ValueError as e:
            logger.warning(f"Failed to parse payload for review_id={review_id}: {e}, using default label")
            results[review_id] = _DEFAULT_LABEL.copy()
            failed_ids.append(review_id)

    if failed_ids:
        logger.warning(f"Batch had {len(failed_ids)} parsing failures out of {len(expected_ids)} reviews")

    return results, model_used


def classify_reviews(items: Sequence[Mapping[str, Any]], *, game_context: Optional[Dict[str, Any]] = None) -> tuple[Dict[str, Dict[str, Any]], str]:
    """Classify reviews in a batch with fallback to single-review processing on failure."""
    if not items:
        return {}, _model_id("google", GEMINI_MODEL)

    try:
        return classify_reviews_batch(items, game_context=game_context)
    except credits.InsufficientCreditsError:
        raise
    except Exception as batch_error:
        # Batch failed completely - retry each review individually
        if len(items) == 1:
            # Already single review, use default label
            review_id = str(items[0].get("review_id") or "unknown")
            logger.error(f"Single review classification failed for {review_id}: {batch_error}")
            return {review_id: _DEFAULT_LABEL.copy()}, _model_id("google", GEMINI_MODEL)

        logger.warning(f"Batch of {len(items)} failed: {batch_error}. Retrying individually...")
        results: Dict[str, Dict[str, Any]] = {}
        model_used = _model_id("google", GEMINI_MODEL)

        for item in items:
            review_id = str(item.get("review_id") or "unknown")
            try:
                single_result, model_used = classify_reviews_batch([item], game_context=game_context)
                results.update(single_result)
            except Exception as single_error:
                logger.warning(f"Individual review {review_id} failed: {single_error}, using default label")
                results[review_id] = _DEFAULT_LABEL.copy()

        return results, model_used


def classify_review(
    review_text: str,
    game_context: Optional[Dict[str, Any]] = None,
    reviewer_playtime: float = 0,
    reviewer_voted_up: bool = True,
    review_language: Optional[str] = None,
) -> Tuple[Dict[str, Any], str]:
    clean_text = (review_text or "").strip()
    if not clean_text:
        raise ValueError("Empty review text.")
    prompt = _build_prompt(clean_text, game_context, reviewer_playtime, reviewer_voted_up, review_language)
    reservation: Optional[dict] = None
    try:
        reservation = _reserve_credits_for_operation(
            "classify",
            amount=credits.CREDIT_COSTS["classify"],
            description="Classify single review",
        )
        raw, model_used = _run_llm(prompt)
        payload = _parse_payload(raw)
        return payload, model_used
    except credits.InsufficientCreditsError:
        raise
    except Exception:
        _refund_reserved_credits(reservation, "Refund: single review classification failed")
        raise


def ensure_review_labels(
    app_id: int,
    reviews: Sequence[Mapping[str, Any]],
    force_refresh: bool = False,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    game_context: Optional[Dict[str, Any]] = None,
    cache_enabled: bool = True,
) -> Dict[str, Dict[str, Any]]:
    if not reviews:
        if progress_callback is not None:
            progress_callback(0, 0)
        return {}

    existing = storage.load_review_labels(app_id) if cache_enabled else {}
    expected_llm_model_id = _model_id("google", GEMINI_MODEL)
    valid_cached_models = {expected_llm_model_id, "short_review", "empty_review"}
    results: Dict[str, Dict[str, Any]] = {}
    total_reviews = len(reviews)
    processed_count = 0
    cached_reuse_count = 0

    # Group reviews by language before batching
    from collections import defaultdict
    pending_by_language: Dict[str, list[Dict[str, Any]]] = defaultdict(list)

    if progress_callback is not None:
        progress_callback(0, total_reviews)

    all_batches: list[list[Dict[str, Any]]] = []

    for review in reviews:
        review_id_value = review.get("recommendationid") or review.get("review_id")
        if review_id_value is None:
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue
        review_id = str(review_id_value)
        review_text = (review.get("review") or "").strip()
        review_hash = hashlib.sha256(review_text.encode("utf-8")).hexdigest()

        cached = existing.get(review_id)
        needs_refresh = force_refresh or cached is None
        if cached is not None:
            if cached.get("review_hash") != review_hash:
                needs_refresh = True
            cached_prompt_version = cached.get("prompt_version")
            if cached_prompt_version not in ACCEPTED_PROMPT_VERSIONS:
                needs_refresh = True
            cached_model = cached.get("model")
            if cached_model not in valid_cached_models:
                needs_refresh = True

        if not review_text:
            if cached is not None and not needs_refresh:
                payload = cached["payload"]
                cached_reuse_count += 1
            else:
                payload = _DEFAULT_LABEL.copy()
                payload["_label_source"] = "empty_review"
                payload["_label_model"] = "empty_review"
                if cache_enabled:
                    storage.upsert_review_label(
                        app_id,
                        review_id,
                        review_hash,
                        payload,
                        "empty_review",
                        ACTIVE_PROMPT_VERSION,
                    )
            results[review_id] = payload
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue

        if _review_word_count(review_text) < MIN_REVIEW_WORDS:
            if cached is not None and not needs_refresh:
                payload = cached["payload"]
                cached_reuse_count += 1
            else:
                payload = _DEFAULT_LABEL.copy()
                payload["_label_source"] = "short_review"
                payload["_label_model"] = "short_review"
                if cache_enabled:
                    storage.upsert_review_label(
                        app_id,
                        review_id,
                        review_hash,
                        payload,
                        "short_review",
                        ACTIVE_PROMPT_VERSION,
                    )
            results[review_id] = payload
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue

        if not needs_refresh:
            cached_payload = cached.get("payload") or {}
            payload = normalize_taxonomy_payload(cached_payload)
            if cache_enabled and (
                cached.get("prompt_version") != ACTIVE_PROMPT_VERSION or payload != cached_payload
            ):
                storage.upsert_review_label(
                    app_id,
                    review_id,
                    review_hash,
                    payload,
                    str(cached.get("model") or expected_llm_model_id),
                    ACTIVE_PROMPT_VERSION,
                )
            results[review_id] = payload
            cached_reuse_count += 1
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue

        # Extract reviewer context from review
        reviewer_playtime = review.get("author", {}).get("playtime_forever", 0)
        reviewer_voted_up = review.get("voted_up", True)
        review_language = review.get("language", "english")

        # Group by language for better batching
        pending_by_language[review_language].append(
            {
                "review_id": review_id,
                "review_text": review_text,
                "review_hash": review_hash,
                "reviewer_playtime": reviewer_playtime,
                "reviewer_voted_up": reviewer_voted_up,
                "review_language": review_language,
            }
        )

    # Create batches within each language group
    for language, lang_reviews in pending_by_language.items():
        for i in range(0, len(lang_reviews), BATCH_SIZE):
            batch = lang_reviews[i:i + BATCH_SIZE]
            all_batches.append(batch)

    logger.info(
        f"Created {len(all_batches)} batches from {len(pending_by_language)} languages "
        f"({sum(len(v) for v in pending_by_language.values())} reviews to classify)"
    )

    # Charge for cached label reuse (no LLM call, still billed)
    if cached_reuse_count > 0:
        _reserve_credits_for_operation(
            "classify_cached",
            amount=cached_reuse_count * credits.CREDIT_COSTS["classify_cached"],
            description=f"Cached labels reused ({cached_reuse_count})",
            app_id=app_id,
        )

    # Process all batches in parallel
    if all_batches:
        # Default to 5 workers (good for paid Gemini API)
        # Set SENTINEXT_MAX_PARALLEL_BATCHES=2 for free tier (10 req/min limit)
        max_workers = int(os.getenv("SENTINEXT_MAX_PARALLEL_BATCHES", "5"))
        logger.info(f"Processing {len(all_batches)} batches in parallel (max_workers={max_workers})")

        def process_batch(batch_items: list[Dict[str, Any]]) -> tuple[Dict[str, Dict[str, Any]], str]:
            return classify_reviews(batch_items, game_context=game_context)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_batch = {}
            for batch in all_batches:
                ctx = contextvars.copy_context()
                future = executor.submit(ctx.run, process_batch, batch)
                future_to_batch[future] = batch

            for future in as_completed(future_to_batch):
                batch = future_to_batch[future]
                try:
                    batch_labels, model_used = future.result()
                    batch_label_items = []  # Collect for bulk write

                    for item in batch:
                        review_id = str(item["review_id"])
                        review_hash = str(item["review_hash"])
                        payload = batch_labels[review_id]
                        payload["_label_source"] = "llm"
                        payload["_label_model"] = model_used

                        # Collect for bulk write instead of individual writes
                        batch_label_items.append({
                            "app_id": app_id,
                            "review_id": review_id,
                            "review_hash": review_hash,
                            "payload": payload,
                            "model": model_used,
                            "prompt_version": ACTIVE_PROMPT_VERSION,
                        })

                        results[review_id] = payload
                        processed_count += 1

                    # Bulk write all labels for this batch (single transaction)
                    if cache_enabled and batch_label_items:
                        storage.bulk_upsert_review_labels(batch_label_items)

                    # Update progress ONCE per batch (not per review)
                    if progress_callback is not None:
                        progress_callback(processed_count, total_reviews)

                except Exception as exc:
                    logger.error(f"Batch processing failed: {exc}")
                    raise

    if progress_callback is not None and processed_count < total_reviews:
        progress_callback(total_reviews, total_reviews)

    return results


def estimate_review_labeling(
    app_id: int,
    reviews: Sequence[Mapping[str, Any]],
    *,
    force_refresh: bool = False,
    cache_enabled: bool = True,
) -> Dict[str, Any]:
    """Estimate how many reviews will require LLM calls vs cache/rules.

    This mirrors the cache/refresh logic from `ensure_review_labels` but never calls an LLM.
    """
    if not reviews:
        return {
            "total_reviews": 0,
            "cached_reviews": 0,
            "needs_refresh_reviews": 0,
            "empty_reviews": 0,
            "short_reviews": 0,
            "llm_reviews": 0,
            "reasons": {},
            "prompt_version": ACTIVE_PROMPT_VERSION,
            "model_id": "",
            "labeling_strategy": "gemini",
        }

    existing = storage.load_review_labels(app_id) if cache_enabled else {}
    expected_llm_model_id = _model_id("google", GEMINI_MODEL)
    valid_cached_models = {expected_llm_model_id, "short_review", "empty_review"}

    counts = {
        "total_reviews": len(reviews),
        "cached_reviews": 0,
        "needs_refresh_reviews": 0,
        "empty_reviews": 0,
        "short_reviews": 0,
        "llm_reviews": 0,
    }
    reasons: Dict[str, int] = {}

    for review in reviews:
        review_id_value = review.get("recommendationid") or review.get("review_id")
        if review_id_value is None:
            reasons["missing_review_id"] = reasons.get("missing_review_id", 0) + 1
            continue

        review_id = str(review_id_value)
        review_text = (review.get("review") or "").strip()
        review_hash = hashlib.sha256(review_text.encode("utf-8")).hexdigest()

        cached = existing.get(review_id)
        needs_refresh = force_refresh or cached is None
        if cached is None:
            reasons["missing_label"] = reasons.get("missing_label", 0) + 1
        else:
            if cached.get("review_hash") != review_hash:
                needs_refresh = True
                reasons["hash_mismatch"] = reasons.get("hash_mismatch", 0) + 1
            cached_prompt_version = cached.get("prompt_version")
            if cached_prompt_version not in ACCEPTED_PROMPT_VERSIONS:
                needs_refresh = True
                reasons["prompt_version_mismatch"] = reasons.get("prompt_version_mismatch", 0) + 1
            cached_model = cached.get("model")
            if cached_model not in valid_cached_models:
                needs_refresh = True
                reasons["model_mismatch"] = reasons.get("model_mismatch", 0) + 1

        if not needs_refresh:
            counts["cached_reviews"] += 1
            continue

        counts["needs_refresh_reviews"] += 1

        if not review_text:
            counts["empty_reviews"] += 1
            continue

        if _review_word_count(review_text) < MIN_REVIEW_WORDS:
            counts["short_reviews"] += 1
            continue

        counts["llm_reviews"] += 1

    return {
        **counts,
        "reasons": reasons,
        "prompt_version": ACTIVE_PROMPT_VERSION,
        "model_id": expected_llm_model_id,
        "labeling_strategy": "gemini",
    }


def apply_review_labels(df: pd.DataFrame, labels: Mapping[str, Mapping[str, Any]]) -> pd.DataFrame:
    if df is None:
        return df

    df_labeled = df.copy()
    if df_labeled.empty:
        df_labeled["llm_main_category"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory"] = pd.Series(dtype="object")
        df_labeled["llm_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_issue_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_request_subcategories"] = pd.Series(dtype="object")
        df_labeled["llm_subcategory_evidence"] = pd.Series(dtype="object")
        df_labeled["llm_has_issue"] = pd.Series(dtype="bool")
        df_labeled["llm_has_request"] = pd.Series(dtype="bool")
        return df_labeled

    key_series = df_labeled["review_id"].astype(str)

    def _get_value(review_id: str, key: str, default: Any) -> Any:
        payload = labels.get(review_id)
        if not payload:
            return default
        value = payload.get(key, default)
        if key in ("subcategories", "issue_subcategories", "request_subcategories"):
            if isinstance(value, list):
                return list(value)
            return default
        if key == "evidence":
            return value if isinstance(value, dict) else default
        return default if value is None else value

    df_labeled["llm_main_category"] = key_series.map(lambda rid: _get_value(rid, "main_category", "other"))
    df_labeled["llm_subcategory"] = key_series.map(lambda rid: _get_value(rid, "subcategory", "general"))
    df_labeled["llm_subcategories"] = key_series.map(lambda rid: _get_value(rid, "subcategories", []))
    df_labeled["llm_issue_subcategories"] = key_series.map(lambda rid: _get_value(rid, "issue_subcategories", []))
    df_labeled["llm_request_subcategories"] = key_series.map(lambda rid: _get_value(rid, "request_subcategories", []))
    df_labeled["llm_subcategory_evidence"] = key_series.map(lambda rid: _get_value(rid, "evidence", {}))
    df_labeled["llm_has_issue"] = df_labeled["llm_issue_subcategories"].apply(
        lambda value: isinstance(value, list) and len(value) > 0
    )
    df_labeled["llm_has_request"] = df_labeled["llm_request_subcategories"].apply(
        lambda value: isinstance(value, list) and len(value) > 0
    )

    return df_labeled


_SUMMARIZE_ISSUES_PROMPT = Template(
    dedent(
        """You are analyzing Steam game reviews to identify and categorize TOP ISSUES reported by players.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Description: $game_description

        SUMMARY SCOPE / FILTERS:
        $summary_context

        ISSUE CATEGORY: $subcategory
        TOTAL REVIEWS WITH THIS ISSUE: $review_count

        OUTPUT JSON SCHEMA (use these exact keys; no extras):
        {
          "summary": "<2-3 sentence overview of the core issue and its impact on players>",
          "pros": [],
          "cons": ["<specific issue #1>", "<specific issue #2>", "..."]
        }

        RULES FOR ISSUE ANALYSIS:
        - summary: Describe the PROBLEM clearly - what's broken, what's frustrating players, how widespread it is
        - pros: ALWAYS empty list for issues (we're focusing on problems, not positives)
        - cons: List 3-7 SPECIFIC, ACTIONABLE issues as a prioritized list:
          * Start each with a clear problem statement (e.g., "Game crashes on startup", "Matchmaking takes 10+ minutes")
          * Include frequency/severity if mentioned ("affects 30% of players", "game-breaking", "minor annoyance")
          * Be concrete and developer-actionable, not vague
          * Order by severity/frequency (most critical first)
        - Extract direct player quotes where impactful
        - Focus on technical specifics: error messages, reproduction steps, affected hardware/platforms
        - Distinguish between bug reports vs. design complaints
        - Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".

        REVIEWS (players reporting this issue):
        <<<BEGIN REVIEWS>>>
        $reviews_text
        <<<END REVIEWS>>>
        """
    )
)

_SUMMARIZE_REQUESTS_PROMPT = Template(
    dedent(
        """You are analyzing Steam game reviews to identify and prioritize TOP FEATURE REQUESTS from players.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Description: $game_description

        SUMMARY SCOPE / FILTERS:
        $summary_context

        REQUEST CATEGORY: $subcategory
        TOTAL REVIEWS REQUESTING THIS: $review_count

        OUTPUT JSON SCHEMA (use these exact keys; no extras):
        {
          "summary": "<2-3 sentence overview of what players want and why it matters>",
          "pros": ["<request #1>", "<request #2>", "..."],
          "cons": []
        }

        RULES FOR FEATURE REQUEST ANALYSIS:
        - summary: Describe WHAT players want, WHY they want it, and the expected benefit/impact
        - pros: List 3-7 SPECIFIC, ACTIONABLE feature requests as a prioritized list:
          * Start each with a clear request (e.g., "Add FOV slider", "Implement cross-platform play")
          * Include player motivation/use case (e.g., "for motion sickness", "to play with console friends")
          * Mention demand level if clear ("highly requested", "mentioned by veterans", "quality of life improvement")
          * Order by demand/impact (most requested/impactful first)
        - cons: ALWAYS empty list for requests (we're focusing on wants, not problems)
        - Be specific about the requested feature - HOW players want it implemented when mentioned
        - Distinguish between "nice to have" vs. "deal-breaker" requests
        - Note any common alternatives or workarounds players suggest
        - Group similar requests (e.g., multiple UI customization requests)
        - Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".

        REVIEWS (players requesting this feature):
        <<<BEGIN REVIEWS>>>
        $reviews_text
        <<<END REVIEWS>>>
        """
    )
)

_SUMMARIZE_PROMPT_TEMPLATE = Template(
    dedent(
        """You are analyzing Steam game reviews for a specific subcategory. Generate a concise, actionable summary.

        GAME CONTEXT:
        Name: $game_name
        Type: $game_type
        Genres: $game_genres
        Description: $game_description

        SUMMARY SCOPE / FILTERS:
        $summary_context

        SUBCATEGORY: $subcategory
        TOTAL REVIEWS IN CATEGORY: $review_count

        OUTPUT JSON SCHEMA (use these exact keys; no extras):
        {
          "summary": "<2-4 sentence overview of what players are saying about this aspect>",
          "pros": ["<positive point 1>", "<positive point 2>", "..."],
          "cons": ["<negative point 1>", "<negative point 2>", "..."]
        }

        RULES:
        - summary: A concise 2-4 sentence overview capturing recommendation (thumbs up/down) and key points
        - pros: 2-5 specific positive aspects mentioned by players (empty list if none)
        - cons: 2-5 specific issues or complaints mentioned by players (empty list if none)
        - Be specific and actionable, not generic
        - Use player language where appropriate
        - Focus on patterns across multiple reviews, not single opinions
        - Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
        - JSON MUST be valid: double quotes only, no trailing commas

        REVIEWS (sample from this subcategory):
        <<<BEGIN REVIEWS>>>
        $reviews_text
        <<<END REVIEWS>>>
        """
    )
)

_SUMMARIZE_WIDGET_GENERIC_PROMPT = Template(
    dedent(
        """You are analyzing a set of Steam game reviews shown in a dashboard widget. These reviews are a SAMPLE from the UI (not necessarily the full dataset).

GAME CONTEXT:
Name: $game_name
Type: $game_type
Genres: $game_genres
Description: $game_description

WIDGET:
$widget_label

WIDGET CONTEXT (structured):
$widget_context

SUBSET METRICS (computed from provided reviews):
- Reviews: $review_count
- Recommendation rate (thumbs up): $recommendation_rate
- Avg helpful votes: $avg_helpful
- Languages (top): $language_mix
- Issue-tagged reviews: $issue_rate
- Request-tagged reviews: $request_rate

TOP TAGGED ISSUES (count of reviews mentioning the issue):
$top_issues

TOP TAGGED REQUESTS (count of reviews mentioning the request):
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-4 sentence overview grounded in the provided reviews>",
  "key_points": ["<key point 1>", "<key point 2>", "..."],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- Use only the provided context + reviews. If something is unknown, say it's unknown.
- Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
- key_points: 3-6 concise bullets, grounded in repeated patterns across reviews.
- actions: EXACTLY 3 prioritized, developer-actionable actions (start each with a verb).
- JSON MUST be valid: double quotes only, no trailing commas.

REVIEWS:
<<<BEGIN REVIEWS>>>
$reviews_text
<<<END REVIEWS>>>
"""
    )
)

_SUMMARIZE_WIDGET_TREND_WEEK_PROMPT = Template(
    dedent(
        """You are analyzing Steam reviews for one game during a specific week. These reviews are a SAMPLE shown in the dashboard widget.

GAME CONTEXT:
Name: $game_name
Type: $game_type
Genres: $game_genres
Description: $game_description

WEEK:
$widget_label

WIDGET CONTEXT (structured):
$widget_context

SUBSET METRICS (computed from provided reviews):
- Reviews: $review_count
- Recommendation rate (thumbs up): $recommendation_rate
- Avg helpful votes: $avg_helpful
- Languages (top): $language_mix
- Issue-tagged reviews: $issue_rate
- Request-tagged reviews: $request_rate

TOP TAGGED ISSUES (count of reviews mentioning the issue):
$top_issues

TOP TAGGED REQUESTS (count of reviews mentioning the request):
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-4 sentence weekly recap grounded in the provided reviews>",
  "key_points": ["<key point 1>", "<key point 2>", "..."],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- Treat this as a weekly snapshot: focus on what was top-of-mind for players that week.
- Highlight any recurring breakages/regressions and the most demanded fixes.
- Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
- key_points: 3-6 bullets; include at least 1 player-facing positive if present.
- actions: EXACTLY 3 prioritized actions (start each with a verb). If evidence is insufficient, propose safe next steps (instrument, reproduce, clarify).
- JSON MUST be valid: double quotes only, no trailing commas.

REVIEWS:
<<<BEGIN REVIEWS>>>
$reviews_text
<<<END REVIEWS>>>
"""
    )
)

_SUMMARIZE_WIDGET_SEGMENT_PROMPT = Template(
    dedent(
        """You are analyzing Steam reviews for one game written by a specific player segment (e.g., veterans, Steam Deck players, key users, a specific language).
These reviews are a SAMPLE shown in the dashboard widget.

GAME CONTEXT:
Name: $game_name
Type: $game_type
Genres: $game_genres
Description: $game_description

SEGMENT:
$widget_label

WIDGET CONTEXT (structured):
$widget_context

SUBSET METRICS (computed from provided reviews):
- Reviews: $review_count
- Recommendation rate (thumbs up): $recommendation_rate
- Avg helpful votes: $avg_helpful
- Languages (top): $language_mix
- Issue-tagged reviews: $issue_rate
- Request-tagged reviews: $request_rate

TOP TAGGED ISSUES (count of reviews mentioning the issue):
$top_issues

TOP TAGGED REQUESTS (count of reviews mentioning the request):
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-4 sentence summary of what this segment cares about>",
  "key_points": ["<key point 1>", "<key point 2>", "..."],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- Explain what this segment disproportionately notices (pain points, expectations, requests).
- If baseline metrics are provided in widget_context, call out meaningful differences (avoid made-up numbers).
- Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
- key_points: 3-6 bullets, grounded in review evidence.
- actions: EXACTLY 3 prioritized actions (start each with a verb).
- JSON MUST be valid: double quotes only, no trailing commas.

REVIEWS:
<<<BEGIN REVIEWS>>>
$reviews_text
<<<END REVIEWS>>>
"""
    )
)

_SUMMARIZE_WIDGET_LANGUAGE_PROMPT = Template(
    dedent(
        """You are analyzing Steam reviews for one game written in a specific language (regional segment). These reviews are a SAMPLE shown in the dashboard widget.

GAME CONTEXT:
Name: $game_name
Type: $game_type
Genres: $game_genres
Description: $game_description

LANGUAGE SEGMENT:
$widget_label

WIDGET CONTEXT (structured):
$widget_context

SUBSET METRICS (computed from provided reviews):
- Reviews: $review_count
- Recommendation rate (thumbs up): $recommendation_rate
- Avg helpful votes: $avg_helpful
- Issue-tagged reviews: $issue_rate
- Request-tagged reviews: $request_rate

TOP TAGGED ISSUES:
$top_issues

TOP TAGGED REQUESTS:
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-4 sentence summary of what this language segment is saying>",
  "key_points": ["<key point 1>", "<key point 2>", "..."],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- Pay attention to localization/regional issues: translation quality, UI strings, cultural references, region-specific pricing, servers, input layouts, legality/compliance, etc (only if present in reviews).
- Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
- key_points: 3-6 bullets grounded in evidence; avoid generalizations about a region.
- actions: EXACTLY 3 prioritized actions (start each with a verb).
- JSON MUST be valid: double quotes only, no trailing commas.

REVIEWS:
<<<BEGIN REVIEWS>>>
$reviews_text
<<<END REVIEWS>>>
"""
    )
)

_SUMMARIZE_WIDGET_RECENT_REVIEWS_PROMPT = Template(
    dedent(
        """You are analyzing the MOST RECENT Steam reviews for one game. These reviews represent the latest feedback window and should be treated as a "what's happening now" snapshot.

GAME CONTEXT:
Name: $game_name
Type: $game_type
Genres: $game_genres
Description: $game_description

RECENT WINDOW:
$widget_label

WIDGET CONTEXT (structured):
$widget_context

SUBSET METRICS (computed from provided reviews):
- Reviews: $review_count
- Recommendation rate (thumbs up): $recommendation_rate
- Avg helpful votes: $avg_helpful
- Languages (top): $language_mix
- Issue-tagged reviews: $issue_rate
- Request-tagged reviews: $request_rate

TOP TAGGED ISSUES (count of reviews mentioning the issue):
$top_issues

TOP TAGGED REQUESTS (count of reviews mentioning the request):
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-4 sentence recap of the most recent player feedback>",
  "key_points": ["<key point 1>", "<key point 2>", "..."],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- Focus on NEW/EMERGING themes, regressions, and "top-of-mind" issues/requests in this recent window.
- If baseline metrics are provided in widget_context, call out meaningful differences (do not invent numbers).
- Avoid the word "sentiment". Use "recommendation rate" or "thumbs up/down".
- key_points: 3-6 bullets grounded in repeated patterns across reviews.
- actions: EXACTLY 3 prioritized, developer-actionable actions (start each with a verb).
- JSON MUST be valid: double quotes only, no trailing commas.

REVIEWS:
<<<BEGIN REVIEWS>>>
$reviews_text
<<<END REVIEWS>>>
"""
    )
)

_REPORT_SUMMARY_PROMPT = Template(
    dedent(
        """You are a product insights analyst. Summarize the monthly Steam review data into a concise executive brief.

GAME: $game_name
PERIOD: $period

CORE METRICS:
- Total reviews: $total_reviews
- Recommendation rate: $recommendation_rate
$comparison_text

TOP ISSUES:
$top_issues

TOP REQUESTS:
$top_requests

OUTPUT JSON SCHEMA (use these exact keys; no extras):
{
  "summary": "<2-3 sentence executive summary of the month>",
  "key_points": ["<key insight 1>", "<key insight 2>", "<key insight 3>"],
  "actions": ["<action 1>", "<action 2>", "<action 3>"]
}

RULES:
- summary: Short overview (2-3 sentences) covering recommendation rate, main issue, and main request.
- key_points: 3 bullet-style insights from the data (what's working, what's broken, what players want).
- actions: 3 specific, developer-actionable recommendations ordered by priority.
- If month-over-month comparison provided, mention significant changes (>5% delta).
- Use only data provided; do not invent facts.
- Never use the word "sentiment". Say "recommendation rate" or "thumbs up/down".
- JSON MUST be valid: double quotes only, no trailing commas.
"""
    )
)


def summarize_monthly_report(
    *,
    game_name: str,
    period: str,
    insights: Mapping[str, Any],
) -> Dict[str, Any]:
    """Generate a concise executive summary for a monthly report.

    Returns dict with 'summary', 'key_points', and 'actions' keys.
    """
    if not insights:
        return {
            "summary": "Not enough data to summarize this period.",
            "key_points": [],
            "actions": [],
        }

    def _format_label(value: Any) -> str:
        text = str(value or "").replace("_", " ").replace("/", " / ").strip()
        return text.title() if text else "Unknown"

    def _format_issue_list(items: Any, limit: int = 3) -> str:
        if not isinstance(items, list) or not items:
            return "No clear issues identified."
        lines = []
        for item in items[:limit]:
            name = _format_label(item.get("subcategory"))
            count = int(item.get("count") or 0)
            rec_rate = item.get("recommendation_rate")
            rec_text = f"{rec_rate:.1%} rec" if isinstance(rec_rate, (int, float)) else "rec n/a"
            snippet = ""
            snippets = item.get("snippets") or []
            if isinstance(snippets, list) and snippets:
                snippet_text = str(snippets[0]).replace("\n", " ").strip()
                if snippet_text:
                    snippet = f" Example: \"{snippet_text[:120]}\""
            lines.append(f"- {name}: {count} mentions ({rec_text}).{snippet}")
        return "\n".join(lines)

    total_reviews = int(insights.get("total_reviews") or 0)
    recommendation_rate = float(insights.get("recommendation_rate") or 0.0)

    # Build comparison text if previous month data available
    comparison_text = ""
    previous = insights.get("previous")
    deltas = insights.get("deltas")
    if previous and deltas:
        prev_period = previous.get("period", "previous month")
        prev_reviews = previous.get("total_reviews", 0)
        delta_reviews = deltas.get("reviews", 0)
        delta_rec = deltas.get("recommendation_rate", 0.0)

        comparison_lines = [f"\nCOMPARISON WITH {prev_period.upper()}:"]
        review_change = "+" if delta_reviews >= 0 else ""
        comparison_lines.append(f"- Review volume: {review_change}{delta_reviews:,} ({prev_reviews:,} → {total_reviews:,})")
        rec_change = "+" if delta_rec >= 0 else ""
        comparison_lines.append(f"- Recommendation rate: {rec_change}{delta_rec:.1%} ({previous.get('recommendation_rate', 0):.1%} → {recommendation_rate:.1%})")
        comparison_text = "\n".join(comparison_lines)

    prompt = _REPORT_SUMMARY_PROMPT.substitute(
        game_name=game_name or "Unknown",
        period=period or "Unknown",
        total_reviews=f"{total_reviews:,}",
        recommendation_rate=f"{recommendation_rate:.1%}",
        comparison_text=comparison_text,
        top_issues=_format_issue_list(insights.get("top_issues")),
        top_requests=_format_issue_list(insights.get("top_requests")),
    )

    reservation: Optional[dict] = None
    try:
        _user_id, ctx_operation, ctx_app_id, ctx_session_id = _billing_context()
        billing_operation = ctx_operation if ctx_operation in credits.CREDIT_COSTS else "report_summary"
        reservation = _reserve_credits_for_operation(
            billing_operation,
            description="Monthly report summary",
            app_id=ctx_app_id,
            session_id=ctx_session_id,
        )
        raw, _model_used = _run_llm(prompt)
        payload = _load_json_mapping(raw)
        summary = str(payload.get("summary", "")).strip()
        key_points = payload.get("key_points", [])
        actions = payload.get("actions", [])

        if not isinstance(key_points, list):
            key_points = []
        key_points = [str(item).strip() for item in key_points if item][:3]

        if not isinstance(actions, list):
            actions = []
        actions = [str(item).strip() for item in actions if item][:3]

        if not summary:
            summary = "Unable to generate summary."

        return {
            "summary": summary,
            "key_points": key_points,
            "actions": actions,
        }
    except credits.InsufficientCreditsError:
        raise
    except Exception as exc:
        _refund_reserved_credits(reservation, "Refund: report summary failed")
        logger.error("Failed to generate monthly report summary: %s", exc)
        return {
            "summary": "Unable to generate summary.",
            "key_points": [],
            "actions": [],
        }


def summarize_subcategory_reviews(
    reviews: Sequence[Mapping[str, Any]],
    subcategory: str,
    game_context: Optional[Dict[str, Any]] = None,
    summary_type: str = "general",
    summary_context: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a summary with pros/cons for reviews in a subcategory.

    Args:
        reviews: List of review dicts with 'review' text field
        subcategory: The subcategory being summarized (e.g., "technical/performance")
        game_context: Optional game details (name, genres, etc.)
        summary_type: Type of summary - "issue", "request", or "general"

    Returns:
        Dict with 'summary', 'pros', 'cons' keys
    """
    if not reviews:
        return {
            "summary": "No reviews available for this subcategory.",
            "pros": [],
            "cons": [],
        }

    # Build game context strings
    if game_context:
        game_name = game_context.get("name", "Unknown")
        game_type = game_context.get("type", "game")
        genres = game_context.get("genres", [])
        description = game_context.get("short_description", "")[:200]

        game_genres = ", ".join(genres) if genres else "Unknown"
        game_description = description if description else "Not available"
    else:
        game_name = "Unknown"
        game_type = "game"
        game_genres = "Unknown"
        game_description = "Not available"

    def _clean_snippet(value: Any, max_len: int = 160) -> Optional[str]:
        text = str(value).replace("\n", " ").replace("\r", " ").strip()
        if not text:
            return None
        if len(text) > max_len:
            return text[:max_len] + "..."
        return text

    def _extract_evidence_snippets(review: Mapping[str, Any], target_subcategory: str, max_snippets: int = 2) -> list[str]:
        evidence = review.get("llm_subcategory_evidence") or review.get("subcategory_evidence") or {}
        if not isinstance(evidence, dict):
            return []
        evidence_map = {
            str(key).lower(): value
            for key, value in evidence.items()
            if isinstance(key, str)
        }
        values = evidence_map.get(target_subcategory.lower())
        if values is None:
            return []
        if isinstance(values, list):
            raw_items = values
        else:
            raw_items = [values]
        snippets: list[str] = []
        for item in raw_items:
            cleaned = _clean_snippet(item)
            if cleaned and cleaned not in snippets:
                snippets.append(cleaned)
            if len(snippets) >= max_snippets:
                break
        return snippets

    # Hybrid: evidence snippets for coverage + a few full reviews for nuance
    max_reviews = min(50, len(reviews))
    sampled_reviews = reviews[:max_reviews]
    full_review_limit = min(10, max_reviews)

    evidence_blocks: list[str] = []
    full_review_blocks: list[str] = []

    for i, review in enumerate(sampled_reviews, 1):
        voted_up = review.get("voted_up", True)
        sentiment = "Positive" if voted_up else "Negative"

        snippets = _extract_evidence_snippets(review, subcategory, max_snippets=2)
        if snippets:
            evidence_blocks.append(f"[Review {i}] ({sentiment}) " + " | ".join(snippets))

        if i <= full_review_limit:
            text = (review.get("review") or "").strip()
            if text:
                if len(text) > 500:
                    text = text[:500] + "..."
                full_review_blocks.append(f"[Review {i}] ({sentiment})\n{text}")

    sections: list[str] = []
    if evidence_blocks:
        sections.append("EVIDENCE SNIPPETS (extracted highlights):\n" + "\n".join(evidence_blocks))
    if full_review_blocks:
        sections.append("FULL REVIEW EXAMPLES (top helpful):\n" + "\n\n".join(full_review_blocks))

    reviews_text = "\n\n".join(sections)
    if not reviews_text.strip():
        return {
            "summary": "No review text available for this subcategory.",
            "pros": [],
            "cons": [],
        }

    # Select prompt template based on summary type
    if summary_type == "issue":
        prompt_template = _SUMMARIZE_ISSUES_PROMPT
    elif summary_type == "request":
        prompt_template = _SUMMARIZE_REQUESTS_PROMPT
    else:
        prompt_template = _SUMMARIZE_PROMPT_TEMPLATE

    prompt = prompt_template.substitute(
        game_name=game_name,
        game_type=game_type,
        game_genres=game_genres,
        game_description=game_description,
        summary_context=(summary_context or "None"),
        subcategory=subcategory,
        review_count=len(reviews),
        reviews_text=reviews_text,
    )

    reservation: Optional[dict] = None
    try:
        _user_id, ctx_operation, ctx_app_id, ctx_session_id = _billing_context()
        billing_operation = ctx_operation if ctx_operation in credits.CREDIT_COSTS else "summarize"
        reservation = _reserve_credits_for_operation(
            billing_operation,
            description="Subcategory summary",
            app_id=ctx_app_id,
            session_id=ctx_session_id,
        )
        raw, model_used = _run_llm(prompt)
        payload = _load_json_mapping(raw)

        summary = str(payload.get("summary", "")).strip()
        pros = payload.get("pros", [])
        cons = payload.get("cons", [])

        # Validate and clean
        if not isinstance(pros, list):
            pros = []
        if not isinstance(cons, list):
            cons = []

        pros = [str(p).strip() for p in pros if p][:5]
        cons = [str(c).strip() for c in cons if c][:5]

        return {
            "summary": summary or "Unable to generate summary.",
            "pros": pros,
            "cons": cons,
        }
    except credits.InsufficientCreditsError:
        raise
    except Exception as exc:
        _refund_reserved_credits(reservation, "Refund: summary generation failed")
        logger.error(f"Failed to summarize reviews: {exc}")
        return {
            "summary": f"Failed to generate summary: {str(exc)}",
            "pros": [],
            "cons": [],
        }


def summarize_widget_reviews(
    reviews: Sequence[Mapping[str, Any]],
    widget_kind: str,
    widget_label: str,
    widget_context: Optional[Mapping[str, Any]] = None,
    game_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Summarize review sets shown in different UI widgets (week/segment/etc.).

    Returns a structured summary suitable for displaying inside modal widgets.
    """
    if not reviews:
        return {
            "summary": "No reviews available for this widget.",
            "key_points": [],
            "actions": [],
        }

    widget_context = widget_context or {}

    # Build game context strings
    if game_context:
        game_name = game_context.get("name", "Unknown")
        game_type = game_context.get("type", "game")
        genres = game_context.get("genres", [])
        description = game_context.get("short_description", "")[:200]

        game_genres = ", ".join(genres) if genres else "Unknown"
        game_description = description if description else "Not available"
    else:
        game_name = "Unknown"
        game_type = "game"
        game_genres = "Unknown"
        game_description = "Not available"

    def _to_int(value: Any) -> int:
        try:
            if value is None:
                return 0
            if isinstance(value, bool):
                return int(value)
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                return int(float(value))
        except Exception:
            return 0
        return 0

    def _to_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "recommended", "thumbs_up", "up"}
        return False

    def _clean_snippet(value: Any, max_len: int = 160) -> Optional[str]:
        text = str(value).replace("\n", " ").replace("\r", " ").strip()
        if not text:
            return None
        if len(text) > max_len:
            return text[:max_len] + "..."
        return text

    def _listify_strings(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if isinstance(item, str) and str(item).strip()]

    def _extract_any_evidence_snippets(review: Mapping[str, Any], max_snippets: int = 2) -> list[str]:
        evidence = review.get("llm_subcategory_evidence") or review.get("subcategory_evidence") or {}
        if not isinstance(evidence, dict):
            return []

        # Prioritize issue/request subcategories when available, else fall back to evidence keys.
        candidate_keys: list[str] = []
        candidate_keys.extend(_listify_strings(review.get("llm_issue_subcategories")))
        candidate_keys.extend(_listify_strings(review.get("llm_request_subcategories")))
        if not candidate_keys:
            candidate_keys = [str(key) for key in evidence.keys() if isinstance(key, str)]

        snippets: list[str] = []
        for key in candidate_keys:
            raw_values = evidence.get(key)
            if raw_values is None:
                # evidence keys might have different casing
                for ev_key, ev_val in evidence.items():
                    if isinstance(ev_key, str) and ev_key.lower() == str(key).lower():
                        raw_values = ev_val
                        break
            if raw_values is None:
                continue
            values = raw_values if isinstance(raw_values, list) else [raw_values]
            for item in values:
                cleaned = _clean_snippet(item)
                if cleaned and cleaned not in snippets:
                    snippets.append(cleaned)
                if len(snippets) >= max_snippets:
                    return snippets
        return snippets

    # Compute subset metrics
    review_count = len(reviews)
    voted_flags: list[bool] = [_to_bool(r.get("voted_up", False)) for r in reviews]
    rec_rate = (sum(1 for v in voted_flags if v) / review_count) if review_count else 0.0
    avg_helpful = sum(_to_int(r.get("votes_up")) for r in reviews) / review_count if review_count else 0.0

    # Issue/request rate + top tags
    issue_hits = 0
    request_hits = 0
    issue_counter: Counter[str] = Counter()
    request_counter: Counter[str] = Counter()
    for r in reviews:
        issues = _listify_strings(r.get("llm_issue_subcategories"))
        requests = _listify_strings(r.get("llm_request_subcategories"))
        if issues:
            issue_hits += 1
            issue_counter.update(issues)
        if requests:
            request_hits += 1
            request_counter.update(requests)

    issue_rate = issue_hits / review_count if review_count else 0.0
    request_rate = request_hits / review_count if review_count else 0.0

    def _format_top(counter: Counter[str], limit: int = 8) -> str:
        if not counter:
            return "- None"
        lines = []
        for key, count in counter.most_common(limit):
            lines.append(f"- {key}: {count}")
        return "\n".join(lines)

    # Language mix
    lang_counter: Counter[str] = Counter()
    for r in reviews:
        lang = r.get("language")
        if isinstance(lang, str) and lang.strip():
            lang_counter.update([lang.strip().lower()])
    if lang_counter:
        top_langs = [f"{lang} ({count})" for lang, count in lang_counter.most_common(3)]
        language_mix = ", ".join(top_langs)
    else:
        language_mix = "unknown"

    # Build review blocks (evidence snippets + a few full reviews)
    # Keep the prompt compact: prioritize helpful reviews for full examples.
    def _helpful_sort_key(r: Mapping[str, Any]) -> int:
        return _to_int(r.get("votes_up"))

    sorted_by_helpful = sorted(list(reviews), key=_helpful_sort_key, reverse=True)
    sampled_reviews = sorted_by_helpful[: min(50, len(sorted_by_helpful))]
    full_review_limit = min(8, len(sampled_reviews))

    evidence_blocks: list[str] = []
    full_review_blocks: list[str] = []

    for i, review in enumerate(sampled_reviews, 1):
        voted_up = _to_bool(review.get("voted_up", False))
        sentiment = "Recommended" if voted_up else "Not recommended"
        helpful = _to_int(review.get("votes_up"))
        lang = str(review.get("language") or "unknown")
        created = str(review.get("created_at") or "")

        snippets = _extract_any_evidence_snippets(review, max_snippets=2)
        if snippets:
            evidence_blocks.append(f"[Review {i}] ({sentiment}, {helpful} helpful, {lang}, {created}) " + " | ".join(snippets))
        else:
            fallback = _clean_snippet(review.get("review") or "", max_len=160)
            if fallback:
                evidence_blocks.append(f"[Review {i}] ({sentiment}, {helpful} helpful, {lang}, {created}) {fallback}")

        if i <= full_review_limit:
            text = (review.get("review") or "").strip()
            if text:
                if len(text) > 500:
                    text = text[:500] + "..."
                full_review_blocks.append(f"[Review {i}] ({sentiment}, {helpful} helpful, {lang}, {created})\n{text}")

    sections: list[str] = []
    if evidence_blocks:
        sections.append("EVIDENCE SNIPPETS (highlights):\n" + "\n".join(evidence_blocks[:24]))
    if full_review_blocks:
        sections.append("FULL REVIEW EXAMPLES (top helpful):\n" + "\n\n".join(full_review_blocks))

    reviews_text = "\n\n".join(sections)
    if not reviews_text.strip():
        return {
            "summary": "No review text available for this widget.",
            "key_points": [],
            "actions": [],
        }

    # Compact context formatting (avoid dumping raw JSON).
    context_lines: list[str] = []
    for key in ("week_range", "segment_type", "segment_key", "segment_criteria", "filters", "query", "baseline"):
        value = widget_context.get(key)
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            try:
                value_text = json.dumps(value, ensure_ascii=True)
            except Exception:
                value_text = str(value)
        else:
            value_text = str(value)
        if value_text.strip():
            context_lines.append(f"- {key}: {value_text.strip()}")
    widget_context_text = "\n".join(context_lines) if context_lines else "- None"

    # Pick a prompt based on widget kind and segment type.
    prompt_template = _SUMMARIZE_WIDGET_GENERIC_PROMPT
    if widget_kind == "recent_reviews":
        prompt_template = _SUMMARIZE_WIDGET_RECENT_REVIEWS_PROMPT
    elif widget_kind == "trend_week":
        prompt_template = _SUMMARIZE_WIDGET_TREND_WEEK_PROMPT
    elif widget_kind == "segment":
        segment_type = str(widget_context.get("segment_type") or "").strip().lower()
        if segment_type == "language":
            prompt_template = _SUMMARIZE_WIDGET_LANGUAGE_PROMPT
        else:
            prompt_template = _SUMMARIZE_WIDGET_SEGMENT_PROMPT

    prompt = prompt_template.substitute(
        game_name=game_name,
        game_type=game_type,
        game_genres=game_genres,
        game_description=game_description,
        widget_label=widget_label,
        widget_context=widget_context_text,
        review_count=f"{review_count:,}",
        recommendation_rate=f"{rec_rate:.1%}",
        avg_helpful=f"{avg_helpful:.1f}",
        language_mix=language_mix,
        issue_rate=f"{issue_rate:.1%}",
        request_rate=f"{request_rate:.1%}",
        top_issues=_format_top(issue_counter),
        top_requests=_format_top(request_counter),
        reviews_text=reviews_text,
    )

    reservation: Optional[dict] = None
    try:
        _user_id, ctx_operation, ctx_app_id, ctx_session_id = _billing_context()
        billing_operation = ctx_operation if ctx_operation in credits.CREDIT_COSTS else "summarize"
        reservation = _reserve_credits_for_operation(
            billing_operation,
            description="Widget summary",
            app_id=ctx_app_id,
            session_id=ctx_session_id,
        )
        raw, _model_used = _run_llm(prompt)
        payload = _load_json_mapping(raw)

        summary = str(payload.get("summary", "")).strip()
        key_points = payload.get("key_points", [])
        actions = payload.get("actions", [])

        if not isinstance(key_points, list):
            key_points = []
        if not isinstance(actions, list):
            actions = []

        key_points = [str(item).strip() for item in key_points if item][:6]
        actions = [str(item).strip() for item in actions if item][:3]

        if not summary:
            summary = "Unable to generate summary."

        return {
            "summary": summary,
            "key_points": key_points,
            "actions": actions,
        }
    except credits.InsufficientCreditsError:
        raise
    except Exception as exc:
        _refund_reserved_credits(reservation, "Refund: widget summary failed")
        logger.error("Failed to summarize widget reviews: %s", exc)
        return {
            "summary": "Unable to generate summary.",
            "key_points": [],
            "actions": [],
        }


def compare_games(
    games_data: List[Dict[str, Any]],
    comparison_type: str,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate AI-powered comparison summary for 2 games.

    Args:
        games_data: List of game dicts with:
            - app_id: int
            - name: str
            - reviews: List[dict] (filtered sample)
            - metrics: Dict (recommendation rates, counts)
        comparison_type: "overview" | "category" | "subcategory"
        category: Main category for category/subcategory comparisons
        subcategory: Specific subcategory for subcategory comparisons

    Returns:
        Dict with:
            - summary: str (2-3 sentence overview)
            - winners: Dict[str, List[int]] (app_ids that excel in different areas)
            - key_differences: List[str] (2-3 bullet points)
            - strengths_per_game: Dict[int, List[str]] (per app_id)
            - weaknesses_per_game: Dict[int, List[str]] (per app_id)
            - recommendations: Dict[int, str] (who each game is best for)
    """
    # Build prompt based on comparison type
    if comparison_type == "overview":
        prompt_template = """You are analyzing Steam game reviews to compare multiple games. Generate a clear, actionable comparison.

GAMES BEING COMPARED:
{game_summaries}

OUTPUT JSON SCHEMA:
{{
  "summary": "<2-4 sentence overview highlighting what makes each game unique>",
  "winners": {{
    "<aspect>": [<app_ids>],
    ...
  }},
  "key_differences": [
    "<specific comparison point with percentages>",
    ...
  ],
  "strengths_per_game": {{
    <app_id>: ["<strength 1>", "<strength 2>", ...],
    ...
  }},
  "weaknesses_per_game": {{
    <app_id>: ["<weakness 1>", "<weakness 2>", ...],
    ...
  }},
  "recommendations": {{
    <app_id>: "<who this game is best for>",
    ...
  }}
}}

RULES:
- Be specific with data (use percentages, review counts)
- Highlight competitive advantages (>10% difference is significant)
- Focus on actionable insights, not generic praise
- Winners can be multiple games (ties are OK)
- Each game should have 2-4 strengths and 1-3 weaknesses
- Recommendations should differentiate target audiences

REVIEW SAMPLES:
{review_samples}"""

    elif comparison_type == "category":
        prompt_template = """You are analyzing Steam game reviews to compare games in a specific category: {category}.

GAMES BEING COMPARED:
{game_summaries}

FOCUS CATEGORY: {category}

OUTPUT JSON SCHEMA:
{{
  "summary": "<2-3 sentence overview of differences in {category}>",
  "winners": {{
    "<subcategory_or_aspect>": [<app_ids>],
    ...
  }},
  "key_differences": [
    "<specific comparison point with percentages for {category}>",
    ...
  ],
  "strengths_per_game": {{
    <app_id>: ["<{category} strength 1>", "<{category} strength 2>"],
    ...
  }},
  "weaknesses_per_game": {{
    <app_id>: ["<{category} weakness 1>", ...],
    ...
  }},
  "recommendations": {{
    <app_id>: "<who this game is best for based on {category}>",
    ...
  }}
}}

RULES:
- Focus ONLY on {category} aspects
- Use specific metrics and percentages
- Identify which game excels in specific subcategories
- Be concise (2-3 strengths/weaknesses per game)

REVIEW SAMPLES (filtered for {category}):
{review_samples}"""

    else:  # subcategory
        prompt_template = """You are analyzing Steam game reviews to compare games on a specific subcategory: {subcategory}.

GAMES BEING COMPARED:
{game_summaries}

FOCUS SUBCATEGORY: {subcategory}

OUTPUT JSON SCHEMA:
{{
  "summary": "<1-2 sentence comparison of {subcategory} differences>",
  "winners": {{
    "{subcategory}": [<app_ids>]
  }},
  "key_differences": [
    "<specific {subcategory} comparison with data>",
    ...
  ],
  "strengths_per_game": {{
    <app_id>: ["<{subcategory} strength>", ...],
    ...
  }},
  "weaknesses_per_game": {{
    <app_id>: ["<{subcategory} weakness>", ...],
    ...
  }},
  "recommendations": {{
    <app_id>: "<who should choose this game for {subcategory}>",
    ...
  }}
}}

RULES:
- Focus ONLY on {subcategory}
- Extract specific player feedback about {subcategory}
- 1-2 strengths/weaknesses per game
- Very specific and actionable insights

REVIEW SAMPLES (filtered for {subcategory}):
{review_samples}"""

    # Build game summaries
    game_summaries = []
    for game in games_data:
        metrics = game.get("metrics", {})
        rec_rate_raw = metrics.get("recommendation_rate", 0)
        try:
            rec_rate = float(rec_rate_raw or 0.0)
        except Exception:
            rec_rate = 0.0
        # Support both 0-1 fractions and 0-100 percentages.
        rec_pct = rec_rate * 100.0 if rec_rate <= 1.0 else rec_rate
        total = metrics.get("total_reviews", len(game.get("reviews", [])))
        summary = f"Game: \"{game['name']}\" (App ID: {game['app_id']}, Recommendation: {rec_pct:.1f}%, Reviews: {total})"
        game_summaries.append(summary)

    def _clean_snippet(value: Any, max_len: int = 160) -> Optional[str]:
        text = str(value).replace("\n", " ").replace("\r", " ").strip()
        if not text:
            return None
        if len(text) > max_len:
            return text[:max_len] + "..."
        return text

    def _extract_evidence(review: Mapping[str, Any], *, target_subcategory: Optional[str], target_category: Optional[str]) -> list[str]:
        evidence = review.get("llm_subcategory_evidence") or review.get("subcategory_evidence") or {}
        if not isinstance(evidence, dict):
            return []
        evidence_map = {
            str(key).lower(): value
            for key, value in evidence.items()
            if isinstance(key, str)
        }

        items: list[Any] = []
        if target_subcategory:
            values = evidence_map.get(target_subcategory.lower())
            if values is not None:
                items = values if isinstance(values, list) else [values]
        elif target_category:
            prefix = f"{target_category.lower()}/"
            for key, value in evidence_map.items():
                if key.startswith(prefix):
                    if isinstance(value, list):
                        items.extend(value)
                    else:
                        items.append(value)
        else:
            for value in evidence_map.values():
                if isinstance(value, list):
                    items.extend(value)
                else:
                    items.append(value)
                if items:
                    break

        snippets: list[str] = []
        for item in items:
            cleaned = _clean_snippet(item)
            if cleaned and cleaned not in snippets:
                snippets.append(cleaned)
            if len(snippets) >= 2:
                break
        return snippets

    # Build review samples (hybrid: evidence snippets + a few full reviews)
    review_samples = []
    for game in games_data:
        reviews = game.get("reviews", [])[:50]  # Limit to 50 reviews per game
        if not reviews:
            continue

        review_samples.append(f"\n--- {game['name']} (App ID: {game['app_id']}) ---")
        evidence_lines: list[str] = []
        full_review_lines: list[str] = []
        full_review_limit = min(10, len(reviews))

        for i, review in enumerate(reviews, 1):
            voted_up = "Positive" if review.get("voted_up") else "Negative"
            subcats = review.get("llm_subcategories", [])
            snippets = _extract_evidence(
                review,
                target_subcategory=subcategory if comparison_type == "subcategory" else None,
                target_category=category if comparison_type == "category" else None,
            )
            if snippets:
                evidence_text = " | ".join(snippets)
            else:
                fallback = review.get("review", "")[:160]
                evidence_text = fallback + ("..." if len(fallback) == 160 else "")
            evidence_lines.append(f"{i}. [{voted_up}] {evidence_text} (Subcategories: {', '.join(subcats[:3])})")

            if i <= full_review_limit:
                review_text = review.get("review", "")[:300]  # Truncate long reviews
                full_review_lines.append(f"{i}. [{voted_up}] {review_text}... (Subcategories: {', '.join(subcats[:3])})")

        review_samples.append("EVIDENCE SNIPPETS:\n" + "\n".join(evidence_lines))
        review_samples.append("FULL REVIEW EXAMPLES:\n" + "\n".join(full_review_lines))

    # Format the prompt
    prompt = prompt_template.format(
        game_summaries="\n".join(game_summaries),
        review_samples="\n".join(review_samples),
        category=category or "",
        subcategory=subcategory or "",
    )

    # Call LLM
    try:
        logger.info(f"Comparing {len(games_data)} games (type: {comparison_type})")

        # Get API key and model
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise LLMError(
                "GEMINI_API_KEY or GOOGLE_API_KEY is not set.",
                LLMErrorType.BAD_REQUEST,
                retryable=False
            )

        model_name = GEMINI_MODEL

        try:
            from google import genai
            from google.genai.errors import ClientError
        except ImportError:
            raise LLMError(
                "google-genai package not installed. Run: pip install google-genai",
                LLMErrorType.BAD_REQUEST,
                retryable=False
            )

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "temperature": 0.3,
                "response_mime_type": "application/json",
            },
        )

        if not response or not response.text:
            raise ValueError("Empty response from LLM")

        _record_llm_usage(response, model_name)
        logger.debug(f"LLM response length: {len(response.text)}")

        try:
            result = json.loads(response.text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON response: {e}")
            logger.error(f"Response text: {response.text[:500]}")
            raise ValueError(f"Invalid JSON response from LLM: {str(e)}")

        # Convert string keys to int for per-game dicts
        if "strengths_per_game" in result:
            result["strengths_per_game"] = {
                int(k): v for k, v in result["strengths_per_game"].items()
            }
        if "weaknesses_per_game" in result:
            result["weaknesses_per_game"] = {
                int(k): v for k, v in result["weaknesses_per_game"].items()
            }
        if "recommendations" in result:
            result["recommendations"] = {
                int(k): v for k, v in result["recommendations"].items()
            }

        # Ensure all required fields exist
        result.setdefault("summary", "Comparison generated successfully")
        result.setdefault("winners", {})
        result.setdefault("key_differences", [])
        result.setdefault("strengths_per_game", {})
        result.setdefault("weaknesses_per_game", {})
        result.setdefault("recommendations", {})

        logger.info(f"Successfully compared {len(games_data)} games")
        return result

    except LLMError:
        raise
    except ImportError as exc:
        logger.error(f"Import error: {exc}")
        raise LLMError(
            "google-genai package not installed",
            error_type=LLMErrorType.BAD_REQUEST,
        ) from exc
    except json.JSONDecodeError as exc:
        logger.error(f"JSON parsing error: {exc}")
        raise LLMError(
            f"Invalid JSON response from AI: {str(exc)}",
            error_type=LLMErrorType.API_ERROR,
        ) from exc
    except Exception as exc:
        logger.exception(f"Failed to compare games: {exc}")
        # Check if it's a ClientError from genai
        error_msg = str(exc)
        if "ClientError" in type(exc).__name__:
            error_msg = f"Gemini API error: {str(exc)}"
        raise LLMError(
            f"Failed to generate comparison: {error_msg}",
            error_type=LLMErrorType.API_ERROR,
        ) from exc


__all__ = [
    "apply_review_labels",
    "call_llm_with_tools",
    "classify_review",
    "compare_games",
    "ensure_review_labels",
    "LLMError",
    "LLMErrorType",
    "LLMResponse",
    "llm_usage_context",
    "run_chat_completion",
    "summarize_subcategory_reviews",
    "summarize_monthly_report",
]
