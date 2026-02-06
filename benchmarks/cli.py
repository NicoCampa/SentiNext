from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Sequence

from .config import BenchmarkConfig, load_config
from .env import load_env_files
from .reporting import summarize_results
from .runner import run_benchmark
from .tools.build_steam_dataset import build_steam_dataset


def _comma_list(value: str) -> list[str]:
    items = [item.strip() for item in (value or "").split(",")]
    return [item for item in items if item]


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m benchmarks")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build-steam-dataset", help="Build a local Steam dataset snapshot (gitignored).")
    p_build.add_argument("--output", required=True, help="Output directory for the dataset.")
    p_build.add_argument("--app-ids", required=True, nargs=3, type=int, help="Exactly 3 Steam app IDs.")
    p_build.add_argument(
        "--languages",
        default="english,italian,spanish,german",
        help="Comma-separated Steam languages (default: english,italian,spanish,german).",
    )
    p_build.add_argument("--per-lang-pos", type=int, default=25, help="Positive reviews per (game, language).")
    p_build.add_argument("--per-lang-neg", type=int, default=25, help="Negative reviews per (game, language).")
    p_build.add_argument("--filter", default="recent", choices=["recent", "all"], help="Steam filter (default: recent).")
    p_build.add_argument("--seed", type=int, default=42, help="Deterministic sampling seed.")
    p_build.add_argument("--max-review-chars", type=int, default=1200, help="Max characters per review text.")

    p_run = sub.add_parser("run", help="Run the benchmark suite.")
    p_run.add_argument("--config", required=True, help="Path to benchmark TOML config.")
    p_run.add_argument("--dataset", default=None, help="Override dataset path.")
    p_run.add_argument("--suite", default=None, choices=["quick", "core", "full"], help="Override suite.")
    p_run.add_argument("--models", default=None, help='Override model ids (comma separated, e.g. "openai:gpt-4o-mini").')
    p_run.add_argument("--judge-provider", default=None, help="Override judge provider (openai|google|xai|ollama).")
    p_run.add_argument("--judge-model", default=None, help="Override judge model name.")
    p_run.add_argument("--max-concurrency", type=int, default=None, help="Override max concurrency.")
    p_run.add_argument("--no-cache", action="store_true", help="Disable cache for this run.")

    p_sum = sub.add_parser("summarize", help="Summarize an existing results directory.")
    p_sum.add_argument("results_dir", help="Path to an existing benchmarks/results/<run_id> directory.")

    return parser.parse_args(list(argv) if argv is not None else None)


def _apply_overrides(cfg: BenchmarkConfig, args: argparse.Namespace) -> BenchmarkConfig:
    run = cfg.run
    models = cfg.models
    judge = cfg.judge

    if args.dataset:
        run = run.model_copy(dataset=Path(args.dataset))
    if args.suite:
        run = run.model_copy(suite=str(args.suite))
    if args.max_concurrency is not None:
        run = run.model_copy(max_concurrency=int(args.max_concurrency))
    if args.no_cache:
        run = run.model_copy(no_cache=True)

    if args.models:
        allow = set(_comma_list(args.models))
        models = [m for m in models if m.id in allow]
        if not models:
            raise SystemExit(f"No models left after --models filter: {sorted(allow)}")

    if args.judge_provider or args.judge_model:
        judge = judge.model_copy(
            provider=str(args.judge_provider or judge.provider),
            model=str(args.judge_model or judge.model),
        )

    return cfg.model_copy(run=run, models=models, judge=judge)


def main(argv: Sequence[str] | None = None) -> int:
    # Auto-load environment variables from repo root and benchmarks/.env
    repo_root = Path(__file__).resolve().parents[1]
    load_env_files([repo_root / ".env", repo_root / "benchmarks" / ".env"])

    args = _parse_args(argv)

    if args.cmd == "build-steam-dataset":
        out_dir = Path(args.output)
        languages = _comma_list(args.languages)
        dataset = build_steam_dataset(
            output_dir=out_dir,
            app_ids=list(args.app_ids),
            languages=languages,
            per_lang_pos=int(args.per_lang_pos),
            per_lang_neg=int(args.per_lang_neg),
            review_filter=str(args.filter),
            seed=int(args.seed),
            max_review_chars=int(args.max_review_chars),
        )
        print(json.dumps(dataset, indent=2, ensure_ascii=False))
        return 0

    if args.cmd == "run":
        cfg = load_config(Path(args.config))
        cfg = _apply_overrides(cfg, args)
        results_dir = run_benchmark(cfg)
        print(str(results_dir))
        return 0

    if args.cmd == "summarize":
        results_dir = Path(args.results_dir)
        summary = summarize_results(results_dir)
        print(json.dumps(summary, indent=2, ensure_ascii=False))
        return 0

    raise SystemExit(f"Unknown command: {args.cmd}")
