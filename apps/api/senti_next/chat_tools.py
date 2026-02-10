"""Tool definitions and execution for the agentic chat system."""
from __future__ import annotations

import hashlib
import json
import logging
import time
import traceback
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from .chat_agent import AgentContext

from .steam_api import STEAM_LANGUAGES

logger = logging.getLogger(__name__)


# Tool result cache configuration
CACHE_TTL_SECONDS = 300  # 5 minutes
_tool_cache: Dict[str, Dict[str, Any]] = {}  # cache_key -> {"result": ..., "expires": ...}


def _make_cache_key(tool_name: str, params: Dict[str, Any], context_key: str) -> str:
    """Create a cache key from tool name, params, and context."""
    # Sort params for consistent hashing
    params_str = json.dumps(params, sort_keys=True, default=str)
    key_data = f"{tool_name}:{params_str}:{context_key}"
    return hashlib.md5(key_data.encode()).hexdigest()


def _get_cached_result(cache_key: str) -> Optional[Dict[str, Any]]:
    """Get cached result if not expired."""
    if cache_key not in _tool_cache:
        return None

    entry = _tool_cache[cache_key]
    if time.time() > entry.get("expires", 0):
        del _tool_cache[cache_key]
        return None

    logger.debug(f"Cache hit for key {cache_key[:8]}...")
    return entry.get("result")


def _set_cached_result(cache_key: str, result: Dict[str, Any], ttl: int = CACHE_TTL_SECONDS) -> None:
    """Store result in cache with TTL."""
    _tool_cache[cache_key] = {
        "result": result,
        "expires": time.time() + ttl,
    }
    logger.debug(f"Cached result for key {cache_key[:8]}... (TTL={ttl}s)")


def clear_tool_cache(session_id: Optional[str] = None, app_id: Optional[int] = None) -> int:
    """Clear tool cache, optionally filtered by session or app_id.

    Args:
        session_id: If provided, only clear cache entries for this session
        app_id: If provided, only clear cache entries for this app

    Returns:
        Number of entries cleared
    """
    global _tool_cache

    if session_id is None and app_id is None:
        count = len(_tool_cache)
        _tool_cache = {}
        return count

    # For targeted clearing, we need to check keys
    # This is a simple approach - in production you'd want more sophisticated key structure
    keys_to_delete = []
    for key in _tool_cache:
        if session_id and session_id in key:
            keys_to_delete.append(key)
        elif app_id and str(app_id) in key:
            keys_to_delete.append(key)

    for key in keys_to_delete:
        del _tool_cache[key]

    return len(keys_to_delete)


# Valid taxonomy for subcategory validation
VALID_SUBCATEGORIES = {
    "gameplay": ["mechanics", "controls", "balance", "difficulty", "progression", "ai"],
    "technical": ["performance", "bugs", "stability_crashes", "compatibility", "networking", "installation", "save_data"],
    "content_design": ["amount_variety", "level_design", "quests_modes", "narrative_characters", "replayability", "pacing", "customization"],
    "ui_ux_accessibility": ["menus_hud", "readability", "quality_of_life", "controller_support", "accessibility_options"],
    "onboarding": ["tutorial", "learning_curve", "clarity", "tooltips"],
    "presentation": ["visuals_art_style", "animation", "audio_music", "voice_acting", "atmosphere", "localization"],
    "online_community": ["multiplayer_experience", "matchmaking", "social_features", "toxicity_moderation", "mods_ugc", "cheating_anti_cheat"],
    "developer_updates": ["patch_quality", "update_frequency", "roadmap_events", "communication", "customer_support", "response_time"],
    "monetization_value": ["pricing", "regional_pricing", "dlc", "microtransactions", "battle_pass_fomo", "pay_to_win_grind", "value_for_money"],
    "other": ["general", "mixed", "meta", "unclear", "off_topic", "meme"],
}

# Flattened set for quick lookup
ALL_VALID_SUBCATEGORY_PATHS = {
    f"{main}/{sub}" for main, subs in VALID_SUBCATEGORIES.items() for sub in subs
}

# Aliases for common terms
SUBCATEGORY_ALIASES = {
    "bugs": ["technical/bugs", "technical/stability_crashes"],
    "bug": ["technical/bugs"],
    "performance": ["technical/performance"],
    "fps": ["technical/performance"],
    "lag": ["technical/performance", "technical/networking"],
    "crash": ["technical/stability_crashes"],
    "crashes": ["technical/stability_crashes"],
    "stability": ["technical/stability_crashes"],
    "freeze": ["technical/stability_crashes"],
    "ctd": ["technical/stability_crashes"],
    "save": ["technical/save_data"],
    "saves": ["technical/save_data"],
    "save data": ["technical/save_data"],
    "steam cloud": ["technical/save_data"],
    "cloud save": ["technical/save_data"],
    "graphics": ["presentation/visuals_art_style", "technical/performance"],
    "audio": ["presentation/audio_music"],
    "music": ["presentation/audio_music"],
    "voice": ["presentation/voice_acting"],
    "story": ["content_design/narrative_characters"],
    "difficulty": ["gameplay/difficulty"],
    "hard": ["gameplay/difficulty"],
    "easy": ["gameplay/difficulty"],
    "controls": ["gameplay/controls"],
    "balance": ["gameplay/balance"],
    "price": ["monetization_value/pricing"],
    "pricing": ["monetization_value/pricing"],
    "battle pass": ["monetization_value/battle_pass_fomo"],
    "battlepass": ["monetization_value/battle_pass_fomo"],
    "fomo": ["monetization_value/battle_pass_fomo"],
    "dlc": ["monetization_value/dlc"],
    "multiplayer": ["online_community/multiplayer_experience"],
    "coop": ["online_community/multiplayer_experience"],
    "ui": ["ui_ux_accessibility/menus_hud"],
    "menu": ["ui_ux_accessibility/menus_hud"],
    "tutorial": ["onboarding/tutorial"],
}


def _normalize_language_filter(language: Optional[str]) -> Optional[str]:
    """Normalize a language filter to a Steam language key, or return None.

    The chat UI sends locale codes like "en" for response language. We only
    apply a language filter when the value matches a Steam review language.
    """
    if not language:
        return None
    lang = str(language).strip().lower()
    if not lang or lang == "all":
        return None
    return lang if lang in STEAM_LANGUAGES else None


def _resolve_language_filter(params: Dict[str, Any], context: "AgentContext") -> Optional[str]:
    """Return the effective review-language filter from params/context."""
    if "language" in params:
        return _normalize_language_filter(params.get("language"))
    return _normalize_language_filter(getattr(context, "language", None))


def disambiguate_subcategory(
    query: str,
    analysis_subcategories: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Disambiguate a subcategory query and return matches.

    Args:
        query: User's subcategory query (e.g., "bugs", "technical/bugs", "performance")
        analysis_subcategories: Subcategories actually present in the game's analysis

    Returns:
        Dict with:
        - exact_match: str if exact full path match found
        - matches: list of matching full paths if multiple
        - error: str if no matches
    """
    query_lower = query.lower().strip()

    # 1. Check for exact full path match
    if query_lower in ALL_VALID_SUBCATEGORY_PATHS:
        # Validate against analysis if provided
        if analysis_subcategories:
            analysis_lower = [s.lower() for s in analysis_subcategories]
            if query_lower in analysis_lower:
                return {"exact_match": query_lower, "matches": [query_lower]}
            # Exact path but not in analysis
            return {
                "error": f"'{query}' is a valid subcategory but no reviews mention it in this game.",
                "matches": [],
                "suggestion": "Try a broader category or check available topics."
            }
        return {"exact_match": query_lower, "matches": [query_lower]}

    # 2. Check aliases for common short terms
    if query_lower in SUBCATEGORY_ALIASES:
        matches = SUBCATEGORY_ALIASES[query_lower]
        # Filter to those in analysis if provided
        if analysis_subcategories:
            analysis_lower = [s.lower() for s in analysis_subcategories]
            matches = [m for m in matches if m in analysis_lower]
        if len(matches) == 1:
            return {"exact_match": matches[0], "matches": matches}
        elif matches:
            return {"matches": matches, "needs_clarification": True}
        # No matches in analysis
        return {
            "error": f"No reviews in this game mention topics related to '{query}'.",
            "matches": [],
        }

    # 3. Partial matching - find subcategories containing the query
    matches = []
    for path in ALL_VALID_SUBCATEGORY_PATHS:
        if query_lower in path:
            matches.append(path)

    # Filter to those in analysis if provided
    if analysis_subcategories and matches:
        analysis_lower = [s.lower() for s in analysis_subcategories]
        matches = [m for m in matches if m in analysis_lower]

    if len(matches) == 1:
        return {"exact_match": matches[0], "matches": matches}
    elif matches:
        return {"matches": matches, "needs_clarification": True}

    # 4. Try matching just the sub-part across all categories
    matches = []
    for main, subs in VALID_SUBCATEGORIES.items():
        for sub in subs:
            if query_lower == sub or query_lower in sub:
                matches.append(f"{main}/{sub}")

    if analysis_subcategories and matches:
        analysis_lower = [s.lower() for s in analysis_subcategories]
        matches = [m for m in matches if m in analysis_lower]

    if len(matches) == 1:
        return {"exact_match": matches[0], "matches": matches}
    elif matches:
        return {"matches": matches, "needs_clarification": True}

    return {
        "error": f"'{query}' doesn't match any known subcategory. "
                 f"Use format 'main/sub' like 'technical/bugs' or 'gameplay/difficulty'.",
        "matches": [],
        "available_categories": list(VALID_SUBCATEGORIES.keys())
    }


class ToolErrorCode(Enum):
    """Error codes for tool execution failures."""
    NO_GAME_CONTEXT = "no_game_context"  # No game selected - user should select one
    NO_ANALYSIS = "no_analysis"  # Game not analyzed yet
    INVALID_PARAMS = "invalid_params"  # Bad parameters - don't retry
    DATA_NOT_FOUND = "data_not_found"  # Requested data doesn't exist
    DB_ERROR = "db_error"  # Database error - may be transient
    UNKNOWN = "unknown"  # Unknown error


@dataclass
class ToolResult:
    """Result from tool execution with error classification."""
    data: Dict[str, Any]
    success: bool = True
    error_code: Optional[ToolErrorCode] = None
    error_message: Optional[str] = None
    retryable: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for agent loop."""
        if self.success:
            return self.data
        return {
            **self.data,
            "error": self.error_message or "Unknown error",
            "error_code": self.error_code.value if self.error_code else "unknown",
            "retryable": self.retryable,
        }


def _make_error(
    error_code: ToolErrorCode,
    message: str,
    retryable: bool = False,
    **extra_data
) -> ToolResult:
    """Create a standardized error result."""
    return ToolResult(
        data=extra_data,
        success=False,
        error_code=error_code,
        error_message=message,
        retryable=retryable,
    )


class ToolParameter(BaseModel):
    """Schema for a tool parameter."""
    name: str
    type: str
    description: str
    required: bool = True


class Tool(BaseModel):
    """Definition of a tool the LLM can call."""
    name: str
    description: str
    parameters: Dict[str, str]


# Tool definitions for the chat agent
CHAT_TOOLS = [
    Tool(
        name="suggest_search_game",
        description="Suggest the user to search for a game. Use this when user asks about a game that is NOT in their starred games list. Shows a button to go to the home page and search.",
        parameters={
            "game_name": "str - The game name the user mentioned (required)",
            "message": "str - Message explaining the game wasn't found (required)",
        }
    ),
    Tool(
        name="get_game_overview",
        description="Get overall game statistics including total reviews, recommendation rate, top categories breakdown. Use this for general questions about game reception or recommendation rate.",
        parameters={
            "app_id": "int - Game ID (required)",
        }
    ),
    Tool(
        name="search_reviews",
        description="Get actual review text/quotes ordered by helpfulness (votes_up). Use this when: (1) user asks 'what do they say specifically?' or wants examples, (2) user asks about keywords/topics that aren't standard categories (e.g., 'AI', 'Steam Deck', 'co-op'), (3) you want to find what players mention about a specific term. Returns review snippets (up to 500 chars each). You can pass BOTH 'query' AND 'subcategory' to get comprehensive results combining classified reviews and keyword matches.",
        parameters={
            "app_id": "int - Game ID (required)",
            "query": "str - Search keywords like 'AI', 'steam deck', 'multiplayer'. Can be used together with subcategory for comprehensive search (optional)",
            "subcategory": "str - Filter by classified category like 'monetization_value/pay_to_win_grind' or 'gameplay/ai'. Can be used together with query for comprehensive search (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "limit": "int - Max results, default 10, max 100 (optional)",
            "offset": "int - Number of results to skip for pagination (optional)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="get_subcategory_stats",
        description="Get statistics for a SPECIFIC subcategory path. Only use for drilling into specific topics like 'technical/performance' or 'gameplay/balance'.",
        parameters={
            "app_id": "int - Game ID (required)",
            "subcategory": "str - FULL subcategory path like 'gameplay/difficulty' or 'technical/bugs'. Must be in format 'main/sub' (required)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="get_top_issues",
        description="Get the top N issues/complaints for a game ranked by frequency. Returns subcategories with highest issue counts.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of issues to return, default 10 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="get_feature_requests",
        description="Get the most requested features for a game, sorted by request count.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of requests to return, default 10 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="list_available_topics",
        description="List subcategories available in the game's analysis. Use when user asks what topics are available or to help pick a subcategory.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Max topics to return, default 20 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="get_top_praises",
        description="Get the most common positive themes (non-issue, non-request mentions) for a game.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of themes to return, default 10 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
            "date_filter": "str - One of '30d', '90d', '365d', or 'all' (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
        }
    ),
    Tool(
        name="compare_time_windows",
        description="Compare changes between two consecutive time windows for issues/requests/praises or specific subcategories.",
        parameters={
            "app_id": "int - Game ID (required)",
            "metric": "str - One of 'issues', 'requests', 'praises', or 'topics' (required)",
            "window_days": "int - Size of each window in days (e.g., 30) (required)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
            "subcategory": "str - Specific subcategory to compare (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "language": "str - Filter by review language (e.g., 'english', 'german') (optional)",
            "limit": "int - Max items to return, default 10 (optional)",
        }
    ),
    Tool(
        name="compare_sentiment_trend",
        description="Compare sentiment trends between two games over the last N weeks.",
        parameters={
            "app_id_1": "int - First game ID (required)",
            "app_id_2": "int - Second game ID (required)",
            "weeks": "int - Number of weeks to include, default 12 (optional)",
        }
    ),
    Tool(
        name="get_sentiment_trend",
        description="Get weekly sentiment trend showing recommendation rate over time.",
        parameters={
            "app_id": "int - Game ID (required)",
            "subcategory": "str - Filter by subcategory (optional)",
            "weeks": "int - Number of weeks to analyze, default 12 (optional)",
        }
    ),
    Tool(
        name="compare_games",
        description="Compare a metric between two games. Use for comparative analysis.",
        parameters={
            "app_id_1": "int - First game ID (required)",
            "app_id_2": "int - Second game ID (required)",
            "metric": "str - One of 'issues', 'sentiment', 'features', or 'subcategory' (required)",
            "subcategory": "str - Required if metric='subcategory' (optional)",
        }
    ),
    Tool(
        name="clarify_question",
        description="Ask user to clarify an ambiguous question. Use when the user's intent is unclear or could be interpreted multiple ways.",
        parameters={
            "options": "list[str] - 2-4 clarification options to present to the user (required)",
            "context": "str - Brief explanation of why clarification is needed (required)",
        }
    ),
    Tool(
        name="final_answer",
        description="Provide the final response to the user. MUST be called to complete the conversation turn. Supports markdown formatting and chart JSON.",
        parameters={
            "response": "str - The answer to the user's question, supports markdown and ```chart blocks (required)",
            "citations": "list[str] - List of review IDs to cite as evidence (optional)",
        }
    ),
]


def get_tools_schema() -> List[Dict[str, Any]]:
    """Convert tool definitions to a schema format for the LLM."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        }
        for tool in CHAT_TOOLS
    ]


def format_tools_for_gemini() -> List[Dict[str, Any]]:
    """Format tools as Gemini function declarations."""
    function_declarations = []

    for tool in CHAT_TOOLS:
        # Parse parameter descriptions into proper schema
        properties = {}
        required = []

        for param_name, param_desc in tool.parameters.items():
            # Parse "type - description (optional)" format
            parts = param_desc.split(" - ", 1)
            param_type = parts[0].strip()
            description = parts[1] if len(parts) > 1 else ""

            is_optional = "(optional)" in description.lower()
            description = description.replace("(optional)", "").replace("(required)", "").strip()

            # Convert type strings to JSON schema types
            json_type = "string"
            items: Optional[Dict[str, Any]] = None

            normalized_type = param_type.strip().lower()

            if normalized_type.startswith("int") or normalized_type == "integer":
                json_type = "integer"
            elif normalized_type.startswith("float") or normalized_type.startswith("number"):
                json_type = "number"
            elif normalized_type.startswith("bool") or normalized_type == "boolean":
                json_type = "boolean"
            elif normalized_type.startswith("list"):
                json_type = "array"

                item_type = "string"
                if "[" in normalized_type and "]" in normalized_type:
                    inner = normalized_type.split("[", 1)[1].rsplit("]", 1)[0].strip()
                    if inner in {"int", "integer"}:
                        item_type = "integer"
                    elif inner in {"float", "number"}:
                        item_type = "number"
                    elif inner in {"dict", "object", "map"}:
                        item_type = "object"
                    elif inner in {"str", "string"}:
                        item_type = "string"

                items = {"type": item_type}

            prop = {"type": json_type, "description": description}
            if items is not None:
                prop["items"] = items

            properties[param_name] = prop

            if not is_optional:
                required.append(param_name)

        function_declarations.append({
            "name": tool.name,
            "description": tool.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            }
        })

    return function_declarations


# Tools that benefit from caching (read-only, deterministic)
CACHEABLE_TOOLS = {
    "get_game_overview",
    "get_top_issues",
    "get_feature_requests",
    "list_available_topics",
    "get_top_praises",
    "get_sentiment_trend",
    "get_subcategory_stats",
    "compare_games",
    "compare_sentiment_trend",
}

# Tools where cache should vary by date filter
DATE_FILTER_SENSITIVE_TOOLS = {
    "get_top_issues",
    "get_feature_requests",
    "get_top_praises",
    "list_available_topics",
    "compare_time_windows",
}

# Tools where cache should vary by language
LANGUAGE_SENSITIVE_TOOLS = {
    "get_top_issues",
    "get_feature_requests",
    "get_top_praises",
    "list_available_topics",
    "compare_time_windows",
}

# Tools that should NOT be cached (may have different results or side effects)
NON_CACHEABLE_TOOLS = {
    "search_reviews",  # May want fresh results
    "suggest_search_game",
    "clarify_question",
    "final_answer",
}


def execute_tool(tool_name: str, params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute a tool and return results.

    Args:
        tool_name: Name of the tool to execute
        params: Parameters for the tool
        context: Agent context with user_id, session_id, app_ids, etc.

    Returns:
        Dict with tool results, or special keys like 'final', 'needs_clarification'.
        On error, includes 'error', 'error_code', and 'retryable' keys.
    """
    from . import storage

    logger.info(f"Executing tool: {tool_name} with params: {params}")

    # Check cache for cacheable tools
    cache_key = None
    if tool_name in CACHEABLE_TOOLS:
        # Build context key from user_id and app_ids
        context_key = f"{context.user_id}:{','.join(map(str, context.app_ids))}"
        cache_params = dict(params)
        if tool_name in DATE_FILTER_SENSITIVE_TOOLS and "date_filter" not in cache_params:
            cache_params["_date_filter"] = getattr(context, "date_filter", "all") or "all"
        if tool_name in LANGUAGE_SENSITIVE_TOOLS and "language" not in cache_params:
            cache_params["_language"] = getattr(context, "language", None)
        cache_key = _make_cache_key(tool_name, cache_params, context_key)

        cached = _get_cached_result(cache_key)
        if cached is not None:
            logger.info(f"Returning cached result for {tool_name}")
            # Add marker that this was cached
            cached["_cached"] = True
            return cached

    try:
        result: Optional[ToolResult] = None

        if tool_name == "suggest_search_game":
            return _execute_suggest_search_game(params, context)

        elif tool_name == "get_game_overview":
            result = _execute_get_game_overview(params, context)

        elif tool_name == "search_reviews":
            result = _execute_search_reviews(params, context)

        elif tool_name == "get_subcategory_stats":
            result = _execute_get_subcategory_stats(params, context)

        elif tool_name == "get_top_issues":
            result = _execute_get_top_issues(params, context)

        elif tool_name == "get_feature_requests":
            result = _execute_get_feature_requests(params, context)

        elif tool_name == "list_available_topics":
            result = _execute_list_available_topics(params, context)

        elif tool_name == "get_top_praises":
            result = _execute_get_top_praises(params, context)

        elif tool_name == "compare_time_windows":
            result = _execute_compare_time_windows(params, context)

        elif tool_name == "compare_sentiment_trend":
            result = _execute_compare_sentiment_trend(params, context)

        elif tool_name == "get_sentiment_trend":
            result = _execute_get_sentiment_trend(params, context)

        elif tool_name == "compare_games":
            result = _execute_compare_games(params, context)

        elif tool_name == "clarify_question":
            return {
                "needs_clarification": True,
                "options": params.get("options", []),
                "context": params.get("context", ""),
            }

        elif tool_name == "final_answer":
            return {
                "final": True,
                "response": params.get("response", ""),
                "citations": params.get("citations", []),
            }

        else:
            logger.warning(f"Unknown tool: {tool_name}")
            return _make_error(
                ToolErrorCode.INVALID_PARAMS,
                f"Unknown tool: {tool_name}",
                retryable=False
            ).to_dict()

        # Convert ToolResult to dict if we got one
        if result is not None:
            result_dict = result.to_dict() if isinstance(result, ToolResult) else result

            # Cache successful results for cacheable tools
            if cache_key is not None and not result_dict.get("error"):
                _set_cached_result(cache_key, result_dict)

            return result_dict

        return {"error": "Tool returned no result", "error_code": "unknown", "retryable": False}

    except Exception as e:
        # Log full stack trace for debugging
        logger.error(f"Tool execution failed: {tool_name}")
        logger.error(f"Parameters: {params}")
        logger.error(f"Stack trace:\n{traceback.format_exc()}")

        return _make_error(
            ToolErrorCode.UNKNOWN,
            str(e),
            retryable=True  # Unknown errors may be transient
        ).to_dict()


def _execute_suggest_search_game(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute suggest_search_game tool - suggests user to search for a game."""
    game_name = params.get("game_name", "the game")
    message = params.get("message", f"I couldn't find '{game_name}' in your starred games.")

    return {
        "suggest_search": True,
        "game_name": game_name,
        "message": message,
    }


def _execute_get_game_overview(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_game_overview tool - returns overall game stats."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id:
        if context.app_ids:
            app_id = context.app_ids[0]
        else:
            return _make_error(
                ToolErrorCode.NO_GAME_CONTEXT,
                "No app_id specified and no game context available. Please select a game first.",
                retryable=False
            )

    app_id = int(app_id)
    game_name = context.game_names.get(app_id, f"Game {app_id}")

    # Get overall stats from stored analysis
    try:
        analysis = storage.load_analysis_result(context.user_id, app_id)
        if not analysis or not analysis.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                f"No analysis data found for {game_name}. Please analyze the game first.",
                retryable=False,
                game_name=game_name,
                app_id=app_id
            )

        insights = analysis.get("insights", {})
        metadata = analysis.get("metadata", {})

        # Extract key stats from correct locations
        # Total reviews from metrics, metadata, or count reviews list
        metrics = insights.get("metrics", {})
        reviews_list = analysis.get("reviews", [])
        total_reviews = (
            metrics.get("total_reviews", 0) or
            metadata.get("total_reviews", 0) or
            len(reviews_list) if reviews_list else 0
        )

        # Recommendation rate is a float 0-1 stored directly in insights
        recommendation = insights.get("recommendation", 0)
        if isinstance(recommendation, (int, float)):
            recommendation_rate_pct = round(float(recommendation) * 100, 1)
        else:
            recommendation_rate_pct = 0

        # Calculate positive/negative - count from reviews if available, else estimate
        if reviews_list:
            positive_count = sum(1 for r in reviews_list if r.get("voted_up", False))
            negative_count = total_reviews - positive_count
        else:
            positive_count = int(total_reviews * recommendation) if total_reviews and recommendation else 0
            negative_count = total_reviews - positive_count

        # Get category breakdown from category_recommendation_rates
        cat_rates = insights.get("category_recommendation_rates", {})
        category_breakdown = []
        for cat_name, cat_data in sorted(cat_rates.items(), key=lambda x: x[1].get("count", 0), reverse=True)[:6]:
            category_breakdown.append({
                "category": cat_name,
                "review_count": cat_data.get("count", 0),
                "recommendation_rate": round(cat_data.get("rate", 0) * 100, 1),
            })

        return ToolResult(data={
            "game_name": game_name,
            "app_id": app_id,
            "total_reviews": total_reviews,
            "recommendation_rate": recommendation_rate_pct,
            "positive_reviews": positive_count,
            "negative_reviews": negative_count,
            "category_breakdown": category_breakdown,
        })
    except Exception as e:
        logger.exception(f"Failed to get game overview for {app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load game data: {str(e)}",
            retryable=True,
            game_name=game_name,
            app_id=app_id
        )


def _execute_search_reviews(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute search_reviews tool with subcategory disambiguation."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id:
        # Use first app from context if not specified
        if context.app_ids:
            app_id = context.app_ids[0]
        else:
            return _make_error(
                ToolErrorCode.NO_GAME_CONTEXT,
                "No app_id specified and no game context available. Please select a game first.",
                retryable=False
            )

    query = params.get("query", "")
    subcategory = params.get("subcategory")
    sentiment = params.get("sentiment")
    requested_limit = params.get("limit", 10)
    requested_offset = params.get("offset", 0)
    default_limit = getattr(context, "max_reviews_per_game", 50) or 50
    try:
        requested_limit_int = int(requested_limit) if requested_limit is not None else int(default_limit)
    except (TypeError, ValueError):
        requested_limit_int = int(default_limit)
    limit = max(1, min(requested_limit_int, int(default_limit), 50))  # Hard cap at 50 for agent queries

    try:
        offset = int(requested_offset or 0)
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)

    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    language = _resolve_language_filter(params, context)

    try:
        # Disambiguate subcategory if provided
        resolved_subcategory = None
        if subcategory:
            # Get analysis to know available subcategories
            result = storage.load_analysis_result(context.user_id, int(app_id))
            analysis_subcategories = []
            if result and result.get("insights"):
                insights = result.get("insights", {})
                analysis_subcategories = [
                    e.get("subcategory", "")
                    for e in insights.get("subcategory_insights", [])
                ]

            disambiguation = disambiguate_subcategory(subcategory, analysis_subcategories)

            if disambiguation.get("needs_clarification"):
                matches = disambiguation.get("matches", [])
                return ToolResult(data={
                    "needs_clarification": True,
                    "options": matches,
                    "context": (
                        f"'{subcategory}' matches multiple subcategories. Please choose one.\n"
                        "Tip: use the full path like 'technical/bugs' or 'gameplay/difficulty'."
                    ),
                })

            if disambiguation.get("error"):
                # Try to search anyway with the original term
                logger.warning(f"Subcategory disambiguation failed: {disambiguation.get('error')}")
                resolved_subcategory = subcategory
            else:
                resolved_subcategory = disambiguation.get("exact_match", subcategory)

        fetch_limit = limit + 1

        # Search reviews - combine subcategory and keyword results if both provided
        reviews = []
        seen_ids = set()

        # First, get reviews by subcategory if specified
        if resolved_subcategory:
            subcategory_reviews = storage.get_reviews_by_subcategory(
                app_id=int(app_id),
                subcategory=resolved_subcategory,
                date_filter=date_filter,
                limit=int(fetch_limit),
                offset=offset,
                sentiment=sentiment,
                language=language,
            )
            for review in subcategory_reviews:
                review_id = review.get("recommendationid") or review.get("review_id")
                if review_id and review_id not in seen_ids:
                    reviews.append(review)
                    seen_ids.add(review_id)

        # Then, add keyword search results if query is provided
        if query:
            # If we have subcategory results, fetch extra to compensate for duplicates
            keyword_limit = fetch_limit if not resolved_subcategory else fetch_limit * 2
            keyword_reviews = storage.search_reviews_with_date_filter(
                app_id=int(app_id),
                query=query,
                date_filter=date_filter,
                limit=int(keyword_limit),
                offset=offset,
                sentiment=sentiment,
                language=language,
            )
            for review in keyword_reviews:
                review_id = review.get("recommendationid") or review.get("review_id")
                if review_id and review_id not in seen_ids:
                    reviews.append(review)
                    seen_ids.add(review_id)
                if len(reviews) >= fetch_limit:
                    break

        # If neither subcategory nor query, just get top helpful reviews
        if not resolved_subcategory and not query:
            reviews = storage.search_reviews_with_date_filter(
                app_id=int(app_id),
                query="",
                date_filter=date_filter,
                limit=int(fetch_limit),
                offset=offset,
                sentiment=sentiment,
                language=language,
            )

        # Always sort by helpfulness (votes_up) to return the most helpful reviews
        reviews.sort(key=lambda r: r.get("votes_up", 0), reverse=True)

        has_more = len(reviews) > limit
        if has_more:
            reviews = reviews[:limit]
        next_offset = offset + len(reviews) if has_more else None

        # Format results
        return ToolResult(data={
            "reviews": [
                {
                    "review_id": str(r.get("recommendationid") or r.get("review_id") or ""),
                    "text": (r.get("review") or "")[:500],
                    "sentiment": "positive" if r.get("voted_up") else "negative",
                    "votes_up": r.get("votes_up", 0),
                    "playtime_hours": (r.get("author", {}).get("playtime_forever", 0) or 0) / 60,
                }
                for r in reviews[:limit]
            ],
            "total_found": len(reviews),
            "resolved_subcategory": resolved_subcategory,  # Include for transparency
            "offset": offset,
            "has_more": has_more,
            "next_offset": next_offset,
        })
    except Exception as e:
        logger.exception(f"Failed to search reviews for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to search reviews: {str(e)}",
            retryable=True
        )


def _execute_get_subcategory_stats(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_subcategory_stats tool with subcategory disambiguation."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    subcategory = params.get("subcategory")
    if not subcategory:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "subcategory parameter is required. Use format 'main/sub' like 'technical/performance'.",
            retryable=False
        )

    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    language = _resolve_language_filter(params, context)
    sentiment = params.get("sentiment")

    try:
        # Load analysis result to get subcategory insights
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        subcategory_insights = insights.get("subcategory_insights", [])

        # Get list of subcategories in this analysis
        analysis_subcategories = [e.get("subcategory", "") for e in subcategory_insights]

        # Disambiguate the subcategory
        disambiguation = disambiguate_subcategory(subcategory, analysis_subcategories)

        if disambiguation.get("error"):
            return _make_error(
                ToolErrorCode.DATA_NOT_FOUND,
                disambiguation["error"],
                retryable=False,
                requested_subcategory=subcategory,
                available_subcategories=analysis_subcategories[:15]
            )

        if disambiguation.get("needs_clarification"):
            matches = disambiguation.get("matches", [])
            return ToolResult(data={
                "needs_clarification": True,
                "options": matches,
                "context": (
                    f"'{subcategory}' matches multiple subcategories. Please choose one.\n"
                    "Tip: use the full path like 'technical/bugs' or 'gameplay/difficulty'."
                ),
            })

        # Get the resolved subcategory
        resolved = disambiguation.get("exact_match", subcategory)

        # If filters are requested, compute stats from label counts
        if (date_filter and date_filter != "all") or language or sentiment:
            total_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="subcategories",
                date_filter=date_filter,
                subcategories=[resolved],
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            issue_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="issue_subcategories",
                date_filter=date_filter,
                subcategories=[resolved],
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            request_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="request_subcategories",
                date_filter=date_filter,
                subcategories=[resolved],
                limit=None,
                sentiment=sentiment,
                language=language,
            )

            total_entry = total_counts[0] if total_counts else {}
            issue_entry = issue_counts[0] if issue_counts else {}
            request_entry = request_counts[0] if request_counts else {}

            count = int(total_entry.get("count", 0) or 0)
            positive_count = int(total_entry.get("positive_count", 0) or 0)
            recommendation_rate = (positive_count / count) if count else 0.0

            return ToolResult(data={
                "subcategory": resolved,
                "count": count,
                "recommendation_rate": recommendation_rate,
                "issue_count": int(issue_entry.get("count", 0) or 0),
                "request_count": int(request_entry.get("count", 0) or 0),
                "date_filter": date_filter if date_filter != "all" else None,
                "language": language,
                "sentiment": sentiment,
            })

        # Find the matching entry in insights
        resolved_lower = resolved.lower()
        for entry in subcategory_insights:
            entry_subcat = entry.get("subcategory", "").lower()
            if entry_subcat == resolved_lower:
                return ToolResult(data={
                    "subcategory": entry.get("subcategory"),
                    "count": entry.get("count", 0),
                    "recommendation_rate": entry.get("recommendation_rate", 0),
                    "issue_count": entry.get("issue_count", 0),
                    "request_count": entry.get("request_count", 0),
                })

        # Fallback - shouldn't reach here if disambiguation worked
        return _make_error(
            ToolErrorCode.DATA_NOT_FOUND,
            f"Subcategory '{subcategory}' not found in analysis results.",
            retryable=False,
            requested_subcategory=subcategory,
            available_subcategories=analysis_subcategories[:15]
        )
    except Exception as e:
        logger.exception(f"Failed to get subcategory stats for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load subcategory stats: {str(e)}",
            retryable=True
        )


def _execute_get_top_issues(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_top_issues tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    limit_param = params.get("limit", 10)
    try:
        limit = int(limit_param) if limit_param is not None else 10
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    category_filter = params.get("category")
    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    sentiment = params.get("sentiment")
    language = _resolve_language_filter(params, context)

    try:
        game_name = context.game_names.get(int(app_id), f"Game {app_id}")

        if (date_filter and date_filter != "all") or sentiment or language:
            issue_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="issue_subcategories",
                date_filter=date_filter,
                category=category_filter,
                limit=limit,
                sentiment=sentiment,
                language=language,
            )

            if not issue_counts:
                return ToolResult(data={
                    "game_name": game_name,
                    "date_filter": date_filter,
                    "note": "No issue data found for this time window.",
                    "issues": [],
                })

            subcats = [i.get("subcategory") for i in issue_counts if i.get("subcategory")]
            total_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="subcategories",
                date_filter=date_filter,
                subcategories=subcats,
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            total_map = {t.get("subcategory", "").lower(): t for t in total_counts}

            issues = []
            for i, issue in enumerate(issue_counts):
                subcat = issue.get("subcategory")
                total_entry = total_map.get((subcat or "").lower(), {})
                total_count = int(total_entry.get("count", 0) or 0)
                positive_count = int(total_entry.get("positive_count", 0) or 0)
                rec_rate_pct = round((positive_count / total_count) * 100, 1) if total_count else 0.0

                issues.append({
                    "rank": i + 1,
                    "subcategory": subcat,
                    "complaint_count": int(issue.get("count", 0) or 0),
                    "recommendation_rate_pct": rec_rate_pct,
                    "total_count": total_count,
                })

            return ToolResult(data={
                "game_name": game_name,
                "date_filter": date_filter if date_filter != "all" else None,
                "language": language,
                "sentiment": sentiment,
                "note": "Sorted by complaint_count within the selected filters.",
                "issues": issues,
            })

        # Default: all-time analysis stats
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        subcategory_insights = insights.get("subcategory_insights", [])

        # Filter by main category if specified
        if category_filter:
            category_filter = category_filter.lower()
            subcategory_insights = [
                s for s in subcategory_insights
                if s.get("subcategory", "").lower().startswith(category_filter)
            ]

        # Sort by issue_count (complaints) descending
        sorted_issues = sorted(
            subcategory_insights,
            key=lambda x: x.get("issue_count", 0),
            reverse=True
        )

        # Filter to only those with issues
        sorted_issues = [s for s in sorted_issues if s.get("issue_count", 0) > 0]

        return ToolResult(data={
            "game_name": game_name,
            "note": "Sorted by complaint_count (number of negative reviews mentioning this as an issue). Display complaint_count as the main number.",
            "issues": [
                {
                    "rank": i + 1,
                    "subcategory": s.get("subcategory"),
                    "complaint_count": s.get("issue_count", 0),
                    "recommendation_rate_pct": round(s.get("recommendation_rate", 0) * 100, 1),
                }
                for i, s in enumerate(sorted_issues[:limit])
            ]
        })
    except Exception as e:
        logger.exception(f"Failed to get top issues for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load issues: {str(e)}",
            retryable=True
        )


def _execute_get_feature_requests(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_feature_requests tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    limit_param = params.get("limit", 10)
    try:
        limit = int(limit_param) if limit_param is not None else 10
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    category_filter = params.get("category")
    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    sentiment = params.get("sentiment")
    language = _resolve_language_filter(params, context)

    try:
        if (date_filter and date_filter != "all") or sentiment or language:
            request_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="request_subcategories",
                date_filter=date_filter,
                category=category_filter,
                limit=limit,
                sentiment=sentiment,
                language=language,
            )

            if not request_counts:
                return ToolResult(data={
                    "date_filter": date_filter,
                    "feature_requests": [],
                    "note": "No feature request data found for this time window.",
                })

            subcats = [r.get("subcategory") for r in request_counts if r.get("subcategory")]
            total_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="subcategories",
                date_filter=date_filter,
                subcategories=subcats,
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            total_map = {t.get("subcategory", "").lower(): t for t in total_counts}

            feature_requests = []
            for req in request_counts:
                subcat = req.get("subcategory")
                total_entry = total_map.get((subcat or "").lower(), {})
                total_count = int(total_entry.get("count", 0) or 0)
                positive_count = int(total_entry.get("positive_count", 0) or 0)
                rec_rate = (positive_count / total_count) if total_count else 0.0

                feature_requests.append({
                    "subcategory": subcat,
                    "request_count": int(req.get("count", 0) or 0),
                    "total_count": total_count,
                    "recommendation_rate": rec_rate,
                })

            return ToolResult(data={
                "date_filter": date_filter if date_filter != "all" else None,
                "language": language,
                "sentiment": sentiment,
                "feature_requests": feature_requests,
            })

        # Default: all-time analysis stats
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        subcategory_insights = insights.get("subcategory_insights", [])

        # Sort by request_count descending
        sorted_requests = sorted(
            subcategory_insights,
            key=lambda x: x.get("request_count", 0),
            reverse=True
        )

        # Filter to only those with requests
        sorted_requests = [s for s in sorted_requests if s.get("request_count", 0) > 0]

        # Filter by main category if specified
        if category_filter:
            category_filter = category_filter.lower()
            sorted_requests = [
                s for s in sorted_requests
                if s.get("subcategory", "").lower().startswith(category_filter)
            ]

        return ToolResult(data={
            "feature_requests": [
                {
                    "subcategory": s.get("subcategory"),
                    "request_count": s.get("request_count", 0),
                    "total_count": s.get("count", 0),
                    "recommendation_rate": s.get("recommendation_rate", 0),
                }
                for s in sorted_requests[:limit]
            ]
        })
    except Exception as e:
        logger.exception(f"Failed to get feature requests for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load feature requests: {str(e)}",
            retryable=True
        )


def _execute_list_available_topics(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute list_available_topics tool - list subcategories present in analysis."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    limit_param = params.get("limit", 20)
    try:
        limit = int(limit_param) if limit_param is not None else 20
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))

    category = (params.get("category") or "").strip().lower()
    category_prefix = f"{category}/" if category else ""
    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    sentiment = params.get("sentiment")
    language = _resolve_language_filter(params, context)

    try:
        if (date_filter and date_filter != "all") or sentiment or language:
            counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="subcategories",
                date_filter=date_filter,
                category=category or None,
                limit=limit,
                sentiment=sentiment,
                language=language,
            )

            if not counts:
                return ToolResult(data={
                    "topics": [],
                    "total_topics": 0,
                    "categories": [],
                    "category_filter": category or None,
                    "date_filter": date_filter if date_filter != "all" else None,
                    "language": language,
                    "sentiment": sentiment,
                })

            topics = []
            categories_present = set()
            for entry in counts:
                subcat = entry.get("subcategory") or ""
                if not subcat:
                    continue
                subcat_lower = subcat.lower()
                if category_prefix and not subcat_lower.startswith(category_prefix):
                    continue
                main_category = subcat_lower.split("/", 1)[0]
                if main_category:
                    categories_present.add(main_category)
                count = int(entry.get("count", 0) or 0)
                positive_count = int(entry.get("positive_count", 0) or 0)
                rec_rate = (positive_count / count) if count else 0.0
                topics.append({
                    "subcategory": subcat,
                    "count": count,
                    "issue_count": None,
                    "request_count": None,
                    "recommendation_rate": rec_rate,
                })

            topics.sort(key=lambda x: x.get("count", 0), reverse=True)
            limited_topics = topics[:limit]

            return ToolResult(data={
                "topics": limited_topics,
                "total_topics": len(topics),
                "categories": sorted(categories_present),
                "category_filter": category or None,
                "date_filter": date_filter if date_filter != "all" else None,
                "language": language,
                "sentiment": sentiment,
            })

        # Default: all-time analysis stats
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        subcategory_insights = insights.get("subcategory_insights", []) or []

        topics = []
        categories_present = set()

        for entry in subcategory_insights:
            subcat = entry.get("subcategory") or ""
            if not subcat:
                continue
            subcat_lower = subcat.lower()
            if category_prefix and not subcat_lower.startswith(category_prefix):
                continue

            main_category = subcat_lower.split("/", 1)[0]
            if main_category:
                categories_present.add(main_category)

            topics.append({
                "subcategory": subcat,
                "count": int(entry.get("count", 0) or 0),
                "issue_count": int(entry.get("issue_count", 0) or 0),
                "request_count": int(entry.get("request_count", 0) or 0),
                "recommendation_rate": entry.get("recommendation_rate", 0),
            })

        topics.sort(key=lambda x: x.get("count", 0), reverse=True)
        limited_topics = topics[:limit]

        return ToolResult(data={
            "topics": limited_topics,
            "total_topics": len(topics),
            "categories": sorted(categories_present),
            "category_filter": category or None,
        })
    except Exception as e:
        logger.exception(f"Failed to list topics for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load topics: {str(e)}",
            retryable=True
        )


def _execute_get_top_praises(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_top_praises tool - most common positive themes."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    limit_param = params.get("limit", 10)
    try:
        limit = int(limit_param) if limit_param is not None else 10
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    category = (params.get("category") or "").strip().lower()
    category_prefix = f"{category}/" if category else ""
    date_filter = (params.get("date_filter") or getattr(context, "date_filter", "all") or "all")
    sentiment = params.get("sentiment")
    language = _resolve_language_filter(params, context)

    try:
        if (date_filter and date_filter != "all") or sentiment or language:
            total_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="subcategories",
                date_filter=date_filter,
                category=category or None,
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            issue_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="issue_subcategories",
                date_filter=date_filter,
                category=category or None,
                limit=None,
                sentiment=sentiment,
                language=language,
            )
            request_counts = storage.get_subcategory_label_counts(
                app_id=int(app_id),
                label_key="request_subcategories",
                date_filter=date_filter,
                category=category or None,
                limit=None,
                sentiment=sentiment,
                language=language,
            )

            issue_map = {i.get("subcategory", "").lower(): i for i in issue_counts}
            request_map = {r.get("subcategory", "").lower(): r for r in request_counts}

            praises = []
            for entry in total_counts:
                subcat = entry.get("subcategory") or ""
                if not subcat:
                    continue

                count = int(entry.get("count", 0) or 0)
                issue_count = int(issue_map.get(subcat.lower(), {}).get("count", 0) or 0)
                request_count = int(request_map.get(subcat.lower(), {}).get("count", 0) or 0)
                praise_count = max(count - issue_count - request_count, 0)
                praise_ratio = round(praise_count / count, 3) if count else 0.0
                positive_count = int(entry.get("positive_count", 0) or 0)
                recommendation_rate = (positive_count / count) if count else 0.0

                praises.append({
                    "subcategory": subcat,
                    "count": count,
                    "issue_count": issue_count,
                    "request_count": request_count,
                    "praise_count": praise_count,
                    "praise_ratio": praise_ratio,
                    "recommendation_rate": recommendation_rate,
                })

            praises.sort(
                key=lambda x: (x.get("praise_count", 0), x.get("recommendation_rate", 0), x.get("count", 0)),
                reverse=True,
            )

            return ToolResult(data={
                "praises": praises[:limit],
                "total_found": len(praises),
                "category_filter": category or None,
                "date_filter": date_filter if date_filter != "all" else None,
                "language": language,
                "sentiment": sentiment,
                "definition": "praise_count = count - issue_count - request_count (non-issue, non-request mentions)",
            })

        # Default: all-time analysis stats
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        subcategory_insights = insights.get("subcategory_insights", []) or []

        praises = []
        for entry in subcategory_insights:
            subcat = entry.get("subcategory") or ""
            if not subcat:
                continue
            subcat_lower = subcat.lower()
            if category_prefix and not subcat_lower.startswith(category_prefix):
                continue

            count = int(entry.get("count", 0) or 0)
            issue_count = int(entry.get("issue_count", 0) or 0)
            request_count = int(entry.get("request_count", 0) or 0)
            praise_count = max(count - issue_count - request_count, 0)
            praise_ratio = round(praise_count / count, 3) if count else 0.0

            praises.append({
                "subcategory": subcat,
                "count": count,
                "issue_count": issue_count,
                "request_count": request_count,
                "praise_count": praise_count,
                "praise_ratio": praise_ratio,
                "recommendation_rate": entry.get("recommendation_rate", 0),
            })

        praises.sort(
            key=lambda x: (x.get("praise_count", 0), x.get("recommendation_rate", 0), x.get("count", 0)),
            reverse=True,
        )

        return ToolResult(data={
            "praises": praises[:limit],
            "total_found": len(praises),
            "category_filter": category or None,
            "definition": "praise_count = count - issue_count - request_count (non-issue, non-request mentions)",
        })
    except Exception as e:
        logger.exception(f"Failed to get top praises for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load top praises: {str(e)}",
            retryable=True
        )


def _execute_compare_time_windows(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Compare changes between two consecutive time windows."""
    from . import storage
    import time

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    metric = (params.get("metric") or "").strip().lower()
    if metric not in {"issues", "requests", "praises", "topics"}:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "metric must be one of 'issues', 'requests', 'praises', or 'topics'.",
            retryable=False
        )

    window_days = params.get("window_days")
    try:
        window_days_int = int(window_days)
    except (TypeError, ValueError):
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "window_days must be an integer (e.g., 30).",
            retryable=False
        )
    if window_days_int <= 0 or window_days_int > 365:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "window_days must be between 1 and 365.",
            retryable=False
        )

    limit_param = params.get("limit", 10)
    try:
        limit = int(limit_param) if limit_param is not None else 10
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    category = params.get("category")
    sentiment = params.get("sentiment")
    language = _resolve_language_filter(params, context)

    subcategory = params.get("subcategory")
    if subcategory:
        # Try to resolve subcategory via analysis for robustness
        try:
            result = storage.load_analysis_result(context.user_id, int(app_id))
            analysis_subcategories = []
            if result and result.get("insights"):
                insights = result.get("insights", {})
                analysis_subcategories = [
                    e.get("subcategory", "")
                    for e in insights.get("subcategory_insights", [])
                ]
            disambiguation = disambiguate_subcategory(subcategory, analysis_subcategories)
            if disambiguation.get("exact_match"):
                subcategory = disambiguation["exact_match"]
        except Exception:
            pass

    now = int(time.time())
    window_seconds = window_days_int * 24 * 60 * 60
    current_start = now - window_seconds
    previous_start = now - (2 * window_seconds)
    previous_end = current_start

    def _count_range(label_key: str, subcats: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        return storage.get_subcategory_label_counts_range(
            app_id=int(app_id),
            label_key=label_key,
            start_ts=current_start,
            end_ts=now,
            category=category,
            limit=None if subcats else limit,
            subcategories=subcats,
            sentiment=sentiment,
            language=language,
        )

    def _count_prev_range(label_key: str, subcats: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        return storage.get_subcategory_label_counts_range(
            app_id=int(app_id),
            label_key=label_key,
            start_ts=previous_start,
            end_ts=previous_end,
            category=category,
            limit=None if subcats else limit,
            subcategories=subcats,
            sentiment=sentiment,
            language=language,
        )

    if metric == "praises":
        total_current = _count_range("subcategories")
        total_prev = _count_prev_range("subcategories")
        issue_current = _count_range("issue_subcategories")
        issue_prev = _count_prev_range("issue_subcategories")
        request_current = _count_range("request_subcategories")
        request_prev = _count_prev_range("request_subcategories")

        def _map_counts(items: List[Dict[str, Any]]) -> Dict[str, int]:
            return {i.get("subcategory", "").lower(): int(i.get("count", 0) or 0) for i in items}

        name_map: Dict[str, str] = {}
        for entry in total_current + total_prev:
            subcat_name = entry.get("subcategory")
            if subcat_name:
                name_map[subcat_name.lower()] = subcat_name

        total_map = _map_counts(total_current)
        total_prev_map = _map_counts(total_prev)
        issue_map = _map_counts(issue_current)
        issue_prev_map = _map_counts(issue_prev)
        request_map = _map_counts(request_current)
        request_prev_map = _map_counts(request_prev)

        subcats = set(total_map.keys()) | set(total_prev_map.keys())
        results = []
        for subcat_key in subcats:
            current_total = total_map.get(subcat_key, 0)
            prev_total = total_prev_map.get(subcat_key, 0)
            current_praise = max(current_total - issue_map.get(subcat_key, 0) - request_map.get(subcat_key, 0), 0)
            prev_praise = max(prev_total - issue_prev_map.get(subcat_key, 0) - request_prev_map.get(subcat_key, 0), 0)
            delta = current_praise - prev_praise
            delta_pct = round((delta / prev_praise) * 100, 1) if prev_praise else None
            if subcategory and subcat_key != subcategory.lower():
                continue
            results.append({
                "subcategory": name_map.get(subcat_key, subcat_key),
                "current_count": current_praise,
                "previous_count": prev_praise,
                "delta": delta,
                "delta_pct": delta_pct,
            })
    else:
        label_key = {
            "issues": "issue_subcategories",
            "requests": "request_subcategories",
            "topics": "subcategories",
        }[metric]

        subcats = [subcategory] if subcategory else None
        current_counts = _count_range(label_key, subcats=subcats)
        prev_counts = _count_prev_range(label_key, subcats=subcats)

        def _map(items: List[Dict[str, Any]]) -> Dict[str, int]:
            return {i.get("subcategory", "").lower(): int(i.get("count", 0) or 0) for i in items}

        name_map: Dict[str, str] = {}
        for entry in current_counts + prev_counts:
            subcat_name = entry.get("subcategory")
            if subcat_name:
                name_map[subcat_name.lower()] = subcat_name

        current_map = _map(current_counts)
        prev_map = _map(prev_counts)

        subcat_keys = set(current_map.keys()) | set(prev_map.keys())
        results = []
        for subcat_key in subcat_keys:
            if subcategory and subcat_key != subcategory.lower():
                continue
            current_count = current_map.get(subcat_key, 0)
            previous_count = prev_map.get(subcat_key, 0)
            delta = current_count - previous_count
            delta_pct = round((delta / previous_count) * 100, 1) if previous_count else None
            results.append({
                "subcategory": name_map.get(subcat_key, subcat_key),
                "current_count": current_count,
                "previous_count": previous_count,
                "delta": delta,
                "delta_pct": delta_pct,
            })

    # Sort by largest absolute delta
    results.sort(key=lambda x: abs(x.get("delta", 0)), reverse=True)
    results = results[:limit]

    return ToolResult(data={
        "metric": metric,
        "window_days": window_days_int,
        "current_window": {"start_ts": current_start, "end_ts": now},
        "previous_window": {"start_ts": previous_start, "end_ts": previous_end},
        "category_filter": category or None,
        "subcategory": subcategory,
        "sentiment": sentiment,
        "language": language,
        "results": results,
    })


def _execute_compare_sentiment_trend(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Compare sentiment trends between two games."""
    from . import storage

    app_id_1 = params.get("app_id_1")
    app_id_2 = params.get("app_id_2")
    if not app_id_1 or not app_id_2:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "Both app_id_1 and app_id_2 are required.",
            retryable=False
        )

    weeks_param = params.get("weeks", 12)
    try:
        weeks = int(weeks_param) if weeks_param is not None else 12
    except (TypeError, ValueError):
        weeks = 12
    weeks = max(1, min(weeks, 52))

    try:
        result_1 = storage.load_analysis_result(context.user_id, int(app_id_1))
        result_2 = storage.load_analysis_result(context.user_id, int(app_id_2))

        game_name_1 = context.game_names.get(int(app_id_1), f"Game {app_id_1}")
        game_name_2 = context.game_names.get(int(app_id_2), f"Game {app_id_2}")

        if not result_1 or not result_1.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                f"No analysis available for {game_name_1} (app_id={app_id_1}).",
                retryable=False,
                app_id=app_id_1
            )
        if not result_2 or not result_2.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                f"No analysis available for {game_name_2} (app_id={app_id_2}).",
                retryable=False,
                app_id=app_id_2
            )

        # The trend data is stored under "trend" (not "sentiment_trend")
        # with fields: period, recommendation_rate, avg_compound, reviews
        trend_1 = (result_1.get("insights", {}).get("trend") or [])[:weeks]
        trend_2 = (result_2.get("insights", {}).get("trend") or [])[:weeks]

        if not trend_1 or not trend_2:
            return _make_error(
                ToolErrorCode.DATA_NOT_FOUND,
                "Sentiment trend data is missing for one or both games.",
                retryable=False
            )

        # Map by period label for alignment
        map_1 = {t.get("period"): t for t in trend_1 if t.get("period")}
        map_2 = {t.get("period"): t for t in trend_2 if t.get("period")}
        weeks_aligned = [w for w in map_1.keys() if w in map_2]
        weeks_aligned = weeks_aligned[:weeks]

        trend = []
        sum_rate_1 = 0.0
        sum_rate_2 = 0.0
        count = 0
        for week in weeks_aligned:
            t1 = map_1.get(week, {})
            t2 = map_2.get(week, {})
            rate_1 = float(t1.get("recommendation_rate", 0) or 0)
            rate_2 = float(t2.get("recommendation_rate", 0) or 0)
            sum_rate_1 += rate_1
            sum_rate_2 += rate_2
            count += 1
            trend.append({
                "week": week,
                "game_1_rate": rate_1,
                "game_2_rate": rate_2,
                "game_1_count": t1.get("reviews", 0),
                "game_2_count": t2.get("reviews", 0),
            })

        avg_rate_1 = (sum_rate_1 / count) if count else 0.0
        avg_rate_2 = (sum_rate_2 / count) if count else 0.0
        higher = game_name_1 if avg_rate_1 > avg_rate_2 else game_name_2 if avg_rate_2 > avg_rate_1 else "tie"

        return ToolResult(data={
            "game_1": {"app_id": app_id_1, "name": game_name_1},
            "game_2": {"app_id": app_id_2, "name": game_name_2},
            "weeks": weeks,
            "trend": trend,
            "summary": {
                "average_rate_game_1": avg_rate_1,
                "average_rate_game_2": avg_rate_2,
                "higher_average": higher,
            }
        })
    except Exception as e:
        logger.exception("Failed to compare sentiment trends")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to compare sentiment trends: {str(e)}",
            retryable=True
        )


def _execute_get_sentiment_trend(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute get_sentiment_trend tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return _make_error(
            ToolErrorCode.NO_GAME_CONTEXT,
            "No app_id specified. Please select a game first.",
            retryable=False
        )

    weeks = params.get("weeks", 12)
    logger.info(f"get_sentiment_trend: app_id={app_id}, weeks={weeks}")

    try:
        # Load analysis result for sentiment trend
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            logger.warning(f"get_sentiment_trend: No analysis for app_id={app_id}")
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        # The trend data is stored under "trend" (not "sentiment_trend")
        # with fields: period, recommendation_rate, avg_compound, reviews
        sentiment_trend = insights.get("trend", [])
        logger.info(f"get_sentiment_trend: Found {len(sentiment_trend)} trend entries")

        if not sentiment_trend:
            logger.warning(f"get_sentiment_trend: No trend data for app_id={app_id}")
            return _make_error(
                ToolErrorCode.DATA_NOT_FOUND,
                "No sentiment trend data available. The game may not have enough reviews over time.",
                retryable=False,
                app_id=app_id
            )

        # Limit to requested weeks
        trend_data = sentiment_trend[:weeks]

        return ToolResult(data={
            "trend": [
                {
                    "week": entry.get("period"),
                    "recommendation_rate": entry.get("recommendation_rate", 0),
                    "count": entry.get("reviews", 0),
                }
                for entry in trend_data
            ]
        })
    except Exception as e:
        logger.exception(f"Failed to get sentiment trend for app_id={app_id}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load sentiment trend: {str(e)}",
            retryable=True
        )


def _execute_compare_games(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute compare_games tool."""
    from . import storage

    app_id_1 = params.get("app_id_1")
    app_id_2 = params.get("app_id_2")
    metric = params.get("metric")

    if not app_id_1 or not app_id_2:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "Both app_id_1 and app_id_2 are required for comparison.",
            retryable=False
        )

    if not metric:
        return _make_error(
            ToolErrorCode.INVALID_PARAMS,
            "metric parameter is required. Use 'issues', 'sentiment', 'features', or 'subcategory'.",
            retryable=False
        )

    try:
        # Load analysis results for both games
        result_1 = storage.load_analysis_result(context.user_id, int(app_id_1))
        result_2 = storage.load_analysis_result(context.user_id, int(app_id_2))

        game_name_1 = context.game_names.get(int(app_id_1), f"Game {app_id_1}")
        game_name_2 = context.game_names.get(int(app_id_2), f"Game {app_id_2}")

        if not result_1 or not result_1.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                f"No analysis available for {game_name_1} (app_id={app_id_1}). Please analyze this game first.",
                retryable=False,
                missing_game=game_name_1,
                app_id=app_id_1
            )
        if not result_2 or not result_2.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                f"No analysis available for {game_name_2} (app_id={app_id_2}). Please analyze this game first.",
                retryable=False,
                missing_game=game_name_2,
                app_id=app_id_2
            )

        insights_1 = result_1.get("insights", {})
        insights_2 = result_2.get("insights", {})

        if metric == "sentiment":
            # Compare overall recommendation rates
            split_1 = storage.get_recommendation_split(int(app_id_1))
            split_2 = storage.get_recommendation_split(int(app_id_2))

            rate_1 = (split_1["recommended"] / split_1["total"]) if split_1["total"] > 0 else 0
            rate_2 = (split_2["recommended"] / split_2["total"]) if split_2["total"] > 0 else 0

            return ToolResult(data={
                "comparison": {
                    "metric": "sentiment",
                    "game_1": {
                        "app_id": app_id_1,
                        "name": game_name_1,
                        "total_reviews": split_1["total"],
                        "recommendation_rate": rate_1,
                    },
                    "game_2": {
                        "app_id": app_id_2,
                        "name": game_name_2,
                        "total_reviews": split_2["total"],
                        "recommendation_rate": rate_2,
                    },
                    "differential": f"{game_name_1} has {'higher' if rate_1 > rate_2 else 'lower'} recommendation rate "
                                   f"({round(rate_1*100, 1)}% vs {round(rate_2*100, 1)}%)"
                }
            })

        elif metric == "issues":
            # Compare top issues
            subcats_1 = insights_1.get("subcategory_insights", [])
            subcats_2 = insights_2.get("subcategory_insights", [])

            issues_1 = sorted(subcats_1, key=lambda x: x.get("issue_count", 0), reverse=True)[:5]
            issues_2 = sorted(subcats_2, key=lambda x: x.get("issue_count", 0), reverse=True)[:5]

            total_issues_1 = sum(s.get("issue_count", 0) for s in subcats_1)
            total_issues_2 = sum(s.get("issue_count", 0) for s in subcats_2)

            return ToolResult(data={
                "comparison": {
                    "metric": "issues",
                    "game_1": {
                        "app_id": app_id_1,
                        "name": game_name_1,
                        "total_issues": total_issues_1,
                        "top_issues": [
                            {"subcategory": i.get("subcategory"), "count": i.get("issue_count", 0)}
                            for i in issues_1 if i.get("issue_count", 0) > 0
                        ],
                    },
                    "game_2": {
                        "app_id": app_id_2,
                        "name": game_name_2,
                        "total_issues": total_issues_2,
                        "top_issues": [
                            {"subcategory": i.get("subcategory"), "count": i.get("issue_count", 0)}
                            for i in issues_2 if i.get("issue_count", 0) > 0
                        ],
                    },
                    "differential": f"{game_name_1} has {round(total_issues_1/max(total_issues_2, 1), 1)}x the issues of {game_name_2}"
                                   if total_issues_1 > total_issues_2 else
                                   f"{game_name_2} has {round(total_issues_2/max(total_issues_1, 1), 1)}x the issues of {game_name_1}"
                }
            })

        elif metric == "features":
            # Compare top feature requests
            subcats_1 = insights_1.get("subcategory_insights", [])
            subcats_2 = insights_2.get("subcategory_insights", [])

            requests_1 = sorted(subcats_1, key=lambda x: x.get("request_count", 0), reverse=True)[:5]
            requests_2 = sorted(subcats_2, key=lambda x: x.get("request_count", 0), reverse=True)[:5]

            return ToolResult(data={
                "comparison": {
                    "metric": "features",
                    "game_1": {
                        "app_id": app_id_1,
                        "name": game_name_1,
                        "top_requests": [
                            {"subcategory": r.get("subcategory"), "count": r.get("request_count", 0)}
                            for r in requests_1 if r.get("request_count", 0) > 0
                        ],
                    },
                    "game_2": {
                        "app_id": app_id_2,
                        "name": game_name_2,
                        "top_requests": [
                            {"subcategory": r.get("subcategory"), "count": r.get("request_count", 0)}
                            for r in requests_2 if r.get("request_count", 0) > 0
                        ],
                    },
                }
            })

        elif metric == "subcategory":
            # Compare a specific subcategory
            subcategory = params.get("subcategory")
            if not subcategory:
                return _make_error(
                    ToolErrorCode.INVALID_PARAMS,
                    "subcategory parameter is required when metric='subcategory'.",
                    retryable=False
                )

            subcats_1 = {s.get("subcategory", "").lower(): s for s in insights_1.get("subcategory_insights", [])}
            subcats_2 = {s.get("subcategory", "").lower(): s for s in insights_2.get("subcategory_insights", [])}

            subcat_lower = subcategory.lower()
            entry_1 = subcats_1.get(subcat_lower, {})
            entry_2 = subcats_2.get(subcat_lower, {})

            return ToolResult(data={
                "comparison": {
                    "metric": "subcategory",
                    "subcategory": subcategory,
                    "game_1": {
                        "app_id": app_id_1,
                        "name": game_name_1,
                        "count": entry_1.get("count", 0),
                        "issue_count": entry_1.get("issue_count", 0),
                        "recommendation_rate": entry_1.get("recommendation_rate", 0),
                    },
                    "game_2": {
                        "app_id": app_id_2,
                        "name": game_name_2,
                        "count": entry_2.get("count", 0),
                        "issue_count": entry_2.get("issue_count", 0),
                        "recommendation_rate": entry_2.get("recommendation_rate", 0),
                    },
                }
            })

        else:
            return _make_error(
                ToolErrorCode.INVALID_PARAMS,
                f"Unknown metric: {metric}. Use 'issues', 'sentiment', 'features', or 'subcategory'.",
                retryable=False
            )

    except Exception as e:
        logger.exception(f"Failed to compare games {app_id_1} and {app_id_2}")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to compare games: {str(e)}",
            retryable=True
        )


def validate_evidence_quotes(
    response: str,
    tool_calls: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Validate that quoted text in response exists in actual review data.

    This helps detect LLM hallucination of review quotes.

    Args:
        response: The response text that may contain quotes
        tool_calls: Tool calls that retrieved review data

    Returns:
        Dict with 'valid_quotes', 'suspicious_quotes', and 'review_texts'
    """
    import re

    # Extract all quoted text from response (anything in quotes)
    quote_pattern = re.compile(r'"([^"]{10,200})"')  # Quotes between 10-200 chars
    quotes_in_response = quote_pattern.findall(response)

    if not quotes_in_response:
        return {"valid_quotes": [], "suspicious_quotes": [], "review_texts": []}

    # Gather all review texts from tool results
    review_texts = []
    for call in tool_calls:
        if call.get("tool") == "search_reviews":
            result = call.get("result", {})
            for review in result.get("reviews", []):
                text = review.get("text", "")
                if text:
                    review_texts.append(text.lower())

    if not review_texts:
        return {
            "valid_quotes": [],
            "suspicious_quotes": quotes_in_response,  # Can't validate without source
            "review_texts": [],
            "warning": "No source reviews to validate quotes against"
        }

    # Check each quote against review texts
    valid_quotes = []
    suspicious_quotes = []

    for quote in quotes_in_response:
        quote_lower = quote.lower()

        # Check if quote (or significant portion) appears in any review
        found = False
        for review_text in review_texts:
            # Exact match
            if quote_lower in review_text:
                found = True
                break

            # Fuzzy match - check if 70% of words appear
            quote_words = set(quote_lower.split())
            review_words = set(review_text.split())
            if len(quote_words) > 3:
                overlap = len(quote_words & review_words)
                if overlap / len(quote_words) >= 0.7:
                    found = True
                    break

        if found:
            valid_quotes.append(quote)
        else:
            suspicious_quotes.append(quote)

    return {
        "valid_quotes": valid_quotes,
        "suspicious_quotes": suspicious_quotes,
        "review_texts": review_texts,
        "validation_rate": len(valid_quotes) / len(quotes_in_response) if quotes_in_response else 1.0
    }


def generate_follow_up_questions(
    response: str,
    tool_calls: List[Dict[str, Any]],
    context: "AgentContext",
) -> List[str]:
    """Generate suggested follow-up questions based on the conversation.

    Uses tool results and response content to pick relevant, specific follow-ups.

    Args:
        response: The assistant's response
        tool_calls: List of tools that were called during this turn
        context: Agent context

    Returns:
        List of 2-3 suggested follow-up questions
    """
    suggestions: List[str] = []
    tools_used = {tc.get("tool") for tc in tool_calls}
    response_lower = response.lower()
    multi_game = len(context.app_ids) > 1

    # Collect already-explored topics from this turn + previous turns
    explored_topics: set[str] = set()
    for tc in (context.session_context.last_tool_calls or []) + tool_calls:
        tool = tc.get("tool", "")
        params = tc.get("params", {})
        if tool == "get_subcategory_stats":
            explored_topics.add(params.get("subcategory", ""))
        elif tool == "search_reviews":
            if params.get("query"):
                explored_topics.add(params["query"])
            if params.get("subcategory"):
                explored_topics.add(params["subcategory"])
        elif tool in ("get_top_issues", "get_top_praises", "get_feature_requests"):
            explored_topics.add(tool)

    # Extract subcategories mentioned in tool results
    mentioned_subcategories: List[str] = []
    for call in tool_calls:
        result = call.get("result", {})
        if call.get("tool") == "get_top_issues":
            issues = result.get("issues", [])
            mentioned_subcategories.extend([i.get("subcategory", "") for i in issues[:3]])
        elif call.get("tool") == "get_top_praises":
            praises = result.get("praises", [])
            mentioned_subcategories.extend([p.get("subcategory", "") for p in praises[:3]])
        elif call.get("tool") == "list_available_topics":
            topics = result.get("topics", [])
            mentioned_subcategories.extend([t.get("subcategory", "") for t in topics[:3]])
        elif call.get("tool") == "get_feature_requests":
            requests = result.get("feature_requests", [])
            mentioned_subcategories.extend([r.get("subcategory", "") for r in requests[:3]])
        elif call.get("tool") == "get_subcategory_stats":
            if result.get("subcategory"):
                mentioned_subcategories.append(result["subcategory"])
    mentioned_subcategories = [s for s in mentioned_subcategories if s]

    # Helper: human-readable subcategory name
    def _subcat_label(subcat: str) -> str:
        return subcat.split("/")[-1].replace("_", " ")

    # --- Tool-specific suggestions ---

    if "get_top_issues" in tools_used:
        if mentioned_subcategories:
            top = mentioned_subcategories[0]
            suggestions.append(f"Show me reviews about {_subcat_label(top)}")
        if "get_top_praises" not in explored_topics:
            suggestions.append("What do players praise most?")

    if "get_feature_requests" in tools_used:
        if mentioned_subcategories:
            top = mentioned_subcategories[0]
            suggestions.append(f"Show me reviews about {_subcat_label(top)}")
        if multi_game:
            suggestions.append("How do feature requests differ between the two games?")

    if "get_top_praises" in tools_used:
        if mentioned_subcategories:
            top = mentioned_subcategories[0]
            suggestions.append(f"Show me reviews about {_subcat_label(top)}")
        if "get_top_issues" not in explored_topics:
            suggestions.append("What are the top complaints?")

    if "list_available_topics" in tools_used and mentioned_subcategories:
        suggestions.append(f"Show stats for {_subcat_label(mentioned_subcategories[0])}")

    if "search_reviews" in tools_used:
        has_more = any(
            tc.get("tool") == "search_reviews" and tc.get("result", {}).get("has_more")
            for tc in tool_calls
        )
        if has_more:
            suggestions.append("Show me more reviews")
        if "positive" in response_lower and "negative" not in response_lower:
            suggestions.append("Show me negative reviews on this topic")
        elif "negative" in response_lower and "positive" not in response_lower:
            suggestions.append("Show me positive reviews on this topic")
        if "get_subcategory_stats" not in tools_used:
            suggestions.append("What are the stats for this topic?")

    if "get_subcategory_stats" in tools_used:
        if "search_reviews" not in tools_used and mentioned_subcategories:
            suggestions.append(f"Show me reviews about {_subcat_label(mentioned_subcategories[0])}")

    if "get_sentiment_trend" in tools_used:
        if "drop" in response_lower or "decrease" in response_lower or "declined" in response_lower:
            suggestions.append("What issues caused the sentiment drop?")
        elif "increase" in response_lower or "improve" in response_lower or "rose" in response_lower:
            suggestions.append("What improvements do players mention?")
        else:
            suggestions.append("What are the top issues in the last 30 days?")

    if "compare_time_windows" in tools_used:
        suggestions.append("Show me reviews about the biggest change")

    if "compare_games" in tools_used or "compare_sentiment_trend" in tools_used:
        suggestions.append("What are the top issues for each game?")

    if "get_game_overview" in tools_used:
        if "get_top_issues" not in explored_topics:
            suggestions.append("What are the top issues?")
        if "get_feature_requests" not in explored_topics:
            suggestions.append("What features are players requesting?")

    # --- Cross-cutting suggestions (only if not already covered) ---

    # Pricing: only when pricing-related subcategories or keywords are actually present
    _pricing_subcats = {"monetization_value/pricing", "monetization_value/regional_pricing"}
    _pricing_keywords = {"price", "pricing", "expensive", "cheap", "cost", "worth", "value for money", "overpriced"}
    if (
        any(s in _pricing_subcats for s in mentioned_subcategories)
        or any(kw in response_lower for kw in _pricing_keywords)
    ):
        suggestions.append("Do players feel the price is justified?")

    if "get_sentiment_trend" not in tools_used and "get_sentiment_trend" not in explored_topics:
        if any(x in response_lower for x in ["%", "percent", "rate", "recommend"]):
            suggestions.append("How has the sentiment changed over time?")

    if multi_game and not any("compare" in s.lower() for s in suggestions):
        suggestions.append("Compare the two games on top issues")

    # --- Fallback if nothing matched ---
    if not suggestions:
        fallbacks = [
            "What are the top issues?",
            "What features are players requesting?",
            "How has the sentiment changed over time?",
        ]
        for fb in fallbacks:
            tool_tag = {
                "What are the top issues?": "get_top_issues",
                "What features are players requesting?": "get_feature_requests",
                "How has the sentiment changed over time?": "get_sentiment_trend",
            }.get(fb, "")
            if tool_tag not in explored_topics:
                suggestions.append(fb)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: List[str] = []
    for s in suggestions:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique[:3]
