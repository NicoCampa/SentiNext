"""LLM provider registry for SentiNext.

Usage:
    from apps.api.senti_next.providers import get_provider, list_providers, get_active_config

    provider = get_provider()           # get current active provider
    provider = get_provider("gemini")   # get a specific provider
"""
from __future__ import annotations

import logging
from typing import Any

from .base import LLMProvider
from .config import (
    get_active_provider,
    get_available_providers,
    set_active_provider,
    SUGGESTED_MODELS,
)

logger = logging.getLogger(__name__)

# Cache instantiated providers to avoid repeated construction
_provider_cache: dict[str, LLMProvider] = {}


def get_provider(name: str | None = None, model: str | None = None) -> LLMProvider:
    """Get an LLM provider instance.

    Args:
        name: Provider name ('gemini', 'xai', 'openai', 'ollama').
              If None, uses the active provider from config.
        model: Model name override. If None, uses the configured model.

    Returns:
        An LLMProvider instance.
    """
    if name is None:
        name, default_model = get_active_provider()
        if model is None:
            model = default_model

    cache_key = f"{name}:{model or 'default'}"
    if cache_key in _provider_cache:
        return _provider_cache[cache_key]

    provider = _create_provider(name, model)
    _provider_cache[cache_key] = provider
    return provider


def _create_provider(name: str, model: str | None) -> LLMProvider:
    """Instantiate a provider by name."""
    if name == "gemini":
        from .gemini import GeminiProvider
        return GeminiProvider(model_name=model)
    elif name == "xai":
        from .xai import XAIProvider
        return XAIProvider(model_name=model)
    elif name == "openai":
        from .openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(provider_type="openai", model_name=model)
    elif name == "ollama":
        from .openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(provider_type="ollama", model_name=model)
    else:
        raise ValueError(f"Unknown provider: {name!r}. Available: gemini, xai, openai, ollama")


def list_providers() -> list[dict[str, Any]]:
    """Return available providers with their configuration status.

    Returns:
        List of dicts with keys: name, models, has_key, is_active.
    """
    return get_available_providers()


def get_active_config() -> dict[str, Any]:
    """Return the current active provider/model configuration.

    Returns:
        Dict with 'provider', 'model', and 'model_id' keys.
    """
    name, model = get_active_provider()
    return {
        "provider": name,
        "model": model,
        "model_id": f"{name}:{model}",
    }


def clear_cache() -> None:
    """Clear the provider instance cache (useful after config changes)."""
    _provider_cache.clear()


__all__ = [
    "LLMProvider",
    "get_provider",
    "list_providers",
    "get_active_config",
    "set_active_provider",
    "clear_cache",
    "SUGGESTED_MODELS",
]
