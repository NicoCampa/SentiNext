"""Config, settings, and health endpoints."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db as db_module, dialect as d

APP_VERSION = "0.8.1"

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _log_file_path() -> Path:
    raw = os.getenv("SENTINEXT_LOG_FILE")
    if raw:
        return Path(raw).expanduser()
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    return data_dir / "logs" / "backend.log"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
def healthcheck() -> dict:
    from fastapi.responses import JSONResponse
    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if not db_module.startup_complete.is_set():
        return JSONResponse(
            status_code=503,
            content={"status": "starting", "database": "initializing", "timestamp": ts},
        )
    db_ok = db_module.check_db_health()
    if not db_ok:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "unreachable", "timestamp": ts},
        )
    return {"status": "ok", "database": "connected", "timestamp": ts, "version": APP_VERSION}


@router.get("/settings/storage")
def storage_paths() -> dict:
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    log_file = _log_file_path()
    return {
        "database": "SQLite",
        "data_dir": str(data_dir),
        "logs_dir": str(log_file.parent),
        "log_file": str(log_file),
    }


class LLMProviderInfo(BaseModel):
    name: str
    models: List[str] = Field(default_factory=list)
    has_key: bool = False
    is_active: bool = False


class LLMSettingsResponse(BaseModel):
    provider: str
    model: str
    model_id: str
    api_key_configured: bool = False


class LLMSettingsUpdate(BaseModel):
    provider: str = Field(..., description="Provider name: gemini, xai, openai, ollama")
    model: str = Field(..., description="Model name (e.g. gpt-5-mini, gemini-flash-lite-latest)")


@router.get("/settings/providers", response_model=List[LLMProviderInfo])
def list_llm_providers() -> List[LLMProviderInfo]:
    """List available LLM providers with their API key status and suggested models."""
    from ..providers import list_providers
    return [LLMProviderInfo(**p) for p in list_providers()]


@router.get("/settings/llm", response_model=LLMSettingsResponse)
def llm_settings() -> LLMSettingsResponse:
    """Return current LLM provider and model configuration."""
    from ..providers import get_active_config
    from ..providers.config import _provider_has_key

    config = get_active_config()
    return LLMSettingsResponse(
        provider=config["provider"],
        model=config["model"],
        model_id=config["model_id"],
        api_key_configured=_provider_has_key(config["provider"]),
    )


@router.put("/settings/llm", response_model=LLMSettingsResponse)
def update_llm_settings(body: LLMSettingsUpdate) -> LLMSettingsResponse:
    """Change the active LLM provider and model at runtime."""
    from ..providers import set_active_provider, clear_cache, get_active_config, SUGGESTED_MODELS
    from ..providers.config import _provider_has_key

    valid_providers = set(SUGGESTED_MODELS.keys())
    if body.provider not in valid_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{body.provider}'. Must be one of: {sorted(valid_providers)}",
        )

    if body.provider != "ollama" and not _provider_has_key(body.provider):
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' has no API key configured. Add one in Settings or set the environment variable.",
        )

    set_active_provider(body.provider, body.model)
    clear_cache()

    config = get_active_config()
    return LLMSettingsResponse(
        provider=config["provider"],
        model=config["model"],
        model_id=config["model_id"],
        api_key_configured=_provider_has_key(config["provider"]),
    )


class MaxWorkersResponse(BaseModel):
    max_workers: int


class MaxWorkersUpdate(BaseModel):
    max_workers: int = Field(..., ge=1, le=50, description="Number of parallel LLM requests (1-50)")


@router.get("/settings/max-workers", response_model=MaxWorkersResponse)
def get_max_workers_setting() -> MaxWorkersResponse:
    from ..providers.config import get_max_workers
    return MaxWorkersResponse(max_workers=get_max_workers())


@router.put("/settings/max-workers", response_model=MaxWorkersResponse)
def update_max_workers_setting(body: MaxWorkersUpdate) -> MaxWorkersResponse:
    from ..providers.config import set_max_workers, get_max_workers
    set_max_workers(body.max_workers)
    return MaxWorkersResponse(max_workers=get_max_workers())


class LLMTestResponse(BaseModel):
    status: str  # "ok" or "error"
    message: str
    model_id: str = ""
    response_time_ms: int = 0


@router.post("/settings/llm/test", response_model=LLMTestResponse)
def test_llm_connection(body: LLMSettingsUpdate) -> LLMTestResponse:
    """Send a single test prompt to verify the LLM provider works."""
    import time
    from ..providers import get_provider, SUGGESTED_MODELS
    from ..providers.config import _provider_has_key

    valid_providers = set(SUGGESTED_MODELS.keys())
    if body.provider not in valid_providers:
        raise HTTPException(status_code=400, detail=f"Invalid provider '{body.provider}'.")

    if body.provider != "ollama" and not _provider_has_key(body.provider):
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' has no API key configured.",
        )

    model_id = f"{body.provider}:{body.model}"
    try:
        provider = get_provider(name=body.provider, model=body.model)
        start = time.monotonic()
        result = provider.generate(
            prompt="Reply with exactly: OK",
            system="You are a test assistant. Reply with exactly the word OK and nothing else.",
            temperature=0.0,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return LLMTestResponse(
            status="ok",
            message=f"Connection successful ({elapsed_ms}ms). Model responded: {result.strip()[:80]}",
            model_id=model_id,
            response_time_ms=elapsed_ms,
        )
    except Exception as exc:
        logger.warning("LLM test failed for %s: %s", model_id, exc)
        return LLMTestResponse(
            status="error",
            message=str(exc)[:300],
            model_id=model_id,
        )


class ApiKeyUpdate(BaseModel):
    provider: str = Field(..., description="Provider name: gemini, xai, openai")
    api_key: str = Field(..., description="API key value (empty string to remove)")


class ApiKeyStatusResponse(BaseModel):
    keys: Dict[str, bool]  # provider -> has_key


@router.get("/settings/api-keys", response_model=ApiKeyStatusResponse)
def get_api_key_status() -> ApiKeyStatusResponse:
    """Return which providers have API keys configured (without exposing keys)."""
    from ..providers.config import get_api_key_status as _status
    return ApiKeyStatusResponse(keys=_status())


@router.put("/settings/api-keys", response_model=ApiKeyStatusResponse)
def update_api_key(body: ApiKeyUpdate) -> ApiKeyStatusResponse:
    """Save or remove an API key for a provider."""
    from ..providers.config import save_api_key, get_api_key_status as _status, _PROVIDER_ENV_VARS
    from ..providers import clear_cache

    if body.provider not in _PROVIDER_ENV_VARS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{body.provider}'. Must be one of: {sorted(_PROVIDER_ENV_VARS.keys())}",
        )

    save_api_key(body.provider, body.api_key)
    clear_cache()

    return ApiKeyStatusResponse(keys=_status())


@router.get("/logs/tail")
def logs_tail(bytes: int = 20000) -> dict:
    limit = max(0, min(int(bytes or 0), 200000))
    path = _log_file_path()
    if not path.exists():
        return {"log_file": str(path), "tail": ""}
    try:
        with path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - limit))
            chunk = handle.read()
        return {"log_file": str(path), "tail": chunk.decode("utf-8", errors="replace")}
    except Exception as exc:
        logger.warning("Failed to read log file: %s", exc)
        return {"log_file": str(path), "tail": ""}
