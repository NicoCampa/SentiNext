"""Runtime LLM provider configuration."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SUGGESTED_MODELS: dict[str, list[str]] = {
    "gemini": ["gemini-2.0-flash-lite", "gemini-2.0-flash"],
    "xai": ["grok-3-fast", "grok-3"],
    "openai": ["gpt-4o-mini", "gpt-4o"],
    "ollama": ["llama3.1:8b", "qwen2.5:7b", "gemma2:9b"],
}

# Default model per provider (first suggested model)
DEFAULT_MODELS: dict[str, str] = {k: v[0] for k, v in SUGGESTED_MODELS.items()}

# Priority order for auto-detection
_PROVIDER_PRIORITY = ["xai", "gemini", "openai", "ollama"]

_CONFIG_DIR = Path(os.getenv("SENTINEXT_DATA_DIR", "data"))
_CONFIG_FILE = _CONFIG_DIR / "llm_config.json"


def _load_config() -> dict[str, Any]:
    """Load config from disk, returning empty dict on failure."""
    try:
        if _CONFIG_FILE.exists():
            return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.debug("Failed to load LLM config: %s", exc)
    return {}


def _save_config(cfg: dict[str, Any]) -> None:
    """Persist config to disk."""
    try:
        _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        _CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to save LLM config: %s", exc)


def _provider_has_key(provider: str) -> bool:
    """Check if a provider's API key is configured."""
    if provider == "gemini":
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    if provider == "xai":
        return bool(os.getenv("XAI_API_KEY"))
    if provider == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if provider == "ollama":
        # Ollama is always potentially available (local server)
        return True
    return False


def get_available_providers() -> list[dict[str, Any]]:
    """Return providers that have API keys configured.

    Returns:
        List of dicts with 'name', 'models', 'has_key', and 'is_active'.
    """
    active_provider, _ = get_active_provider()
    result = []
    for name in _PROVIDER_PRIORITY:
        has_key = _provider_has_key(name)
        result.append({
            "name": name,
            "models": SUGGESTED_MODELS.get(name, []),
            "has_key": has_key,
            "is_active": name == active_provider,
        })
    return result


def get_active_provider() -> tuple[str, str]:
    """Return (provider_name, model_name) for the currently active provider.

    Priority:
    1. Explicit config in llm_config.json
    2. Environment variables (SENTINEXT_LLM_PROVIDER / SENTINEXT_LLM_MODEL)
    3. Auto-detect first available provider with a key
    """
    # Check persisted config
    cfg = _load_config()
    if cfg.get("provider") and cfg.get("model"):
        provider = cfg["provider"]
        model = cfg["model"]
        if _provider_has_key(provider):
            return provider, model

    # Check environment variables
    env_provider = os.getenv("SENTINEXT_LLM_PROVIDER", "").strip().lower()
    env_model = os.getenv("SENTINEXT_LLM_MODEL", "").strip()
    if env_provider and env_provider in SUGGESTED_MODELS:
        model = env_model or DEFAULT_MODELS.get(env_provider, "")
        if _provider_has_key(env_provider):
            return env_provider, model

    # Auto-detect: first provider with a key
    for name in _PROVIDER_PRIORITY:
        if _provider_has_key(name) and name != "ollama":
            return name, DEFAULT_MODELS.get(name, "")

    # Fallback to ollama (always "available")
    return "ollama", DEFAULT_MODELS.get("ollama", "llama3.1:8b")


def set_active_provider(provider: str, model: str) -> None:
    """Persist the active provider and model choice."""
    cfg = _load_config()
    cfg["provider"] = provider
    cfg["model"] = model
    _save_config(cfg)
    logger.info("Active LLM provider set to %s/%s", provider, model)
