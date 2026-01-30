"""Review classification helpers (OpenAI only)."""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
import random
import re
import time
from string import Template
from textwrap import dedent
from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Tuple

import pandas as pd

import requests

from . import storage

logger = logging.getLogger(__name__)

OPENAI_BASE_URL = os.getenv("SENTINEXT_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
PROMPT_VERSION = "steam_review_insights_v13_subcategories_primary_json"
ACTIVE_PROMPT_VERSION = PROMPT_VERSION
OPENAI_MODEL = "gpt-5-mini"
OPENAI_BATCH_SIZE = 10
MAX_REVIEW_CHARS = 3000
MIN_REVIEW_WORDS = 2
_WORD_RE = re.compile(r"\w+", flags=re.UNICODE)


def _maybe_load_dotenv() -> None:
    if os.getenv("OPENAI_API_KEY") or os.getenv("SENTINEXT_OPENAI_API_KEY"):
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
        - technical: performance, bugs, stability, crashes, compatibility (deck/ultrawide/VR/HDR), networking,
          installation (launcher/DRM/account linking/cloud saves)
        - content_design: amount_variety, level_design, quests_modes, narrative_characters, replayability, pacing, customization
        - ui_ux_accessibility: menus_hud, readability, quality_of_life, controller_support, accessibility_options
        - onboarding: tutorial, learning_curve, clarity, tooltips
        - presentation: visuals_art_style, animation, audio_music_voice, atmosphere, localization
        - online_community: multiplayer_experience (non-technical), matchmaking, social_features, toxicity_moderation, mods_ugc,
          cheating_anti_cheat
        - developer_updates: patch_quality, update_frequency, roadmap_events, communication, customer_support
        - monetization_value: price, regional_pricing, dlc, microtransactions, pay_to_win_grind, value_for_money
        - other: general, mixed, meta, unclear

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
        - technical: performance, bugs, stability, crashes, compatibility (deck/ultrawide/VR/HDR), networking,
          installation (launcher/DRM/account linking/cloud saves)
        - content_design: amount_variety, level_design, quests_modes, narrative_characters, replayability, pacing, customization
        - ui_ux_accessibility: menus_hud, readability, quality_of_life, controller_support, accessibility_options
        - onboarding: tutorial, learning_curve, clarity, tooltips
        - presentation: visuals_art_style, animation, audio_music_voice, atmosphere, localization
        - online_community: multiplayer_experience (non-technical), matchmaking, social_features, toxicity_moderation, mods_ugc,
          cheating_anti_cheat
        - developer_updates: patch_quality, update_frequency, roadmap_events, communication, customer_support
        - monetization_value: price, regional_pricing, dlc, microtransactions, pay_to_win_grind, value_for_money
        - other: general, mixed, meta, unclear

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
    "technical": {"performance", "bugs", "stability", "crashes", "compatibility", "networking", "installation"},
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
    "presentation": {"visuals_art_style", "animation", "audio_music_voice", "atmosphere", "localization"},
    "online_community": {
        "multiplayer_experience",
        "matchmaking",
        "social_features",
        "toxicity_moderation",
        "mods_ugc",
        "cheating_anti_cheat",
    },
    "developer_updates": {"patch_quality", "update_frequency", "roadmap_events", "communication", "customer_support"},
    "monetization_value": {"price", "regional_pricing", "dlc", "microtransactions", "pay_to_win_grind", "value_for_money"},
    "other": {"general", "mixed", "meta", "unclear"},
}
_ALLOWED_SUBCATEGORY_KEYS = {
    f"{main}/{sub}" for main, subs in _ALLOWED_SUBCATEGORIES.items() for sub in subs
}
_SUBCATEGORY_SEPARATORS = ("/", ":", ".")
MAX_EVIDENCE_SNIPPET_CHARS = 160


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
        "key": "technical/crashes",
        "weight": 12,
        "patterns": _compile_patterns(
            [
                r"\bctd\b",
                r"\bcrash(?:es|ed|ing)?\b",
                r"\bcrash[- ]?to[- ]?desktop\b",
                r"\bcrash\s+on\s+launch\b",
            ]
        ),
    },
    {
        "key": "technical/stability",
        "weight": 10,
        "patterns": _compile_patterns(
            [
                r"\bfreez(?:e|es|ing|en)\b",
                r"\bhang(?:s|ing)?\b",
                r"\bsoft[- ]?lock(?:ed|s)?\b",
                r"\bsave\s+corrupt(?:ion|ed)?\b",
                r"\bcorrupt(?:ed)?\s+save\b",
                r"\bprogress\s+los(?:s|t)\b",
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
    main = ""
    sub = ""
    for sep in _SUBCATEGORY_SEPARATORS:
        if sep in raw:
            main, sub = raw.split(sep, 1)
            break
    if not main or not sub:
        return None
    main = main.strip()
    sub = sub.strip()
    if main not in _ALLOWED_SUBCATEGORIES:
        return None
    if sub not in _ALLOWED_SUBCATEGORIES[main]:
        return None
    return f"{main}/{sub}"


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
        if cleaned:
            evidence[normalized_key] = cleaned[:4]
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
) -> str:
    truncated = (review_text or "")[:MAX_REVIEW_CHARS]

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
        reviewer_playtime=playtime_hours,
        reviewer_recommendation=recommendation,
    )



def _openai_timeout_seconds() -> Optional[float]:
    raw = os.getenv("SENTINEXT_OPENAI_TIMEOUT_SEC")
    if raw is None:
        return 60.0
    value = str(raw).strip().lower()
    if value in {"", "0", "none", "null", "false"}:
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ValueError("SENTINEXT_OPENAI_TIMEOUT_SEC must be a number (seconds) or 0/none.") from exc
    if parsed <= 0:
        return None
    return parsed


def _openai_max_retries() -> int:
    raw = os.getenv("SENTINEXT_OPENAI_MAX_RETRIES", "12")
    try:
        value = int(str(raw).strip())
    except ValueError as exc:
        raise ValueError("SENTINEXT_OPENAI_MAX_RETRIES must be an integer.") from exc
    return max(0, value)


def _retry_backoff_seconds(attempt: int) -> float:
    base = min(2 ** min(attempt, 6), 60)
    return float(base) + random.random()


def _run_openai(prompt: str, model: str) -> str:
    _maybe_load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("SENTINEXT_OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set.")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return STRICT JSON only. No prose, no code fences."},
            {"role": "user", "content": prompt},
        ],
    }
    temp_override = os.getenv("SENTINEXT_OPENAI_TEMPERATURE")
    if temp_override:
        try:
            payload["temperature"] = float(temp_override)
        except ValueError:
            raise ValueError("SENTINEXT_OPENAI_TEMPERATURE must be a number.")
    elif not model.startswith("gpt-5"):
        payload["temperature"] = 0.2
    timeout = _openai_timeout_seconds()
    max_retries = _openai_max_retries()

    attempt = 0
    while True:
        attempt += 1
        try:
            response = requests.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
        except requests.exceptions.Timeout as exc:
            if max_retries and attempt > max_retries:
                raise
            sleep_for = _retry_backoff_seconds(attempt)
            logger.warning("OpenAI request timed out (attempt %s), retrying in %.1fs", attempt, sleep_for)
            time.sleep(sleep_for)
            continue
        except requests.exceptions.RequestException as exc:
            if max_retries and attempt > max_retries:
                raise
            sleep_for = _retry_backoff_seconds(attempt)
            logger.warning("OpenAI request error (attempt %s), retrying in %.1fs: %s", attempt, sleep_for, exc)
            time.sleep(sleep_for)
            continue

        if response.ok:
            break

        status = response.status_code
        retryable = status in {408, 409, 425, 429, 500, 502, 503, 504}
        if retryable and (not max_retries or attempt <= max_retries):
            retry_after = response.headers.get("retry-after")
            if retry_after:
                try:
                    sleep_for = float(retry_after)
                except ValueError:
                    sleep_for = _retry_backoff_seconds(attempt)
            else:
                sleep_for = _retry_backoff_seconds(attempt)
            logger.warning(
                "OpenAI API error %s (attempt %s), retrying in %.1fs: %s",
                status,
                attempt,
                sleep_for,
                response.text,
            )
            time.sleep(sleep_for)
            continue

        raise ValueError(f"OpenAI API error {response.status_code}: {response.text}")
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("OpenAI API returned no choices.")
    message = choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise ValueError("Empty response from OpenAI.")
    return content


def _model_id(provider: str, model: str) -> str:
    return f"{provider}:{model}"


def _run_llm(
    prompt: str,
) -> tuple[str, str]:
    return _run_openai(prompt, OPENAI_MODEL), _model_id("openai", OPENAI_MODEL)


def run_chat_completion(
    prompt: str,
) -> tuple[str, str]:
    """Run a chat completion with a pre-built prompt and return (content, model_id)."""
    return _run_llm(prompt)


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
        reviewer_playtime = float(item.get("reviewer_playtime") or 0)
        reviewer_voted_up = bool(item.get("reviewer_voted_up", True))
        truncated = (review_text or "")[:MAX_REVIEW_CHARS]
        playtime_hours = round(reviewer_playtime / 60, 1) if reviewer_playtime else 0
        recommendation = "Positive" if reviewer_voted_up else "Negative"
        blocks.append(
            dedent(
                f"""[review_id={review_id}]
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
        return {}, _model_id("openai", OPENAI_MODEL)

    expected_ids = [str(item.get("review_id") or "") for item in items]
    if any(not rid for rid in expected_ids):
        raise ValueError("Missing review_id in batch input.")

    prompt = _build_batch_prompt(items, game_context=game_context)
    raw, model_used = _run_llm(prompt)
    payload = _load_json_mapping(raw)

    results: Dict[str, Dict[str, Any]] = {}
    for review_id in expected_ids:
        entry = payload.get(review_id)
        if not isinstance(entry, dict):
            raise ValueError(f"Missing/invalid payload for review_id={review_id}.")
        results[review_id] = _parse_payload_mapping(entry)

    return results, model_used


def classify_review(
    review_text: str,
    game_context: Optional[Dict[str, Any]] = None,
    reviewer_playtime: float = 0,
    reviewer_voted_up: bool = True,
) -> Tuple[Dict[str, Any], str]:
    clean_text = (review_text or "").strip()
    if not clean_text:
        raise ValueError("Empty review text.")
    prompt = _build_prompt(clean_text, game_context, reviewer_playtime, reviewer_voted_up)
    raw, model_used = _run_llm(prompt)
    payload = _parse_payload(raw)
    return payload, model_used


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
    expected_llm_model_id = _model_id("openai", OPENAI_MODEL)
    valid_cached_models = {expected_llm_model_id, "short_review", "empty_review"}
    results: Dict[str, Dict[str, Any]] = {}
    total_reviews = len(reviews)
    processed_count = 0
    pending: list[Dict[str, Any]] = []

    if progress_callback is not None:
        progress_callback(0, total_reviews)

    def _flush_pending() -> None:
        nonlocal processed_count
        if not pending:
            return
        batch_labels, model_used = classify_reviews_batch(pending, game_context=game_context)
        for item in pending:
            review_id = str(item["review_id"])
            review_hash = str(item["review_hash"])
            payload = batch_labels[review_id]
            payload["_label_source"] = "llm"
            payload["_label_model"] = model_used
            if cache_enabled:
                storage.upsert_review_label(
                    app_id,
                    review_id,
                    review_hash,
                    payload,
                    model_used,
                    ACTIVE_PROMPT_VERSION,
                )
            results[review_id] = payload
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
        pending.clear()

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
            if cached.get("prompt_version") != ACTIVE_PROMPT_VERSION:
                needs_refresh = True
            cached_model = cached.get("model")
            if cached_model not in valid_cached_models:
                needs_refresh = True

        if not review_text:
            if cached is not None and not needs_refresh:
                payload = cached["payload"]
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
            results[review_id] = cached["payload"]
            processed_count += 1
            if progress_callback is not None:
                progress_callback(processed_count, total_reviews)
            continue

        # Extract reviewer context from review
        reviewer_playtime = review.get("author", {}).get("playtime_forever", 0)
        reviewer_voted_up = review.get("voted_up", True)

        pending.append(
            {
                "review_id": review_id,
                "review_text": review_text,
                "review_hash": review_hash,
                "reviewer_playtime": reviewer_playtime,
                "reviewer_voted_up": reviewer_voted_up,
            }
        )
        if len(pending) >= OPENAI_BATCH_SIZE:
            _flush_pending()

    _flush_pending()

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
            "labeling_strategy": "openai",
        }

    existing = storage.load_review_labels(app_id) if cache_enabled else {}
    expected_llm_model_id = _model_id("openai", OPENAI_MODEL)
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
            if cached.get("prompt_version") != ACTIVE_PROMPT_VERSION:
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
        "labeling_strategy": "openai",
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


__all__ = [
    "apply_review_labels",
    "classify_review",
    "ensure_review_labels",
    "run_chat_completion",
]
