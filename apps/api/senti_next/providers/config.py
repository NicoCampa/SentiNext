"""Runtime LLM provider configuration."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SUGGESTED_MODELS: dict[str, list[str]] = {
    "gemini": ["gemini-flash-lite-latest", "gemini-flash-latest"],
    "xai": ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning"],
    "openai": ["gpt-5-mini", "gpt-5-nano"],
    "ollama": ["llama3.1:8b", "qwen2.5:7b", "gemma2:9b"],
}

# Default model per provider (first suggested model)
DEFAULT_MODELS: dict[str, str] = {k: v[0] for k, v in SUGGESTED_MODELS.items()}

# Priority order for auto-detection
_PROVIDER_PRIORITY = ["xai", "gemini", "openai", "ollama"]

_CONFIG_DIR = Path(os.getenv("SENTINEXT_DATA_DIR", "data"))
_CONFIG_FILE = _CONFIG_DIR / "llm_config.json"
_API_KEYS_FILE = _CONFIG_DIR / "api_keys.json"

# Mapping: provider name -> env var name used by the provider at runtime
_PROVIDER_ENV_VARS: dict[str, list[str]] = {
    "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "xai": ["XAI_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
}


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


# ---------------------------------------------------------------------------
# API key management (stored keys)
# ---------------------------------------------------------------------------

def _load_stored_keys() -> dict[str, str]:
    """Load stored API keys from disk."""
    try:
        if _API_KEYS_FILE.exists():
            return json.loads(_API_KEYS_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.debug("Failed to load stored API keys: %s", exc)
    return {}


def _save_stored_keys(keys: dict[str, str]) -> None:
    """Persist API keys to disk."""
    try:
        _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        _API_KEYS_FILE.write_text(json.dumps(keys, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to save API keys: %s", exc)


def load_stored_api_keys() -> None:
    """Load stored API keys into os.environ so providers can use them.

    Called at startup and after saving new keys.
    Only sets env vars that are not already set (env vars take precedence).
    """
    stored = _load_stored_keys()
    for provider, env_vars in _PROVIDER_ENV_VARS.items():
        key_value = stored.get(provider, "").strip()
        if not key_value:
            continue
        # Set the primary env var for this provider (first in list)
        primary_var = env_vars[0]
        if not os.getenv(primary_var):
            os.environ[primary_var] = key_value


def save_api_key(provider: str, api_key: str) -> None:
    """Save an API key for a provider and inject it into the environment."""
    stored = _load_stored_keys()
    if api_key.strip():
        stored[provider] = api_key.strip()
        # Inject into environment immediately so providers pick it up
        env_vars = _PROVIDER_ENV_VARS.get(provider, [])
        if env_vars:
            os.environ[env_vars[0]] = api_key.strip()
    else:
        # Remove key
        stored.pop(provider, None)
        env_vars = _PROVIDER_ENV_VARS.get(provider, [])
        for var in env_vars:
            os.environ.pop(var, None)
    _save_stored_keys(stored)
    logger.info("API key %s for provider %s", "saved" if api_key.strip() else "removed", provider)


def get_api_key_status() -> dict[str, bool]:
    """Return which providers have API keys configured (env or stored)."""
    return {
        name: _provider_has_key(name)
        for name in _PROVIDER_PRIORITY
        if name != "ollama"
    }


def _provider_has_key(provider: str) -> bool:
    """Check if a provider's API key is configured (env vars or stored keys)."""
    if provider == "gemini":
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    if provider == "xai":
        return bool(os.getenv("XAI_API_KEY"))
    if provider == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if provider == "ollama":
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
    3. No default — returns ("", "") so the user must choose via settings
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

    # No auto-detection — user must configure via settings or env vars
    return "", ""


def set_active_provider(provider: str, model: str) -> None:
    """Persist the active provider and model choice."""
    cfg = _load_config()
    cfg["provider"] = provider
    cfg["model"] = model
    _save_config(cfg)
    logger.info("Active LLM provider set to %s/%s", provider, model)


# Load stored keys into environment on module import
load_stored_api_keys()
