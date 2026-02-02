"""Agentic chat execution loop for multi-step tool-calling conversations."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .chat_tools import (
    CHAT_TOOLS,
    execute_tool,
    format_tools_for_gemini,
    generate_follow_up_questions,
)

logger = logging.getLogger(__name__)

# Maximum tool calls per conversation turn to prevent infinite loops
MAX_TOOL_CALLS = 5


@dataclass
class AgentContext:
    """Context maintained throughout an agentic conversation turn."""

    user_id: str
    session_id: str
    app_ids: List[int] = field(default_factory=list)
    conversation_history: List[Dict[str, Any]] = field(default_factory=list)
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    game_names: Dict[int, str] = field(default_factory=dict)  # app_id -> name mapping


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
    # Game selection suggestion
    suggest_game_selection: bool = False
    suggested_games: List[Dict[str, Any]] = field(default_factory=list)
    game_selection_message: str = ""
    # Suggest searching for a game
    suggest_search_game: bool = False
    search_game_name: str = ""
    error: Optional[str] = None


AGENT_SYSTEM_PROMPT = """You are a game review analyst assistant for SentiNext. You help users understand player feedback by analyzing Steam reviews.

## CRITICAL RULES
1. **ALWAYS call final_answer** - Every response MUST end with final_answer. This is REQUIRED.
2. **Use 1-2 tool calls max** - Get the data you need quickly, then call final_answer.
3. **Never loop on similar tools** - If one tool returns data, use it and call final_answer.
4. **If no game context** - Tell user they need to select a game from the sidebar first.
5. **NEVER ask what a game is** - You already know the game context (provided below). The user has selected a Steam game, and you're analyzing its reviews. Do NOT ask "what is [game name]?" or "what does [game] refer to?" - just use the tools to get data and answer.
6. **You are a GAME REVIEW analyst** - All questions are about the selected Steam game(s). Don't ask for clarification about the game type - it's always a video game.

## Tools (call sparingly, then final_answer)
- **list_available_games**: List user's starred games. Use when user mentions a game by name.
- **suggest_game_selection**: Suggest games for user to select. Use when user mentions a game and you find matches.
- **get_game_overview**: Overall stats (recommendation rate, total reviews, category breakdown). USE THIS for general questions.
- **get_top_issues**: Top complaints/issues. Use for "what are the problems?" questions.
- **get_feature_requests**: Most requested features.
- **search_reviews**: Find specific reviews by keyword or subcategory.
- **get_subcategory_stats**: Stats for a SPECIFIC path like "technical/performance" (NOT just "technical").
- **get_sentiment_trend**: Weekly sentiment over time.
- **compare_games**: Compare two games.
- **final_answer**: REQUIRED. Provide your response. Call this AFTER getting data.

## Game Selection Flow
If user mentions a game by name (e.g., "tell me about Cyberpunk" or "analyze Elden Ring"):
1. Call list_available_games to get available games
2. Search for matches by name (case-insensitive, partial match OK)
3. If ONE match: proceed with analysis using that game's app_id
4. If MULTIPLE matches: call suggest_game_selection with the matches
5. If NO matches: call suggest_search_game with the game name - this shows a "Search" button to find the game

## Subcategory Format
Subcategories MUST be full paths with "/" separator:
- CORRECT: "technical/performance", "gameplay/difficulty", "ui_ux_accessibility/menus_hud"
- WRONG: "technical", "gameplay", "performance" (these are incomplete)

## Example Flows

**"Show me recommendation rate" or "Create a pie chart"**
1. Call get_game_overview(app_id=X)
2. Call final_answer with the chart

**"What are the main issues?"**
1. Call get_top_issues(app_id=X, limit=5)
2. Call final_answer with the results

**"Tell me about performance"**
1. Call get_subcategory_stats(app_id=X, subcategory="technical/performance")
2. Call final_answer with the stats

## Chart Format (in final_answer response)
Use Chart.js format with labels array and datasets array:

```chart
{"type": "pie", "title": "Recommendation Rate", "data": {"labels": ["Positive", "Negative"], "datasets": [{"data": [75, 25]}]}}
```

Bar chart example:
```chart
{"type": "bar", "title": "Top Issues", "data": {"labels": ["Bugs", "Performance", "Balance"], "datasets": [{"label": "Count", "data": [45, 32, 28]}]}}
```

Valid types: "pie", "bar", "line", "doughnut"
"""


async def run_agent(
    message: str,
    context: AgentContext,
    status_callback: Optional[Callable[[str], None]] = None,
) -> AgentResult:
    """Run the agentic chat loop.

    The agent will:
    1. Send the message + tools to the LLM
    2. If LLM calls tools, execute them and loop
    3. If LLM calls final_answer, return response
    4. Max 5 iterations to prevent runaway

    Args:
        message: User's message
        context: Agent context with user info, game context, history
        status_callback: Optional callback for status updates (for SSE)

    Returns:
        AgentResult with response, citations, tool calls made, etc.
    """
    from .llm import call_llm_with_tools

    # Format tools for Gemini
    tools_schema = format_tools_for_gemini()

    # Build initial messages
    messages = _build_messages(message, context)

    # Track all tool calls for this turn
    all_tool_calls = []

    for iteration in range(MAX_TOOL_CALLS):
        if status_callback:
            status_callback(f"Thinking... (step {iteration + 1})")

        logger.info(f"Agent iteration {iteration + 1}/{MAX_TOOL_CALLS}")

        try:
            # Call LLM with tools
            response = await call_llm_with_tools(messages, tools_schema)
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
                    status_callback(f"Fetching: {_friendly_tool_name(tool_name)}...")

                logger.info(f"Executing tool: {tool_name}")

                # Execute the tool
                result = execute_tool(tool_name, tool_params, context)

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
                    suggested = generate_follow_up_questions(
                        result.get("response", ""),
                        all_tool_calls,
                        context,
                    )
                    return AgentResult(
                        response=result.get("response", ""),
                        citations=result.get("citations", []),
                        tool_calls_made=all_tool_calls,
                        suggested_questions=suggested,
                    )

                # Clarification needed - return to user
                if result.get("needs_clarification"):
                    return AgentResult(
                        response="",
                        needs_clarification=True,
                        clarification_options=result.get("options", []),
                        clarification_context=result.get("context", ""),
                        tool_calls_made=all_tool_calls,
                    )

                # Game selection suggestion - return to user
                if result.get("suggest_selection"):
                    return AgentResult(
                        response=result.get("message", "Please select a game:"),
                        suggest_game_selection=True,
                        suggested_games=result.get("games", []),
                        game_selection_message=result.get("message", ""),
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

            suggested = generate_follow_up_questions(
                response.content or "",
                all_tool_calls,
                context,
            )

            return AgentResult(
                response=response.content or "I couldn't generate a response.",
                tool_calls_made=all_tool_calls,
                suggested_questions=suggested,
            )

    # Max iterations reached without final_answer
    logger.warning(f"Agent reached max iterations ({MAX_TOOL_CALLS})")

    return AgentResult(
        response="I couldn't complete the analysis within the allowed steps. Please try a simpler question.",
        error="max_iterations",
        tool_calls_made=all_tool_calls,
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
        "search_reviews": "reviews",
        "get_subcategory_stats": "statistics",
        "get_top_issues": "issues data",
        "get_feature_requests": "feature requests",
        "get_sentiment_trend": "sentiment trend",
        "compare_games": "comparison data",
        "clarify_question": "clarification",
        "final_answer": "response",
    }
    return friendly_names.get(tool_name, tool_name)


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
