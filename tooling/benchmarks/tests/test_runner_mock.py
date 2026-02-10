from __future__ import annotations

from pathlib import Path

from tooling.benchmarks.config import BenchmarkConfig, JudgeConfig, ModelConfig, ProviderDefaults, RunConfig
from tooling.benchmarks.runner import run_benchmark


def test_run_benchmark_with_mock_providers(tmp_path: Path) -> None:
    cfg = BenchmarkConfig(
        run=RunConfig(
            dataset=Path("tooling/benchmarks/datasets/synthetic_v1"),
            suite="quick",
            seed=42,
            max_concurrency=2,
            timeout_s=5,
            retries=0,
            cache_db=tmp_path / "cache.sqlite",
            results_dir=tmp_path / "results",
            pricing_table=None,
            no_cache=True,
        ),
        models=[
            ModelConfig(
                id="mock:candidate",
                provider="mock",
                model="mock-candidate",
                temperature=0.2,
                max_tokens=800,
            )
        ],
        judge=JudgeConfig(
            provider="mock",
            model="mock-judge",
            temperature=0.0,
            max_tokens=800,
        ),
        providers={"mock": ProviderDefaults()},
    )

    results_dir = run_benchmark(cfg)
    assert (results_dir / "meta.json").exists()
    assert (results_dir / "calls.jsonl").exists()
    assert (results_dir / "judgments.jsonl").exists()
    assert (results_dir / "summary.md").exists()

