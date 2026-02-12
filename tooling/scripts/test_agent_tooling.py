#!/usr/bin/env python3
"""Run an end-to-end tooling test for the agent across Gemini models."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@dataclass
class TestStep:
    name: str
    message: str
    expected_tools: Set[str]
    allow_error_codes: Set[str] = field(default_factory=set)


@dataclass
class Scenario:
    name: str
    app_ids: List[int]
    steps: List[TestStep]


@dataclass
class StepResult:
    name: str
    message: str
    expected_tools: List[str]
    tool_calls: List[Dict[str, Any]]
    response: str
    passed: bool
    skipped: bool = False
    failures: List[str] = field(default_factory=list)


@dataclass
class ScenarioResult:
    name: str
    app_ids: List[int]
    session_id: str
    steps: List[StepResult]
    passed: bool


@dataclass
class ModelResult:
    model: str
    model_id: str
    scenarios: List[ScenarioResult]
    prompt_tokens: int
    response_tokens: int
    total_tokens: int
    estimated_cost: float
    passed: bool


PRICING = {
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
    "gemini-flash-lite-latest": {"input": 0.10, "output": 0.40},
}


def _load_env() -> None:
    load_dotenv(REPO_ROOT / ".env.local")


def _get_engine():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (check .env.local).")
    return create_engine(url)


def _load_game_names(engine, user_id: str, app_ids: List[int]) -> Dict[int, str]:
    if not app_ids:
        return {}
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT app_id, name
                FROM starred_games
                WHERE user_id = :user_id AND app_id = ANY(:app_ids)
                """
            ),
            {"user_id": user_id, "app_ids": [int(aid) for aid in app_ids]},
        ).fetchall()
    return {int(row[0]): row[1] or f"Game {row[0]}" for row in rows}


def _resolve_user_id(engine, preferred: Optional[str], app_ids: List[int]) -> str:
    if preferred and preferred not in {"auto", ""}:
        return preferred
    if not app_ids:
        return preferred or "local"
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT user_id, COUNT(*) AS matches
                FROM starred_games
                WHERE app_id = ANY(:app_ids)
                GROUP BY user_id
                ORDER BY matches DESC
                LIMIT 1
                """
            ),
            {"app_ids": [int(aid) for aid in app_ids]},
        ).fetchone()
    if row and row[0]:
        return str(row[0])
    return preferred or "local"


def _summarize_usage(engine, session_ids: List[str], model_id: str, operation: str) -> Dict[str, int]:
    if not session_ids:
        return {"prompt_tokens": 0, "response_tokens": 0, "total_tokens": 0}
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                    COALESCE(SUM(response_tokens), 0) AS response_tokens,
                    COALESCE(SUM(total_tokens), 0) AS total_tokens
                FROM llm_usage
                WHERE session_id = ANY(:session_ids)
                  AND model = :model_id
                  AND operation = :operation
                """
            ),
            {
                "session_ids": session_ids,
                "model_id": model_id,
                "operation": operation,
            },
        ).mappings().fetchone()
    return {
        "prompt_tokens": int(row["prompt_tokens"] or 0),
        "response_tokens": int(row["response_tokens"] or 0),
        "total_tokens": int(row["total_tokens"] or 0),
    }


def _estimate_cost(model: str, prompt_tokens: int, response_tokens: int) -> float:
    pricing = PRICING.get(model)
    if not pricing:
        return 0.0
    # Pricing assumed per 1M tokens
    return (prompt_tokens / 1_000_000) * pricing["input"] + (response_tokens / 1_000_000) * pricing["output"]


def _build_scenarios() -> List[Scenario]:
    # Primary game: Cyberpunk 2077 (1091500) — large dataset
    # Secondary game: Hades II (1145350) — for comparison scenarios
    PRIMARY = 1091500
    SECONDARY = 1145350

    return [
        Scenario(
            name="top_issues_drilldown",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="top_issues",
                    message="What are the top issues players mention?",
                    expected_tools={"get_top_issues"},
                ),
                TestStep(
                    name="top_issue_reviews",
                    message="Show me specific reviews about the top issue",
                    expected_tools={"search_reviews"},
                ),
            ],
        ),
        Scenario(
            name="available_topics",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="list_topics",
                    message="What topics are available to analyze?",
                    expected_tools={"list_available_topics"},
                ),
            ],
        ),
        Scenario(
            name="feature_requests",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="top_requests",
                    message="What features are players requesting the most?",
                    expected_tools={"get_feature_requests"},
                ),
            ],
        ),
        Scenario(
            name="sentiment_trend",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="sentiment_trend",
                    message="Show the sentiment trend over the last 90 days.",
                    expected_tools={"get_sentiment_trend"},
                    allow_error_codes={"data_not_found"},
                ),
            ],
        ),
        Scenario(
            name="compare_time_windows",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="compare_issues_30d",
                    message="Compare top issues between the last 30 days and the previous 30 days.",
                    expected_tools={"compare_time_windows"},
                ),
            ],
        ),
        Scenario(
            name="game_overview",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="overview",
                    message="Give me a quick game overview and recommendation rate.",
                    expected_tools={"get_game_overview"},
                ),
            ],
        ),
        Scenario(
            name="top_praises",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="praises",
                    message="What do players praise most about the game?",
                    expected_tools={"get_top_praises"},
                ),
            ],
        ),
        Scenario(
            name="subcategory_stats",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="perf_stats",
                    message="How many reviews mention technical/performance?",
                    expected_tools={"get_subcategory_stats"},
                ),
            ],
        ),
        Scenario(
            name="search_reviews",
            app_ids=[PRIMARY],
            steps=[
                TestStep(
                    name="crash_reviews",
                    message="Find reviews that mention crashes.",
                    expected_tools={"search_reviews"},
                ),
            ],
        ),
        Scenario(
            name="compare_games",
            app_ids=[PRIMARY, SECONDARY],
            steps=[
                TestStep(
                    name="compare_issues",
                    message="Compare Cyberpunk 2077 with Hades II on top issues.",
                    expected_tools={"compare_games"},
                ),
            ],
        ),
        Scenario(
            name="compare_sentiment_trend",
            app_ids=[PRIMARY, SECONDARY],
            steps=[
                TestStep(
                    name="compare_sentiment",
                    message="Compare sentiment trends between Cyberpunk 2077 and Hades II over the last 12 weeks.",
                    expected_tools={"compare_sentiment_trend"},
                    allow_error_codes={"data_not_found"},
                ),
            ],
        ),
    ]


async def _run_scenario(
    scenario: Scenario,
    *,
    user_id: str,
    language: Optional[str],
    engine,
    operation: str,
) -> ScenarioResult:
    from apps.api.senti_next import chat_agent
    from apps.api.senti_next import llm as llm_module

    session_id = str(uuid.uuid4())
    conversation_history: List[Dict[str, str]] = []
    game_names = _load_game_names(engine, user_id, scenario.app_ids)

    step_results: List[StepResult] = []

    for step in scenario.steps:
        context = chat_agent.AgentContext(
            user_id=user_id,
            session_id=session_id,
            app_ids=scenario.app_ids,
            date_filter="all",
            max_reviews_per_game=50,
            language=language,
            conversation_history=list(conversation_history),
            game_names=game_names,
        )

        with llm_module.llm_usage_context(
            user_id=user_id,
            session_id=session_id,
            app_id=scenario.app_ids[0] if scenario.app_ids else None,
            operation=operation,
        ):
            result = await chat_agent.run_agent(step.message, context)

        failures: List[str] = []
        skipped = False
        tool_calls = result.tool_calls_made or []

        if result.needs_clarification:
            failures.append("agent_requested_clarification")
        if result.suggest_search_game:
            failures.append("agent_requested_game_selection")
        if not tool_calls:
            failures.append("no_tool_calls")

        tool_names = {call.get("tool") for call in tool_calls}
        if step.expected_tools and not (tool_names & step.expected_tools):
            failures.append(
                f"missing_expected_tools:{','.join(sorted(step.expected_tools))}"
            )

        for call in tool_calls:
            res = call.get("result") or {}
            error_code = res.get("error_code")
            if error_code and error_code in step.allow_error_codes:
                skipped = True
                continue
            if res.get("error") or error_code:
                failures.append(f"tool_error:{call.get('tool')}")

        response_text = result.response or ""
        if "No analysis available" in response_text or "select a game" in response_text.lower():
            failures.append("insufficient_data_response")

        step_results.append(
            StepResult(
                name=step.name,
                message=step.message,
                expected_tools=sorted(step.expected_tools),
                tool_calls=tool_calls,
                response=response_text,
                passed=not failures,
                skipped=skipped and not failures,
                failures=failures,
            )
        )

        conversation_history.extend(
            [
                {"role": "user", "content": step.message},
                {"role": "assistant", "content": response_text},
            ]
        )

    scenario_passed = all(step.passed for step in step_results)
    return ScenarioResult(
        name=scenario.name,
        app_ids=scenario.app_ids,
        session_id=session_id,
        steps=step_results,
        passed=scenario_passed,
    )


async def run_models(models: List[str], language: Optional[str], user_id: str) -> List[ModelResult]:
    from apps.api.senti_next import chat_tools
    from apps.api.senti_next import llm as llm_module

    engine = _get_engine()
    scenarios = _build_scenarios()
    results: List[ModelResult] = []

    for model in models:
        # Update model used by the Gemini client
        llm_module.GEMINI_MODEL = model
        # Clear tool cache to avoid cross-test reuse
        chat_tools.clear_tool_cache()

        scenario_results: List[ScenarioResult] = []
        session_ids: List[str] = []

        for scenario in scenarios:
            scenario_result = await _run_scenario(
                scenario,
                user_id=user_id,
                language=language,
                engine=engine,
                operation="agent_tooling_test",
            )
            scenario_results.append(scenario_result)
            session_ids.append(scenario_result.session_id)

        model_id = f"google:{model}"
        usage = _summarize_usage(engine, session_ids, model_id, "agent_tooling_test")
        estimated_cost = _estimate_cost(model, usage["prompt_tokens"], usage["response_tokens"])
        model_passed = all(s.passed for s in scenario_results)

        results.append(
            ModelResult(
                model=model,
                model_id=model_id,
                scenarios=scenario_results,
                prompt_tokens=usage["prompt_tokens"],
                response_tokens=usage["response_tokens"],
                total_tokens=usage["total_tokens"],
                estimated_cost=estimated_cost,
                passed=model_passed,
            )
        )

    return results


def _print_summary(model_results: List[ModelResult]) -> None:
    print("\nAgent Tooling Test Summary")
    print("===========================")
    for model_result in model_results:
        status = "PASS" if model_result.passed else "FAIL"
        print(f"\nModel: {model_result.model} ({status})")
        print(f"  Prompt tokens:   {model_result.prompt_tokens}")
        print(f"  Response tokens: {model_result.response_tokens}")
        print(f"  Total tokens:    {model_result.total_tokens}")
        if model_result.estimated_cost:
            print(f"  Est. cost (USD): {model_result.estimated_cost:.4f} (assumes $/1M tokens)")

        for scenario in model_result.scenarios:
            scenario_status = "PASS" if scenario.passed else "FAIL"
            print(f"  - {scenario.name}: {scenario_status}")
            for step in scenario.steps:
                if step.skipped:
                    step_status = "SKIP"
                else:
                    step_status = "PASS" if step.passed else "FAIL"
                print(f"    - {step.name}: {step_status}")
                if step.failures:
                    print(f"      failures: {', '.join(step.failures)}")


def _write_report(model_results: List[ModelResult]) -> Path:
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pricing_assumption": "USD per 1M tokens",
        "models": [],
    }

    for model_result in model_results:
        report["models"].append(
            {
                "model": model_result.model,
                "model_id": model_result.model_id,
                "prompt_tokens": model_result.prompt_tokens,
                "response_tokens": model_result.response_tokens,
                "total_tokens": model_result.total_tokens,
                "estimated_cost": model_result.estimated_cost,
                "passed": model_result.passed,
                "scenarios": [
                    {
                        "name": scenario.name,
                        "app_ids": scenario.app_ids,
                        "session_id": scenario.session_id,
                        "passed": scenario.passed,
                        "steps": [
                            {
                                "name": step.name,
                                "message": step.message,
                                "expected_tools": step.expected_tools,
                                "passed": step.passed,
                                "skipped": step.skipped,
                                "failures": step.failures,
                                "tool_calls": step.tool_calls,
                                "response": step.response,
                            }
                            for step in scenario.steps
                        ],
                    }
                    for scenario in model_result.scenarios
                ],
            }
        )

    reports_dir = REPO_ROOT / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    filename = f"agent_tooling_test_{time.strftime('%Y%m%d-%H%M%S')}.json"
    path = reports_dir / filename
    path.write_text(json.dumps(report, indent=2))
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run agent tooling tests across Gemini models.")
    parser.add_argument(
        "--models",
        default="gemini-2.5-flash,gemini-flash-lite-latest",
        help="Comma-separated list of Gemini models to test.",
    )
    parser.add_argument(
        "--user-id",
        default="auto",
        help="User ID for context (default: auto-detect from starred games).",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Response language (UI locale), e.g. en/it/fr/de. Set empty to disable.",
    )
    return parser.parse_args()


def main() -> int:
    _load_env()
    args = parse_args()
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if not models:
        print("No models provided.")
        return 1

    language = args.language.strip() if args.language else None

    scenarios = _build_scenarios()
    required_app_ids = sorted({aid for scenario in scenarios for aid in scenario.app_ids})
    engine = _get_engine()
    user_id = _resolve_user_id(engine, args.user_id, required_app_ids)

    try:
        model_results = asyncio.run(run_models(models, language, user_id))
    except KeyboardInterrupt:
        print("Interrupted.")
        return 1

    _print_summary(model_results)
    report_path = _write_report(model_results)
    print(f"\nReport written to {report_path}")

    if all(m.passed for m in model_results):
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
