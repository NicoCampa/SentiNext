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
    "technical": ["performance", "bugs", "stability", "crashes", "compatibility", "networking", "installation"],
    "content_design": ["amount_variety", "level_design", "quests_modes", "narrative_characters", "replayability", "pacing", "customization"],
    "ui_ux_accessibility": ["menus_hud", "readability", "quality_of_life", "controller_support", "accessibility_options"],
    "onboarding": ["tutorial", "learning_curve", "clarity", "tooltips"],
    "presentation": ["visuals_art_style", "animation", "audio_music_voice", "atmosphere", "localization"],
    "online_community": ["multiplayer_experience", "matchmaking", "social_features", "toxicity_moderation", "mods_ugc", "cheating_anti_cheat"],
    "developer_updates": ["patch_quality", "update_frequency", "roadmap_events", "communication", "customer_support"],
    "monetization_value": ["price", "regional_pricing", "dlc", "microtransactions", "pay_to_win_grind", "value_for_money"],
    "other": ["general", "mixed", "meta", "unclear"],
}

# Flattened set for quick lookup
ALL_VALID_SUBCATEGORY_PATHS = {
    f"{main}/{sub}" for main, subs in VALID_SUBCATEGORIES.items() for sub in subs
}

# Aliases for common terms
SUBCATEGORY_ALIASES = {
    "bugs": ["technical/bugs", "technical/stability"],
    "bug": ["technical/bugs"],
    "performance": ["technical/performance"],
    "fps": ["technical/performance"],
    "lag": ["technical/performance", "technical/networking"],
    "crash": ["technical/crashes"],
    "crashes": ["technical/crashes"],
    "graphics": ["presentation/visuals_art_style", "technical/performance"],
    "audio": ["presentation/audio_music_voice"],
    "music": ["presentation/audio_music_voice"],
    "story": ["content_design/narrative_characters"],
    "difficulty": ["gameplay/difficulty"],
    "hard": ["gameplay/difficulty"],
    "easy": ["gameplay/difficulty"],
    "controls": ["gameplay/controls"],
    "balance": ["gameplay/balance"],
    "price": ["monetization_value/price"],
    "dlc": ["monetization_value/dlc"],
    "multiplayer": ["online_community/multiplayer_experience"],
    "coop": ["online_community/multiplayer_experience"],
    "ui": ["ui_ux_accessibility/menus_hud"],
    "menu": ["ui_ux_accessibility/menus_hud"],
    "tutorial": ["onboarding/tutorial"],
}


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
        name="list_available_games",
        description="List all games available for analysis (user's starred games). Use this when user asks about a game by name and you need to find its app_id, or when user wants to know what games they can analyze.",
        parameters={}
    ),
    Tool(
        name="suggest_game_selection",
        description="Suggest games for the user to select. Use this when user mentions a game name that matches one or more available games. The frontend will show selection buttons.",
        parameters={
            "games": "list[dict] - List of games to suggest, each with 'app_id' and 'name' (required)",
            "message": "str - Message to show the user explaining the suggestion (required)",
        }
    ),
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
        description="Get actual review text/quotes. Use this when user asks 'what do they say specifically?' or wants examples. Returns review snippets (up to 500 chars each) that mention the subcategory.",
        parameters={
            "app_id": "int - Game ID (required)",
            "query": "str - Search keywords (optional)",
            "subcategory": "str - Filter by subcategory like 'monetization_value/pay_to_win_grind' or 'gameplay/ai'. Use to get reviews about a specific issue (optional)",
            "sentiment": "str - 'positive' or 'negative' (optional)",
            "limit": "int - Max results, default 10 (optional)",
        }
    ),
    Tool(
        name="get_subcategory_stats",
        description="Get statistics for a SPECIFIC subcategory path. Only use for drilling into specific topics like 'technical/performance' or 'gameplay/balance'.",
        parameters={
            "app_id": "int - Game ID (required)",
            "subcategory": "str - FULL subcategory path like 'gameplay/difficulty' or 'technical/bugs'. Must be in format 'main/sub' (required)",
        }
    ),
    Tool(
        name="get_top_issues",
        description="Get the top N issues/complaints for a game ranked by frequency. Returns subcategories with highest issue counts.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of issues to return, default 10 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
        }
    ),
    Tool(
        name="get_feature_requests",
        description="Get the most requested features for a game, sorted by request count.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of requests to return, default 10 (optional)",
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
            if param_type.startswith("int"):
                json_type = "integer"
            elif param_type.startswith("list"):
                json_type = "array"
            elif param_type.startswith("bool"):
                json_type = "boolean"

            prop = {"type": json_type, "description": description}
            if json_type == "array":
                prop["items"] = {"type": "string"}

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
    "get_sentiment_trend",
    "get_subcategory_stats",
    "compare_games",
}

# Tools that should NOT be cached (may have different results or side effects)
NON_CACHEABLE_TOOLS = {
    "search_reviews",  # May want fresh results
    "list_available_games",  # User might have added new games
    "suggest_game_selection",
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
        cache_key = _make_cache_key(tool_name, params, context_key)

        cached = _get_cached_result(cache_key)
        if cached is not None:
            logger.info(f"Returning cached result for {tool_name}")
            # Add marker that this was cached
            cached["_cached"] = True
            return cached

    try:
        result: Optional[ToolResult] = None

        if tool_name == "list_available_games":
            result = _execute_list_available_games(params, context)

        elif tool_name == "suggest_game_selection":
            return _execute_suggest_game_selection(params, context)

        elif tool_name == "suggest_search_game":
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


def _execute_list_available_games(params: Dict[str, Any], context: "AgentContext") -> ToolResult:
    """Execute list_available_games tool - returns user's starred games."""
    from . import storage

    try:
        starred = storage.load_starred_games(context.user_id)
        games = [
            {
                "app_id": g.get("app_id"),
                "name": g.get("name", f"Game {g.get('app_id')}"),
            }
            for g in starred
        ]
        return ToolResult(data={
            "available_games": games,
            "count": len(games),
        })
    except Exception as e:
        logger.exception("Failed to list available games")
        return _make_error(
            ToolErrorCode.DB_ERROR,
            f"Failed to load starred games: {str(e)}",
            retryable=True,
            available_games=[],
            count=0
        )


def _execute_suggest_game_selection(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute suggest_game_selection tool - returns game suggestions for frontend."""
    games = params.get("games", [])
    message = params.get("message", "Please select a game:")

    return {
        "suggest_selection": True,
        "games": games,
        "message": message,
    }


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
    limit = min(params.get("limit", 10), 50)  # Cap at 50 for agent queries

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
                    "message": f"'{subcategory}' matches multiple subcategories. Please specify:",
                    "matches": matches,
                    "hint": "Use the full path like 'technical/bugs' or 'gameplay/difficulty'"
                })

            if disambiguation.get("error"):
                # Try to search anyway with the original term
                logger.warning(f"Subcategory disambiguation failed: {disambiguation.get('error')}")
                resolved_subcategory = subcategory
            else:
                resolved_subcategory = disambiguation.get("exact_match", subcategory)

        # Search reviews based on method
        if resolved_subcategory:
            # Search by subcategory label
            reviews = storage.get_reviews_by_subcategory(
                app_id=int(app_id),
                subcategory=resolved_subcategory,
                date_filter="all",
                limit=int(limit),
            )
        elif query:
            # Full-text search
            reviews = storage.search_reviews_with_date_filter(
                app_id=int(app_id),
                query=query,
                date_filter="all",
                limit=int(limit),
            )
        else:
            # Just get top helpful reviews
            reviews = storage.search_reviews_with_date_filter(
                app_id=int(app_id),
                query="",
                date_filter="all",
                limit=int(limit),
            )

        # Filter by sentiment if specified
        if sentiment:
            is_positive = sentiment.lower() == "positive"
            reviews = [r for r in reviews if r.get("voted_up") == is_positive]

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
                "message": f"'{subcategory}' matches multiple subcategories. Please specify:",
                "matches": matches,
                "hint": "Use the full path like 'technical/bugs' or 'gameplay/difficulty'"
            })

        # Get the resolved subcategory
        resolved = disambiguation.get("exact_match", subcategory)

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

    limit = params.get("limit", 10)
    category_filter = params.get("category")

    try:
        # Load analysis result
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

        game_name = context.game_names.get(int(app_id), f"Game {app_id}")

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

    limit = params.get("limit", 10)

    try:
        # Load analysis result
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

    try:
        # Load analysis result for sentiment trend
        result = storage.load_analysis_result(context.user_id, int(app_id))
        if not result or not result.get("insights"):
            return _make_error(
                ToolErrorCode.NO_ANALYSIS,
                "No analysis available for this game. Run an analysis first.",
                retryable=False,
                app_id=app_id
            )

        insights = result.get("insights", {})
        sentiment_trend = insights.get("sentiment_trend", [])

        if not sentiment_trend:
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
                    "week": entry.get("week"),
                    "recommendation_rate": entry.get("recommendation_rate", 0),
                    "count": entry.get("count", 0),
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

    Generates dynamic suggestions based on response content and tools used.

    Args:
        response: The assistant's response
        tool_calls: List of tools that were called during this turn
        context: Agent context

    Returns:
        List of 2-3 suggested follow-up questions
    """
    suggestions = []
    tools_used = {tc.get("tool") for tc in tool_calls}
    response_lower = response.lower()

    # Extract specific topics mentioned in response for targeted follow-ups
    mentioned_subcategories = []
    for call in tool_calls:
        result = call.get("result", {})
        if call.get("tool") == "get_top_issues":
            issues = result.get("issues", [])
            mentioned_subcategories.extend([i.get("subcategory", "") for i in issues[:3]])
        elif call.get("tool") == "get_subcategory_stats":
            if result.get("subcategory"):
                mentioned_subcategories.append(result["subcategory"])

    # Dynamic suggestions based on content
    if mentioned_subcategories:
        # Suggest drilling into specific mentioned categories
        top_subcat = mentioned_subcategories[0]
        if "technical" in top_subcat:
            suggestions.append("Are there workarounds players have found?")
        elif "gameplay" in top_subcat:
            suggestions.append("How does this compare to similar games?")
        elif "monetization" in top_subcat:
            suggestions.append("Do players feel the price is justified?")

        # Suggest showing actual reviews for the topic
        if "get_top_issues" in tools_used or "get_subcategory_stats" in tools_used:
            suggestions.append(f"Show me what players say about {top_subcat.split('/')[-1]}")

    # If response mentions numbers/percentages, suggest trend
    if any(x in response_lower for x in ["reviews", "%", "percent", "rate"]):
        if "get_sentiment_trend" not in tools_used:
            suggestions.append("How has this changed over time?")

    # If we showed top issues, suggest drilling down
    if "get_top_issues" in tools_used:
        if not any("show" in s.lower() or "review" in s.lower() for s in suggestions):
            suggestions.append("Show me specific reviews about the top issue")

    # If we showed feature requests, suggest comparison
    if "get_feature_requests" in tools_used:
        suggestions.append("Which requests have the most votes?")
        if len(context.app_ids) > 1:
            suggestions.append("How do these compare to the other game?")

    # If we searched reviews, suggest statistics or more examples
    if "search_reviews" in tools_used:
        suggestions.append("What's the overall sentiment on this topic?")
        if "positive" in response_lower or "negative" in response_lower:
            suggestions.append("Show me examples from the opposite sentiment")

    # If we showed sentiment trend, suggest investigation
    if "get_sentiment_trend" in tools_used:
        if "drop" in response_lower or "decrease" in response_lower:
            suggestions.append("What issues caused the sentiment drop?")
        elif "increase" in response_lower or "improve" in response_lower:
            suggestions.append("What improvements do players mention?")

    # If we compared games, suggest more comparison
    if "compare_games" in tools_used:
        suggestions.append("Compare a different metric between these games")

    # Generic follow-ups if nothing specific
    if not suggestions:
        suggestions = [
            "What are the main issues?",
            "Show me the sentiment trend",
            "What do positive reviews say?",
        ]

    # Deduplicate while preserving order
    seen = set()
    unique_suggestions = []
    for s in suggestions:
        s_lower = s.lower()
        if s_lower not in seen:
            seen.add(s_lower)
            unique_suggestions.append(s)

    return unique_suggestions[:3]
