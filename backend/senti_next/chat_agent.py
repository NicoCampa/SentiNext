"""Agentic chat execution loop for multi-step tool-calling conversations."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .chat_tools import (
    CHAT_TOOLS,
    execute_tool,
    format_tools_for_gemini,
    generate_follow_up_questions,
    ToolErrorCode,
)
from . import credits

logger = logging.getLogger(__name__)


# Chart schema validation
VALID_CHART_TYPES = {"pie", "bar", "line", "doughnut"}

# Regex to extract chart blocks from response
CHART_BLOCK_PATTERN = re.compile(r"```chart\s*\n?(.*?)\n?```", re.DOTALL)

def _tool_call_key(tool_name: str, params: Dict[str, Any]) -> str:
    """Normalize tool call for duplicate detection."""
    try:
        params_str = json.dumps(params, sort_keys=True, default=str)
    except (TypeError, ValueError):
        params_str = str(params)
    return f"{tool_name}:{params_str}"


def validate_chart_json(chart_json: str) -> Dict[str, Any]:
    """Validate and fix chart JSON format.

    Args:
        chart_json: Raw chart JSON string from LLM response

    Returns:
        Dict with 'valid' bool, 'chart' (parsed/fixed chart), and 'error' if invalid
    """
    try:
        chart = json.loads(chart_json.strip())
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "error": f"Invalid JSON: {str(e)}",
            "chart": None
        }

    # Validate required fields
    if not isinstance(chart, dict):
        return {"valid": False, "error": "Chart must be a JSON object", "chart": None}

    chart_type = chart.get("type", "").lower()
    if chart_type not in VALID_CHART_TYPES:
        # Try to fix common type issues
        if chart_type in ("piechart", "pie_chart"):
            chart["type"] = "pie"
        elif chart_type in ("barchart", "bar_chart"):
            chart["type"] = "bar"
        elif chart_type in ("linechart", "line_chart"):
            chart["type"] = "line"
        else:
            return {
                "valid": False,
                "error": f"Invalid chart type '{chart_type}'. Must be one of: {VALID_CHART_TYPES}",
                "chart": chart
            }

    # Validate data structure
    data = chart.get("data")
    if not data or not isinstance(data, dict):
        return {"valid": False, "error": "Chart must have 'data' object", "chart": chart}

    labels = data.get("labels")
    datasets = data.get("datasets")

    if not labels or not isinstance(labels, list):
        return {"valid": False, "error": "Chart data must have 'labels' array", "chart": chart}

    if not datasets or not isinstance(datasets, list):
        return {"valid": False, "error": "Chart data must have 'datasets' array", "chart": chart}

    # Validate each dataset
    for i, dataset in enumerate(datasets):
        if not isinstance(dataset, dict):
            return {"valid": False, "error": f"Dataset {i} must be an object", "chart": chart}

        ds_data = dataset.get("data")
        if not ds_data or not isinstance(ds_data, list):
            return {"valid": False, "error": f"Dataset {i} must have 'data' array", "chart": chart}

        # Ensure data values are numbers
        try:
            dataset["data"] = [float(v) if v is not None else 0 for v in ds_data]
        except (TypeError, ValueError):
            return {"valid": False, "error": f"Dataset {i} contains non-numeric values", "chart": chart}

        # Ensure data length matches labels
        if len(dataset["data"]) != len(labels):
            # Try to fix by padding or truncating
            while len(dataset["data"]) < len(labels):
                dataset["data"].append(0)
            dataset["data"] = dataset["data"][:len(labels)]

    return {"valid": True, "chart": chart, "error": None}


def validate_and_fix_charts(response: str) -> str:
    """Validate and fix all chart blocks in a response.

    Args:
        response: Full response text potentially containing chart blocks

    Returns:
        Response with validated/fixed chart blocks
    """
    def fix_chart_match(match):
        chart_json = match.group(1)
        result = validate_chart_json(chart_json)

        if result["valid"]:
            # Return properly formatted chart
            return f"```chart\n{json.dumps(result['chart'])}\n```"
        else:
            # Log error and return a fallback or remove invalid chart
            logger.warning(f"Invalid chart JSON: {result['error']}")

            if result["chart"]:
                # Try to use partially valid chart
                return f"```chart\n{json.dumps(result['chart'])}\n```"
            else:
                # Remove invalid chart block entirely
                return f"[Chart could not be rendered: {result['error']}]"

    return CHART_BLOCK_PATTERN.sub(fix_chart_match, response)

# Maximum tool calls per conversation turn to prevent infinite loops
MAX_TOOL_CALLS = 5


# Response templates for graceful degradation
INSUFFICIENT_DATA_TEMPLATES = {
    "no_analysis": (
        "I don't have analysis data for this game yet. To get insights, please:\n\n"
        "1. Go to the game's dashboard\n"
        "2. Click 'Analyze Reviews' to start the analysis\n"
        "3. Once complete, come back and ask your question again"
    ),
    "no_game_context": (
        "I need you to select a game first before I can help with your question. "
        "Please use the sidebar to select a game you want to analyze."
    ),
    "empty_results": (
        "I couldn't find any data matching your query. Here are some things you could try:\n\n"
        "- Ask about a different topic (e.g., 'technical issues' instead of 'graphics bugs')\n"
        "- Use broader terms (e.g., 'performance' instead of 'frame rate drops')\n"
        "- Check if the game has been analyzed"
    ),
    "max_iterations": (
        "I gathered some information but couldn't complete the full analysis. "
        "Here's what I found so far:\n\n{partial_results}\n\n"
        "Try asking a more specific question or breaking your request into smaller parts."
    ),
}


def _summarize_tool_results(tool_calls: List[Dict[str, Any]]) -> str:
    """Summarize what data was retrieved from tool calls for partial response."""
    summaries = []

    for call in tool_calls:
        tool_name = call.get("tool", "")
        result = call.get("result", {})

        # Skip error results
        if result.get("error"):
            continue

        if tool_name == "get_game_overview":
            if result.get("total_reviews"):
                summaries.append(
                    f"- Game overview: {result.get('total_reviews')} reviews, "
                    f"{result.get('recommendation_rate', 0)}% positive"
                )

        elif tool_name == "get_top_issues":
            issues = result.get("issues", [])
            if issues:
                top_issues = [f"{i.get('subcategory')}" for i in issues[:3]]
                summaries.append(f"- Top issues: {', '.join(top_issues)}")

        elif tool_name == "get_feature_requests":
            requests = result.get("feature_requests", [])
            if requests:
                top_requests = [f"{r.get('subcategory')}" for r in requests[:3]]
                summaries.append(f"- Top requests: {', '.join(top_requests)}")

        elif tool_name == "list_available_topics":
            topics = result.get("topics", [])
            if topics:
                top_topics = [t.get("subcategory") for t in topics[:3] if t.get("subcategory")]
                if top_topics:
                    summaries.append(f"- Available topics: {', '.join(top_topics)}")
                else:
                    summaries.append(f"- Available topics: {len(topics)}")
            elif result.get("total_topics"):
                summaries.append(f"- Available topics: {result.get('total_topics')}")

        elif tool_name == "get_top_praises":
            praises = result.get("praises", [])
            if praises:
                top_praises = [p.get("subcategory") for p in praises[:3] if p.get("subcategory")]
                if top_praises:
                    summaries.append(f"- Top praises: {', '.join(top_praises)}")

        elif tool_name == "compare_time_windows":
            changes = result.get("results", [])
            if changes:
                top_changes = [c.get("subcategory") for c in changes[:3] if c.get("subcategory")]
                if top_changes:
                    summaries.append(f"- Biggest changes: {', '.join(top_changes)}")

        elif tool_name == "compare_sentiment_trend":
            trend = result.get("trend", [])
            if trend:
                summaries.append(f"- Compared sentiment trends across {len(trend)} weeks")

        elif tool_name == "search_reviews":
            found = result.get("total_found", 0)
            if found:
                summaries.append(f"- Found {found} matching reviews")

        elif tool_name == "get_sentiment_trend":
            trend = result.get("trend", [])
            if trend:
                summaries.append(f"- Sentiment data for {len(trend)} time periods")

        elif tool_name == "get_subcategory_stats":
            if result.get("count"):
                summaries.append(
                    f"- {result.get('subcategory')}: {result.get('count')} reviews, "
                    f"{result.get('issue_count', 0)} issues"
                )

    return "\n".join(summaries) if summaries else "No data was retrieved."


def load_session_context_from_db(context: "AgentContext") -> None:
    """Load persisted session context from database."""
    from . import storage

    try:
        saved_context = storage.load_session_context(context.session_id)
        if saved_context:
            context.session_context.last_topic = saved_context.get("last_topic")
            context.session_context.last_search_results = saved_context.get("last_search_results", [])
            context.session_context.last_tool_calls = saved_context.get("last_tool_calls", [])
    except Exception as e:
        logger.warning(f"Failed to load session context: {e}")


def _extract_topic_from_tool_calls(tool_calls: List[Dict[str, Any]]) -> Optional[str]:
    """Extract the last discussed topic/subcategory from tool calls."""
    for call in reversed(tool_calls):
        params = call.get("params", {})

        # Check for explicit subcategory in params
        if params.get("subcategory"):
            return params["subcategory"]

        # Check for subcategory in search results
        result = call.get("result", {})
        if call.get("tool") == "get_subcategory_stats" and result.get("subcategory"):
            return result["subcategory"]

        # Check for top issues - take the first one as current topic
        if call.get("tool") == "get_top_issues":
            issues = result.get("issues", [])
            if issues:
                return issues[0].get("subcategory")

    return None


def _update_session_context(context: "AgentContext", tool_calls: List[Dict[str, Any]]) -> None:
    """Update session context after a conversation turn."""
    import time
    from . import storage

    session = context.session_context

    # Extract and store last topic
    topic = _extract_topic_from_tool_calls(tool_calls)
    if topic:
        session.last_topic = topic

    # Store last search results for follow-up
    for call in reversed(tool_calls):
        if call.get("tool") == "search_reviews":
            result = call.get("result", {})
            if result.get("reviews"):
                session.last_search_results = result["reviews"][:10]
                break

    # Store tool calls for "same question but X" scenarios
    session.last_tool_calls = [
        {"tool": c.get("tool"), "params": c.get("params", {})}
        for c in tool_calls
        if c.get("tool") not in ("final_answer", "clarify_question")
    ]

    session.last_updated = time.time()

    # Persist to database
    try:
        storage.save_session_context(
            session_id=context.session_id,
            last_topic=session.last_topic,
            last_search_results=session.last_search_results,
            last_tool_calls=session.last_tool_calls,
        )
    except Exception as e:
        logger.warning(f"Failed to persist session context: {e}")


def _build_graceful_response(
    error_code: Optional[str],
    tool_calls: List[Dict[str, Any]],
    context: "AgentContext"
) -> str:
    """Build a helpful response when the agent fails to complete."""
    # Check for specific error types
    if error_code == "no_game_context":
        return INSUFFICIENT_DATA_TEMPLATES["no_game_context"]

    if error_code == "no_analysis":
        return INSUFFICIENT_DATA_TEMPLATES["no_analysis"]

    # Check if all results were empty
    all_empty = all(
        not call.get("result") or call.get("result", {}).get("error")
        or (call.get("tool") == "search_reviews" and not call.get("result", {}).get("reviews"))
        for call in tool_calls
        if call.get("tool") not in ("final_answer", "clarify_question")
    )

    if all_empty:
        return INSUFFICIENT_DATA_TEMPLATES["empty_results"]

    # Max iterations with partial data
    partial_summary = _summarize_tool_results(tool_calls)
    return INSUFFICIENT_DATA_TEMPLATES["max_iterations"].format(partial_results=partial_summary)


@dataclass
class SessionContext:
    """Persisted context across conversation turns within a session."""

    # Last topic discussed (subcategory path like "technical/performance")
    last_topic: Optional[str] = None

    # Last search results for follow-up questions
    last_search_results: List[Dict[str, Any]] = field(default_factory=list)

    # Last tool results from previous turn (for "same question but for X")
    last_tool_calls: List[Dict[str, Any]] = field(default_factory=list)

    # Cached analysis data (to avoid re-fetching within session)
    cached_analyses: Dict[int, Dict[str, Any]] = field(default_factory=dict)  # app_id -> analysis

    # Timestamp of last update for cache invalidation
    last_updated: float = 0.0


@dataclass
class AgentContext:
    """Context maintained throughout an agentic conversation turn."""

    user_id: str
    session_id: str
    app_ids: List[int] = field(default_factory=list)
    date_filter: str = "all"
    max_reviews_per_game: int = 50
    language: Optional[str] = None
    conversation_history: List[Dict[str, Any]] = field(default_factory=list)
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    game_names: Dict[int, str] = field(default_factory=dict)  # app_id -> name mapping

    # Session-level context (persisted across turns)
    session_context: SessionContext = field(default_factory=SessionContext)


@dataclass
class AgentResult:
    """Result from running the agent."""

    response: str
    citations: List[str] = field(default_factory=list)
    tool_calls_made: List[Dict[str, Any]] = field(default_factory=list)
    suggested_questions: List[str] = field(default_factory=list)
    needs_clarification: bool = False
    clarification_options: List[str] = field(default_factory=list)
    clarification_context: str = ""
    # Suggest searching for a game
    suggest_search_game: bool = False
    search_game_name: str = ""
    error: Optional[str] = None


AGENT_SYSTEM_PROMPT = """You are a Steam game review analyst for SENTINEXT. Analyze player feedback to provide actionable insights.

## CORE RULE
**ALWAYS end with final_answer** - Every response must call final_answer to complete.

## Tool Reference
| Tool | Use For |
|------|---------|
| get_game_overview | General stats, recommendation rate, category breakdown |
| get_top_issues | "What are the problems?" - Top complaints by frequency |
| get_feature_requests | "What do players want?" - Most requested features |
| list_available_topics | "What topics are available?" - List subcategories |
| get_top_praises | "What do players like?" - Top positive themes |
| compare_time_windows | "What changed lately?" - Compare last N days vs prior N days |
| compare_sentiment_trend | Compare sentiment trends between two games |
| search_reviews | "What do they say?" - Actual review text/quotes |
| get_subcategory_stats | Stats for specific topic like "technical/performance" |
| get_sentiment_trend | Sentiment changes over time |
| compare_games | Compare metrics between two games |
| final_answer | **REQUIRED** - Provide your response |

## Workflow
1. Call 1-2 data tools → 2. Call final_answer with insights

## Pagination
- `search_reviews` supports `offset`; use it to fetch more examples (e.g., "show me more").

## Filters
- If the user specifies a time window (e.g., "last 30 days"), pass `date_filter`.
- If the user specifies a language, pass `language`.
- If the user specifies positive/negative only, pass `sentiment`.

## Citations
- If you use `search_reviews`, quote only from the returned snippets.
- When you quote or rely on specific reviews, include their `review_id`s in `final_answer.citations` (2-5 IDs).
- Prioritize insights from reviews with high `votes_up` (helpfulness) - they represent community-validated feedback.

## Comprehensive Searches
- When user asks about a topic (e.g., "AI features"), use BOTH `query` AND `subcategory` parameters together:
  - query="AI" to find all mentions
  - subcategory="gameplay/ai" to get classified reviews
  - This ensures you get both categorized feedback AND keyword matches
- Request more reviews (limit=50-100) for thorough analysis on important topics

## Subcategory Format
**Always use full paths**: "technical/performance", "gameplay/difficulty", "monetization_value/pricing"
**Never use partial**: "technical", "performance" (incomplete)

## Handling Uncertainty
- **Few reviews (<5)**: "Based on limited data from X reviews..."
- **No exact match**: Don't ask "Would you like me to search?" - just search immediately using search_reviews with relevant keywords
- **Conflicting data**: "Reviews are mixed - X% positive mention [aspect], while negative reviews cite [issue]"
- **Empty results**: Try searching with keywords from the user's question using search_reviews

## Follow-up Responses
When user says "yes", "sure", "okay", "go ahead", or similar affirmative responses:
- Look at conversation history to see what you suggested
- If you suggested searching for a term, immediately call search_reviews with that term
- If you suggested showing more examples, call search_reviews with offset parameter
- If you suggested analyzing a specific topic, call the appropriate tool
- **Don't ask for confirmation - just execute the action you suggested**

When user says "same for X" or "what about Y":
- Reuse filters from last query with new subcategory
- Reference previous context when relevant

## Chart Format (in final_answer)
```chart
{"type": "pie", "title": "Title", "data": {"labels": ["A", "B"], "datasets": [{"data": [75, 25]}]}}
```
Types: pie, bar, line, doughnut

## Don't
- Ask "what game is this?" (game context provided)
- Loop on same tool multiple times
- Call tools without calling final_answer after
- Ask "Would you like me to..." - just do the action immediately
"""


async def run_agent(
    message: str,
    context: AgentContext,
    status_callback: Optional[Callable[[str], None]] = None,
) -> AgentResult:
    """Run the agentic chat loop.

    The agent will:
    1. Load session context from previous turns
    2. Send the message + tools to the LLM
    3. If LLM calls tools, execute them and loop
    4. If LLM calls final_answer, return response
    5. Max 5 iterations to prevent runaway

    Args:
        message: User's message
        context: Agent context with user info, game context, history
        status_callback: Optional callback for status updates (for SSE)

    Returns:
        AgentResult with response, citations, tool calls made, etc.
    """
    from .llm import call_llm_with_tools

    # Load persisted session context if available
    load_session_context_from_db(context)

    # Format tools for Gemini
    tools_schema = format_tools_for_gemini()

    # Build initial messages
    messages = _build_messages(message, context)

    # Track all tool calls for this turn
    all_tool_calls = []
    executed_tool_calls: Dict[str, Dict[str, Any]] = {}

    for iteration in range(MAX_TOOL_CALLS):
        if status_callback:
            if iteration == 0:
                status_callback("Analyzing your question...")
            else:
                status_callback("Processing results...")

        logger.info(f"Agent iteration {iteration + 1}/{MAX_TOOL_CALLS}")

        try:
            # Call LLM with tools
            response = await call_llm_with_tools(messages, tools_schema)
        except credits.InsufficientCreditsError:
            raise
        except Exception as e:
            logger.exception("LLM call failed")
            return AgentResult(
                response="I encountered an error processing your request. Please try again.",
                error=str(e),
            )

        # Check if LLM made tool calls
        if response.tool_calls:
            tool_results = []

            for call in response.tool_calls:
                tool_name = call.get("name", "")
                tool_params = call.get("parameters", {})

                if status_callback:
                    status_callback(f"{_friendly_tool_name(tool_name)}...")

                logger.info(f"Executing tool: {tool_name}")

                call_key = _tool_call_key(tool_name, tool_params)
                if call_key in executed_tool_calls:
                    logger.info(f"Skipping duplicate tool call: {tool_name}")
                    result = dict(executed_tool_calls[call_key])
                    result["_duplicate"] = True
                else:
                    # Execute the tool
                    result = execute_tool(tool_name, tool_params, context)
                    executed_tool_calls[call_key] = result

                # Track this tool call
                tool_call_record = {
                    "tool": tool_name,
                    "params": tool_params,
                    "result": result,
                }
                all_tool_calls.append(tool_call_record)
                context.tool_results.append(tool_call_record)

                # Check for terminal conditions

                # Final answer - return the response
                if result.get("final"):
                    # Update session context before returning
                    _update_session_context(context, all_tool_calls)

                    # Validate and fix any charts in the response
                    response_text = result.get("response", "")

                    # Guard against empty final_answer from LLM
                    if not response_text.strip():
                        logger.warning("LLM called final_answer with empty response, building fallback")
                        response_text = _build_graceful_response(None, all_tool_calls, context)

                    if "```chart" in response_text:
                        response_text = validate_and_fix_charts(response_text)

                    suggested = generate_follow_up_questions(
                        response_text,
                        all_tool_calls,
                        context,
                    )
                    return AgentResult(
                        response=response_text,
                        citations=result.get("citations", []),
                        tool_calls_made=all_tool_calls,
                        suggested_questions=suggested,
                    )

                # Clarification needed - return to user
                if result.get("needs_clarification"):
                    options = result.get("options") or result.get("matches") or []
                    if not isinstance(options, list):
                        options = []

                    context_text = result.get("context") or result.get("message") or ""
                    hint = result.get("hint")
                    if hint:
                        context_text = f"{context_text}\n{hint}" if context_text else hint
                    return AgentResult(
                        response="",
                        needs_clarification=True,
                        clarification_options=options,
                        clarification_context=context_text,
                        tool_calls_made=all_tool_calls,
                    )

                # Suggest searching for a game - return to user
                if result.get("suggest_search"):
                    return AgentResult(
                        response=result.get("message", "I couldn't find that game."),
                        suggest_search_game=True,
                        search_game_name=result.get("game_name", ""),
                        tool_calls_made=all_tool_calls,
                    )

                # Check for critical errors that should stop the agent
                error_code = result.get("error_code")
                if error_code in ("no_game_context", "no_analysis"):
                    graceful_response = _build_graceful_response(error_code, all_tool_calls, context)
                    return AgentResult(
                        response=graceful_response,
                        error=error_code,
                        tool_calls_made=all_tool_calls,
                    )

                # For non-retryable errors, include error info in result for LLM
                if result.get("error") and not result.get("retryable", False):
                    result["_error_hint"] = (
                        f"Tool '{tool_name}' failed: {result.get('error')}. "
                        "Consider calling final_answer with an explanation."
                    )

                tool_results.append({
                    "tool": tool_name,
                    "result": result,
                })

            # Add tool call and results to conversation for next iteration
            messages.append({
                "role": "assistant",
                "tool_calls": response.tool_calls,
            })
            messages.append({
                "role": "tool",
                "content": json.dumps(tool_results),
            })

        else:
            # LLM responded without tool calls - treat as final answer
            # This shouldn't happen if the LLM follows instructions, but handle it
            logger.warning("LLM responded without calling final_answer tool")

            # If we have content, use it
            if response.content:
                suggested = generate_follow_up_questions(
                    response.content,
                    all_tool_calls,
                    context,
                )
                return AgentResult(
                    response=response.content,
                    tool_calls_made=all_tool_calls,
                    suggested_questions=suggested,
                )

            # No content - build a response from tool results
            if all_tool_calls:
                graceful = _build_graceful_response(None, all_tool_calls, context)
                suggested = generate_follow_up_questions(
                    graceful,
                    all_tool_calls,
                    context,
                )
                return AgentResult(
                    response=graceful,
                    error="empty_response",
                    tool_calls_made=all_tool_calls,
                    suggested_questions=suggested,
                )

            # No tool calls and no content - generic error
            return AgentResult(
                response="I couldn't generate a response. Please try rephrasing your question.",
                error="empty_response",
                tool_calls_made=all_tool_calls,
            )

    # Max iterations reached without final_answer
    logger.warning(f"Agent reached max iterations ({MAX_TOOL_CALLS})")

    # Build graceful degradation response
    graceful_response = _build_graceful_response("max_iterations", all_tool_calls, context)

    suggested = generate_follow_up_questions(
        graceful_response,
        all_tool_calls,
        context,
    )

    return AgentResult(
        response=graceful_response,
        error="max_iterations",
        tool_calls_made=all_tool_calls,
        suggested_questions=suggested,
    )


def _build_messages(message: str, context: AgentContext) -> List[Dict[str, Any]]:
    """Build the messages list for the LLM call.

    Args:
        message: User's current message
        context: Agent context

    Returns:
        List of message dicts for the LLM
    """
    messages = []

    # System prompt
    system_prompt = AGENT_SYSTEM_PROMPT

    # Add game context if available
    if context.app_ids:
        game_info = []
        for app_id in context.app_ids:
            name = context.game_names.get(app_id, f"Game {app_id}")
            game_info.append(f"- {name} (app_id={app_id})")

        system_prompt += f"\n\n## Current Game Context\nThe user is asking about:\n" + "\n".join(game_info)
        system_prompt += "\n\nUse the app_id when calling tools. If multiple games, assume the first one unless the user specifies."

    # Defaults/constraints from the current chat request
    if context.date_filter and context.date_filter != "all":
        system_prompt += f"\n\n## Review Window\nDefault date filter: {context.date_filter}"
    if context.max_reviews_per_game:
        system_prompt += f"\nMax review snippets per search: {context.max_reviews_per_game} (hard cap 50)"

    if context.language:
        system_prompt += f"\n\n## Response Language\nRespond in {context.language}."

    # Add session context for follow-up awareness
    session = context.session_context
    if session.last_topic or session.last_tool_calls:
        system_prompt += "\n\n## Previous Turn Context"

        if session.last_topic:
            system_prompt += f"\n- Last discussed topic: {session.last_topic}"
            system_prompt += f"\n- If user says 'same for X' or 'what about Y', reuse filters from last query with new subcategory."

        if session.last_tool_calls:
            last_tools = [c.get("tool") for c in session.last_tool_calls[:3]]
            system_prompt += f"\n- Last tools used: {', '.join(last_tools)}"
            system_prompt += "\n- Last tool parameters (reuse when user says 'same'/'what about'):"
            for call in session.last_tool_calls[:3]:
                tool = call.get("tool", "")
                params = call.get("params") or {}
                if not tool:
                    continue
                keep_keys = [
                    "app_id",
                    "app_id_1",
                    "app_id_2",
                    "subcategory",
                    "query",
                    "sentiment",
                    "weeks",
                    "category",
                    "metric",
                    "limit",
                ]
                parts = []
                for key in keep_keys:
                    value = params.get(key)
                    if value in (None, "", [], {}):
                        continue
                    parts.append(f"{key}={value!r}" if isinstance(value, str) else f"{key}={value}")
                if parts:
                    system_prompt += f"\n  - {tool}({', '.join(parts)})"
                else:
                    system_prompt += f"\n  - {tool}"

        if session.last_search_results:
            system_prompt += f"\n- {len(session.last_search_results)} reviews from last search are cached."
            system_prompt += "\n- Cached examples (for 'show me more'/'other examples'):"
            for r in session.last_search_results[:3]:
                rid = (r.get("review_id") or "").strip()
                text = (r.get("text") or "").strip().replace("\n", " ")
                if not text:
                    continue
                snippet = text[:200] + ("..." if len(text) > 200 else "")
                if rid:
                    system_prompt += f"\n  - {rid}: {snippet}"
                else:
                    system_prompt += f"\n  - {snippet}"

    messages.append({"role": "system", "content": system_prompt})

    # Add conversation history (last few turns for context)
    history_to_include = context.conversation_history[-6:]  # Last 3 exchanges
    for hist_msg in history_to_include:
        messages.append(hist_msg)

    # Add current user message
    messages.append({"role": "user", "content": message})

    return messages


def _friendly_tool_name(tool_name: str) -> str:
    """Convert tool name to user-friendly status message."""
    friendly_names = {
        "search_reviews": "Searching reviews",
        "get_subcategory_stats": "Loading statistics",
        "get_top_issues": "Analyzing issues",
        "get_feature_requests": "Finding feature requests",
        "list_available_topics": "Listing available topics",
        "get_top_praises": "Finding positive themes",
        "get_sentiment_trend": "Loading sentiment trend",
        "compare_games": "Comparing games",
        "get_game_overview": "Loading game overview",
        "clarify_question": "Preparing question",
        "final_answer": "Preparing response",
        "compare_time_windows": "Comparing time windows",
        "compare_sentiment_trend": "Comparing sentiment trends",
    }
    return friendly_names.get(tool_name, f"Processing {tool_name}")


def build_clarification_response(options: List[str], context_text: str) -> str:
    """Build a user-facing clarification message.

    Args:
        options: List of clarification options
        context_text: Why clarification is needed

    Returns:
        Formatted clarification message
    """
    response = f"I need a bit more information to help you.\n\n{context_text}\n\n"
    response += "Please choose one of the following:\n"
    for i, option in enumerate(options, 1):
        response += f"{i}. {option}\n"
    return response
