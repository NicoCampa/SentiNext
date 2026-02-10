from __future__ import annotations

import dataclasses
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping

try:
    import tomllib  # py3.11+
except Exception:  # pragma: no cover
    try:
        import tomli as tomllib  # type: ignore
    except Exception:  # pragma: no cover
        tomllib = None  # type: ignore


_ALLOWED_PROVIDERS = {"openai", "xai", "ollama", "google", "mock"}
_ALLOWED_SUITES = {"quick", "core", "full"}


def _as_path(value: Any, *, base_dir: Path) -> Path:
    p = Path(str(value)).expanduser()
    if not p.is_absolute():
        p = (base_dir / p).resolve()
    return p


def _require(mapping: Mapping[str, Any], key: str) -> Any:
    if key not in mapping:
        raise ValueError(f"Missing required config key: {key}")
    return mapping[key]


@dataclass(frozen=True)
class ProviderDefaults:
    base_url: str | None = None
    api_key_env: str | None = None


@dataclass(frozen=True)
class RunConfig:
    dataset: Path
    suite: str
    seed: int = 42
    max_concurrency: int = 4
    timeout_s: int = 60
    retries: int = 2
    cache_db: Path = Path("tooling/benchmarks/.cache/cache.sqlite")
    results_dir: Path = Path("tooling/benchmarks/results")
    pricing_table: Path | None = None
    no_cache: bool = False
    tasks: list[str] | None = None

    def model_copy(self, **kwargs: Any) -> "RunConfig":
        return replace(self, **kwargs)


@dataclass(frozen=True)
class ModelConfig:
    id: str
    provider: str
    model: str
    temperature: float = 0.2
    max_tokens: int = 8192
    base_url: str | None = None
    api_key_env: str | None = None

    def model_copy(self, **kwargs: Any) -> "ModelConfig":
        return replace(self, **kwargs)


@dataclass(frozen=True)
class JudgeConfig:
    provider: str
    model: str
    temperature: float = 0.0
    max_tokens: int = 8192
    base_url: str | None = None
    api_key_env: str | None = None

    def model_copy(self, **kwargs: Any) -> "JudgeConfig":
        return replace(self, **kwargs)


@dataclass(frozen=True)
class BenchmarkConfig:
    run: RunConfig
    models: list[ModelConfig]
    judge: JudgeConfig
    providers: dict[str, ProviderDefaults]

    def model_copy(self, **kwargs: Any) -> "BenchmarkConfig":
        return replace(self, **kwargs)


def _default_provider_defaults() -> dict[str, ProviderDefaults]:
    return {
        "openai": ProviderDefaults(base_url="https://api.openai.com/v1", api_key_env="OPENAI_API_KEY"),
        "xai": ProviderDefaults(base_url="https://api.x.ai/v1", api_key_env="XAI_API_KEY"),
        "ollama": ProviderDefaults(base_url="http://localhost:11434/v1", api_key_env=None),
        "google": ProviderDefaults(base_url=None, api_key_env="GEMINI_API_KEY"),
        "mock": ProviderDefaults(base_url=None, api_key_env=None),
    }


def load_config(path: Path) -> BenchmarkConfig:
    if tomllib is None:  # pragma: no cover
        raise RuntimeError("tomllib not available. Use Python 3.11+ or install tomli.")
    # Resolve relative paths from the repo root (more intuitive when configs live under tooling/benchmarks/configs/).
    base_dir = Path(__file__).resolve().parents[2]
    raw = tomllib.loads(path.read_text(encoding="utf-8"))

    run_raw = _require(raw, "run")
    dataset = _as_path(_require(run_raw, "dataset"), base_dir=base_dir)
    suite = str(_require(run_raw, "suite"))
    if suite not in _ALLOWED_SUITES:
        raise ValueError(f"Invalid suite '{suite}'. Allowed: {sorted(_ALLOWED_SUITES)}")

    pricing_table = run_raw.get("pricing_table")
    pricing_path = _as_path(pricing_table, base_dir=base_dir) if pricing_table else None

    run = RunConfig(
        dataset=dataset,
        suite=suite,
        seed=int(run_raw.get("seed", 42)),
        max_concurrency=int(run_raw.get("max_concurrency", 4)),
        timeout_s=int(run_raw.get("timeout_s", 60)),
        retries=int(run_raw.get("retries", 2)),
        cache_db=_as_path(run_raw.get("cache_db", "tooling/benchmarks/.cache/cache.sqlite"), base_dir=base_dir),
        results_dir=_as_path(run_raw.get("results_dir", "tooling/benchmarks/results"), base_dir=base_dir),
        pricing_table=pricing_path,
        no_cache=bool(run_raw.get("no_cache", False)),
        tasks=list(run_raw["tasks"]) if "tasks" in run_raw else None,
    )

    providers_defaults = _default_provider_defaults()
    providers_cfg: dict[str, ProviderDefaults] = dict(providers_defaults)
    user_providers = raw.get("providers") or {}
    if not isinstance(user_providers, dict):
        raise ValueError("Config key [providers] must be a table/dict.")
    for prov, prov_raw in user_providers.items():
        if prov not in _ALLOWED_PROVIDERS:
            raise ValueError(f"Unknown provider '{prov}' in [providers]. Allowed: {sorted(_ALLOWED_PROVIDERS)}")
        if not isinstance(prov_raw, dict):
            raise ValueError(f"[providers.{prov}] must be a table/dict.")
        existing = providers_cfg.get(prov, ProviderDefaults())
        providers_cfg[prov] = ProviderDefaults(
            base_url=str(prov_raw.get("base_url")) if prov_raw.get("base_url") else existing.base_url,
            api_key_env=str(prov_raw.get("api_key_env")) if prov_raw.get("api_key_env") else existing.api_key_env,
        )

    judge_raw = _require(raw, "judge")
    judge_provider = str(_require(judge_raw, "provider"))
    if judge_provider not in _ALLOWED_PROVIDERS:
        raise ValueError(f"Invalid judge provider '{judge_provider}'. Allowed: {sorted(_ALLOWED_PROVIDERS)}")

    judge_defaults = providers_cfg.get(judge_provider, ProviderDefaults())
    judge = JudgeConfig(
        provider=judge_provider,
        model=str(_require(judge_raw, "model")),
        temperature=float(judge_raw.get("temperature", 0.0)),
        max_tokens=int(judge_raw.get("max_tokens", 8192)),
        base_url=str(judge_raw.get("base_url")) if judge_raw.get("base_url") else judge_defaults.base_url,
        api_key_env=str(judge_raw.get("api_key_env")) if judge_raw.get("api_key_env") else judge_defaults.api_key_env,
    )

    models_raw = raw.get("models")
    if not isinstance(models_raw, list) or not models_raw:
        raise ValueError("Config must define at least one [[models]] entry.")

    models: list[ModelConfig] = []
    seen_ids: set[str] = set()
    for entry in models_raw:
        if not isinstance(entry, dict):
            raise ValueError("Each [[models]] entry must be a table/dict.")
        provider = str(_require(entry, "provider"))
        if provider not in _ALLOWED_PROVIDERS:
            raise ValueError(f"Invalid model provider '{provider}'. Allowed: {sorted(_ALLOWED_PROVIDERS)}")
        model_name = str(_require(entry, "model"))
        model_id = str(entry.get("id") or f"{provider}:{model_name}")
        if model_id in seen_ids:
            raise ValueError(f"Duplicate model id: {model_id}")
        seen_ids.add(model_id)

        defaults = providers_cfg.get(provider, ProviderDefaults())
        models.append(
            ModelConfig(
                id=model_id,
                provider=provider,
                model=model_name,
                temperature=float(entry.get("temperature", 0.2)),
                max_tokens=int(entry.get("max_tokens", 8192)),
                base_url=str(entry.get("base_url")) if entry.get("base_url") else defaults.base_url,
                api_key_env=str(entry.get("api_key_env")) if entry.get("api_key_env") else defaults.api_key_env,
            )
        )

    if not run.dataset.exists():
        raise ValueError(f"Dataset path does not exist: {run.dataset}")

    return BenchmarkConfig(run=run, models=models, judge=judge, providers=providers_cfg)
