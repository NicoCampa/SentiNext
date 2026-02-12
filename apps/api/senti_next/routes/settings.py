"""Config, settings, health, and admin status endpoints."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .. import storage, db as db_module, dialect as d
from ._guards import admin_token, env_flag, require_admin_token

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

class LLMUsageBreakdownItem(BaseModel):
    operation: Optional[str] = None
    model: Optional[str] = None
    calls: int = 0
    prompt_tokens: int = 0
    response_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    tool_use_prompt_tokens: int = 0
    thoughts_tokens: int = 0


class LLMUsageSummaryResponse(BaseModel):
    since: str
    days: int
    total_calls: int = 0
    prompt_tokens: int = 0
    response_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    tool_use_prompt_tokens: int = 0
    thoughts_tokens: int = 0
    by_operation: List[LLMUsageBreakdownItem] = Field(default_factory=list)
    by_model: List[LLMUsageBreakdownItem] = Field(default_factory=list)


class LLMCostBreakdown(BaseModel):
    key: str
    calls: int = 0
    prompt_tokens: int = 0
    response_tokens: int = 0
    total_tokens: int = 0
    cost_input_usd: float = 0.0
    cost_output_usd: float = 0.0
    cost_total_usd: float = 0.0


class LLMCostSummary(BaseModel):
    calls: int = 0
    prompt_tokens: int = 0
    response_tokens: int = 0
    total_tokens: int = 0
    cost_input_usd: float = 0.0
    cost_output_usd: float = 0.0
    cost_total_usd: float = 0.0
    by_operation: List[LLMCostBreakdown] = Field(default_factory=list)
    by_model: List[LLMCostBreakdown] = Field(default_factory=list)


class AdminDashboardResponse(BaseModel):
    since: str
    days: int
    llm: LLMCostSummary


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
def healthcheck() -> dict:
    from fastapi.responses import JSONResponse
    db_ok = db_module.check_db_health()
    if not db_ok:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "unreachable", "timestamp": datetime.now(timezone.utc).isoformat() + "Z"},
        )
    return {"status": "ok", "database": "connected", "timestamp": datetime.now(timezone.utc).isoformat() + "Z"}


@router.get("/config")
def get_config() -> dict:
    """Return public runtime configuration for the frontend."""
    return {}


@router.get("/settings/storage")
def storage_paths() -> dict:
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    log_file = _log_file_path()
    return {
        "database": "SQLite (local)" if d.is_sqlite() else "PostgreSQL (external)",
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


@router.get("/auth/status")
def auth_status(x_admin_token: Optional[str] = Header(default=None, alias="x-admin-token")) -> dict:
    expected = admin_token()
    token_configured = bool(expected)
    is_admin = (not token_configured) or ((x_admin_token or "").strip() == expected)
    return {
        "user_id": "local",
        "is_admin": is_admin,
    }


@router.post("/admin/verify")
def admin_verify(_: None = Depends(require_admin_token)) -> dict:
    return {"ok": True}


@router.get("/admin/status")
def admin_status() -> dict:
    token_configured = bool(admin_token())
    return {
        "destructive_enabled": env_flag("SENTINEXT_ENABLE_DESTRUCTIVE", True),
        "token_configured": token_configured,
        "admin_user_ids_configured": not token_configured,
    }


# ---------------------------------------------------------------------------
# Admin dashboard & usage
# ---------------------------------------------------------------------------

@router.get("/admin/llm-usage/summary", response_model=LLMUsageSummaryResponse)
def get_admin_llm_usage_summary(
    days: int = 30,
    user_id: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
    _: None = Depends(require_admin_token),
) -> LLMUsageSummaryResponse:
    try:
        summary = storage.get_llm_usage_summary(
            days=days,
            user_id=user_id,
            app_id=app_id,
            session_id=session_id,
        )
        return LLMUsageSummaryResponse(**summary)
    except Exception as exc:
        logger.exception("Failed to load LLM usage summary: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load LLM usage summary.") from exc


@router.get("/admin/dashboard", response_model=AdminDashboardResponse)
def get_admin_dashboard(days: int = 30, _: None = Depends(require_admin_token)) -> AdminDashboardResponse:
    try:
        safe_days = max(1, min(int(days or 30), 365))

        llm_usage = storage.get_llm_usage_summary(days=safe_days)

        by_model_costs = []
        for item in llm_usage.get("by_model", []) or []:
            model_id = str(item.get("model") or "unknown")
            prompt_tokens = int(item.get("prompt_tokens", 0) or 0)
            response_tokens = int(item.get("response_tokens", 0) or 0)
            by_model_costs.append(
                LLMCostBreakdown(
                    key=model_id,
                    calls=int(item.get("calls", 0) or 0),
                    prompt_tokens=prompt_tokens,
                    response_tokens=response_tokens,
                    total_tokens=int(item.get("total_tokens", 0) or 0),
                )
            )

        by_operation_costs = []
        for item in llm_usage.get("by_operation", []) or []:
            operation = str(item.get("operation") or "unknown")
            prompt_tokens = int(item.get("prompt_tokens", 0) or 0)
            response_tokens = int(item.get("response_tokens", 0) or 0)
            by_operation_costs.append(
                LLMCostBreakdown(
                    key=operation,
                    calls=int(item.get("calls", 0) or 0),
                    prompt_tokens=prompt_tokens,
                    response_tokens=response_tokens,
                    total_tokens=int(item.get("total_tokens", 0) or 0),
                )
            )

        llm_payload = LLMCostSummary(
            calls=int(llm_usage.get("total_calls", 0) or 0),
            prompt_tokens=int(llm_usage.get("prompt_tokens", 0) or 0),
            response_tokens=int(llm_usage.get("response_tokens", 0) or 0),
            total_tokens=int(llm_usage.get("total_tokens", 0) or 0),
            by_operation=by_operation_costs,
            by_model=by_model_costs,
        )

        return AdminDashboardResponse(
            since=str(llm_usage.get("since") or ""),
            days=int(llm_usage.get("days", safe_days) or safe_days),
            llm=llm_payload,
        )
    except Exception as exc:
        logger.exception("Failed to load admin dashboard: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load admin dashboard.") from exc
