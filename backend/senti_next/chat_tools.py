"""Tool definitions and execution for the agentic chat system."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from .chat_agent import AgentContext

logger = logging.getLogger(__name__)


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
        description="Search reviews by keywords, subcategory, or sentiment. Returns matching review snippets with helpful vote counts.",
        parameters={
            "app_id": "int - Game ID (required)",
            "query": "str - Search keywords (optional)",
            "subcategory": "str - Filter by FULL subcategory path like 'technical/performance' or 'gameplay/difficulty'. Must include both main category and subcategory separated by '/' (optional)",
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
            "limit": "int - Number of issues to return, default 5 (optional)",
            "category": "str - Filter by main category like 'technical', 'gameplay' (optional)",
        }
    ),
    Tool(
        name="get_feature_requests",
        description="Get the most requested features for a game, sorted by request count.",
        parameters={
            "app_id": "int - Game ID (required)",
            "limit": "int - Number of requests to return, default 5 (optional)",
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


def execute_tool(tool_name: str, params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute a tool and return results.

    Args:
        tool_name: Name of the tool to execute
        params: Parameters for the tool
        context: Agent context with user_id, session_id, app_ids, etc.

    Returns:
        Dict with tool results, or special keys like 'final', 'needs_clarification'
    """
    from . import storage

    logger.info(f"Executing tool: {tool_name} with params: {params}")

    try:
        if tool_name == "list_available_games":
            return _execute_list_available_games(params, context)

        elif tool_name == "suggest_game_selection":
            return _execute_suggest_game_selection(params, context)

        elif tool_name == "suggest_search_game":
            return _execute_suggest_search_game(params, context)

        elif tool_name == "get_game_overview":
            return _execute_get_game_overview(params, context)

        elif tool_name == "search_reviews":
            return _execute_search_reviews(params, context)

        elif tool_name == "get_subcategory_stats":
            return _execute_get_subcategory_stats(params, context)

        elif tool_name == "get_top_issues":
            return _execute_get_top_issues(params, context)

        elif tool_name == "get_feature_requests":
            return _execute_get_feature_requests(params, context)

        elif tool_name == "get_sentiment_trend":
            return _execute_get_sentiment_trend(params, context)

        elif tool_name == "compare_games":
            return _execute_compare_games(params, context)

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
            return {"error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        logger.exception(f"Tool execution failed: {tool_name}")
        return {"error": str(e)}


def _execute_list_available_games(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
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
        return {
            "available_games": games,
            "count": len(games),
        }
    except Exception as e:
        logger.exception("Failed to list available games")
        return {"error": str(e), "available_games": [], "count": 0}


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


def _execute_get_game_overview(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute get_game_overview tool - returns overall game stats."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id:
        if context.app_ids:
            app_id = context.app_ids[0]
        else:
            return {"error": "No app_id specified and no game context available"}

    app_id = int(app_id)
    game_name = context.game_names.get(app_id, f"Game {app_id}")

    # Get overall stats from stored analysis
    try:
        analysis = storage.load_analysis_result(context.user_id, app_id)
        if not analysis or not analysis.get("insights"):
            return {"error": f"No analysis data found for {game_name}. Please analyze the game first."}

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

        return {
            "game_name": game_name,
            "app_id": app_id,
            "total_reviews": total_reviews,
            "recommendation_rate": recommendation_rate_pct,
            "positive_reviews": positive_count,
            "negative_reviews": negative_count,
            "category_breakdown": category_breakdown,
        }
    except Exception as e:
        logger.exception(f"Failed to get game overview for {app_id}")
        return {"error": f"Failed to load game data: {str(e)}"}


def _execute_search_reviews(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute search_reviews tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id:
        # Use first app from context if not specified
        if context.app_ids:
            app_id = context.app_ids[0]
        else:
            return {"error": "No app_id specified and no game context available"}

    query = params.get("query", "")
    subcategory = params.get("subcategory")
    sentiment = params.get("sentiment")
    limit = params.get("limit", 10)

    # Search reviews based on method
    if subcategory:
        # Search by subcategory label
        reviews = storage.get_reviews_by_subcategory(
            app_id=int(app_id),
            subcategory=subcategory,
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
    return {
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
    }


def _execute_get_subcategory_stats(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute get_subcategory_stats tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return {"error": "No app_id specified"}

    subcategory = params.get("subcategory")
    if not subcategory:
        return {"error": "subcategory parameter is required"}

    # Load analysis result to get subcategory insights
    result = storage.load_analysis_result(context.user_id, int(app_id))
    if not result or not result.get("insights"):
        return {"error": "No analysis available for this game. Run an analysis first."}

    insights = result.get("insights", {})
    subcategory_insights = insights.get("subcategory_insights", [])

    # Find the matching subcategory
    subcategory_lower = subcategory.lower()
    for entry in subcategory_insights:
        entry_subcat = entry.get("subcategory", "").lower()
        if entry_subcat == subcategory_lower or subcategory_lower in entry_subcat:
            return {
                "subcategory": entry.get("subcategory"),
                "count": entry.get("count", 0),
                "recommendation_rate": entry.get("recommendation_rate", 0),
                "issue_count": entry.get("issue_count", 0),
                "request_count": entry.get("request_count", 0),
            }

    return {"error": f"Subcategory '{subcategory}' not found in analysis results"}


def _execute_get_top_issues(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute get_top_issues tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return {"error": "No app_id specified"}

    limit = params.get("limit", 5)
    category_filter = params.get("category")

    # Load analysis result
    result = storage.load_analysis_result(context.user_id, int(app_id))
    if not result or not result.get("insights"):
        return {"error": "No analysis available for this game. Run an analysis first."}

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

    return {
        "game_name": game_name,
        "note": "Sorted by complaint_count (number of negative reviews mentioning this as an issue). Display complaint_count as the main number.",
        "issues": [
            {
                "rank": i + 1,
                "subcategory": s.get("subcategory"),
                "complaint_count": s.get("issue_count", 0),  # THIS IS THE MAIN NUMBER - reviews flagging this as a complaint
                "recommendation_rate_pct": round(s.get("recommendation_rate", 0) * 100, 1),
            }
            for i, s in enumerate(sorted_issues[:limit])
        ]
    }


def _execute_get_feature_requests(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute get_feature_requests tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return {"error": "No app_id specified"}

    limit = params.get("limit", 5)

    # Load analysis result
    result = storage.load_analysis_result(context.user_id, int(app_id))
    if not result or not result.get("insights"):
        return {"error": "No analysis available for this game. Run an analysis first."}

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

    return {
        "feature_requests": [
            {
                "subcategory": s.get("subcategory"),
                "request_count": s.get("request_count", 0),
                "total_count": s.get("count", 0),
                "recommendation_rate": s.get("recommendation_rate", 0),
            }
            for s in sorted_requests[:limit]
        ]
    }


def _execute_get_sentiment_trend(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute get_sentiment_trend tool."""
    from . import storage

    app_id = params.get("app_id")
    if not app_id and context.app_ids:
        app_id = context.app_ids[0]

    if not app_id:
        return {"error": "No app_id specified"}

    weeks = params.get("weeks", 12)

    # Load analysis result for sentiment trend
    result = storage.load_analysis_result(context.user_id, int(app_id))
    if not result or not result.get("insights"):
        return {"error": "No analysis available for this game. Run an analysis first."}

    insights = result.get("insights", {})
    sentiment_trend = insights.get("sentiment_trend", [])

    if not sentiment_trend:
        return {"error": "No sentiment trend data available"}

    # Limit to requested weeks
    trend_data = sentiment_trend[:weeks]

    return {
        "trend": [
            {
                "week": entry.get("week"),
                "recommendation_rate": entry.get("recommendation_rate", 0),
                "count": entry.get("count", 0),
            }
            for entry in trend_data
        ]
    }


def _execute_compare_games(params: Dict[str, Any], context: "AgentContext") -> Dict[str, Any]:
    """Execute compare_games tool."""
    from . import storage

    app_id_1 = params.get("app_id_1")
    app_id_2 = params.get("app_id_2")
    metric = params.get("metric")

    if not app_id_1 or not app_id_2:
        return {"error": "Both app_id_1 and app_id_2 are required"}

    if not metric:
        return {"error": "metric parameter is required"}

    # Load analysis results for both games
    result_1 = storage.load_analysis_result(context.user_id, int(app_id_1))
    result_2 = storage.load_analysis_result(context.user_id, int(app_id_2))

    if not result_1 or not result_1.get("insights"):
        return {"error": f"No analysis available for game {app_id_1}"}
    if not result_2 or not result_2.get("insights"):
        return {"error": f"No analysis available for game {app_id_2}"}

    insights_1 = result_1.get("insights", {})
    insights_2 = result_2.get("insights", {})

    if metric == "sentiment":
        # Compare overall recommendation rates
        split_1 = storage.get_recommendation_split(int(app_id_1))
        split_2 = storage.get_recommendation_split(int(app_id_2))

        rate_1 = (split_1["recommended"] / split_1["total"]) if split_1["total"] > 0 else 0
        rate_2 = (split_2["recommended"] / split_2["total"]) if split_2["total"] > 0 else 0

        return {
            "comparison": {
                "metric": "sentiment",
                "game_1": {
                    "app_id": app_id_1,
                    "total_reviews": split_1["total"],
                    "recommendation_rate": rate_1,
                },
                "game_2": {
                    "app_id": app_id_2,
                    "total_reviews": split_2["total"],
                    "recommendation_rate": rate_2,
                },
            }
        }

    elif metric == "issues":
        # Compare top issues
        subcats_1 = insights_1.get("subcategory_insights", [])
        subcats_2 = insights_2.get("subcategory_insights", [])

        issues_1 = sorted(subcats_1, key=lambda x: x.get("issue_count", 0), reverse=True)[:5]
        issues_2 = sorted(subcats_2, key=lambda x: x.get("issue_count", 0), reverse=True)[:5]

        return {
            "comparison": {
                "metric": "issues",
                "game_1": {
                    "app_id": app_id_1,
                    "top_issues": [
                        {"subcategory": i.get("subcategory"), "count": i.get("issue_count", 0)}
                        for i in issues_1 if i.get("issue_count", 0) > 0
                    ],
                },
                "game_2": {
                    "app_id": app_id_2,
                    "top_issues": [
                        {"subcategory": i.get("subcategory"), "count": i.get("issue_count", 0)}
                        for i in issues_2 if i.get("issue_count", 0) > 0
                    ],
                },
            }
        }

    elif metric == "features":
        # Compare top feature requests
        subcats_1 = insights_1.get("subcategory_insights", [])
        subcats_2 = insights_2.get("subcategory_insights", [])

        requests_1 = sorted(subcats_1, key=lambda x: x.get("request_count", 0), reverse=True)[:5]
        requests_2 = sorted(subcats_2, key=lambda x: x.get("request_count", 0), reverse=True)[:5]

        return {
            "comparison": {
                "metric": "features",
                "game_1": {
                    "app_id": app_id_1,
                    "top_requests": [
                        {"subcategory": r.get("subcategory"), "count": r.get("request_count", 0)}
                        for r in requests_1 if r.get("request_count", 0) > 0
                    ],
                },
                "game_2": {
                    "app_id": app_id_2,
                    "top_requests": [
                        {"subcategory": r.get("subcategory"), "count": r.get("request_count", 0)}
                        for r in requests_2 if r.get("request_count", 0) > 0
                    ],
                },
            }
        }

    elif metric == "subcategory":
        # Compare a specific subcategory
        subcategory = params.get("subcategory")
        if not subcategory:
            return {"error": "subcategory parameter is required when metric='subcategory'"}

        subcats_1 = {s.get("subcategory", "").lower(): s for s in insights_1.get("subcategory_insights", [])}
        subcats_2 = {s.get("subcategory", "").lower(): s for s in insights_2.get("subcategory_insights", [])}

        subcat_lower = subcategory.lower()
        entry_1 = subcats_1.get(subcat_lower, {})
        entry_2 = subcats_2.get(subcat_lower, {})

        return {
            "comparison": {
                "metric": "subcategory",
                "subcategory": subcategory,
                "game_1": {
                    "app_id": app_id_1,
                    "count": entry_1.get("count", 0),
                    "issue_count": entry_1.get("issue_count", 0),
                    "recommendation_rate": entry_1.get("recommendation_rate", 0),
                },
                "game_2": {
                    "app_id": app_id_2,
                    "count": entry_2.get("count", 0),
                    "issue_count": entry_2.get("issue_count", 0),
                    "recommendation_rate": entry_2.get("recommendation_rate", 0),
                },
            }
        }

    else:
        return {"error": f"Unknown metric: {metric}. Use 'issues', 'sentiment', 'features', or 'subcategory'."}


def generate_follow_up_questions(
    response: str,
    tool_calls: List[Dict[str, Any]],
    context: "AgentContext",
) -> List[str]:
    """Generate suggested follow-up questions based on the conversation.

    Args:
        response: The assistant's response
        tool_calls: List of tools that were called during this turn
        context: Agent context

    Returns:
        List of 2-3 suggested follow-up questions
    """
    suggestions = []
    tools_used = {tc.get("tool") for tc in tool_calls}

    # If we showed top issues, suggest drilling down
    if "get_top_issues" in tools_used:
        suggestions.append("Can you show me specific reviews about the top issue?")
        suggestions.append("What are players saying about this in detail?")

    # If we showed feature requests, suggest comparison
    if "get_feature_requests" in tools_used:
        suggestions.append("How does this compare to competing games?")
        suggestions.append("Show me reviews requesting these features")

    # If we searched reviews, suggest statistics
    if "search_reviews" in tools_used:
        suggestions.append("What percentage of reviews mention this?")
        suggestions.append("Show me the trend over time")

    # If we showed sentiment, suggest drilling down
    if "get_sentiment_trend" in tools_used:
        suggestions.append("What caused the changes in sentiment?")
        suggestions.append("Show me the top issues during low points")

    # If we compared games, suggest more comparison
    if "compare_games" in tools_used:
        suggestions.append("Compare another metric between these games")
        suggestions.append("What do each game's reviews say about this?")

    # Generic follow-ups if nothing specific
    if not suggestions:
        suggestions = [
            "What are the main issues?",
            "Show me the sentiment trend",
            "What do positive reviews say?",
        ]

    return suggestions[:3]
