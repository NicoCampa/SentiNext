from __future__ import annotations

from pathlib import Path

from tooling.benchmarks.config import load_config


def test_load_config_minimal(tmp_path: Path) -> None:
    dataset = (Path.cwd() / "tooling" / "benchmarks" / "datasets" / "synthetic_v1").resolve()
    cfg_path = tmp_path / "bench.toml"
    cfg_path.write_text(
        """
[run]
dataset = "REPLACE_DATASET"
suite = "quick"

[judge]
provider = "mock"
model = "mock-judge"

[[models]]
provider = "mock"
model = "mock-candidate"
""".strip().replace("REPLACE_DATASET", str(dataset)),
        encoding="utf-8",
    )

    cfg = load_config(cfg_path)
    assert cfg.run.suite == "quick"
    assert cfg.judge.provider == "mock"
    assert cfg.models[0].provider == "mock"
