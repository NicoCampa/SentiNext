"""Auth and safety guards shared across route modules."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException


def admin_token() -> str:
    return (os.getenv("SENTINEXT_ADMIN_TOKEN") or "").strip()


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def require_admin_token(x_admin_token: Optional[str] = Header(default=None, alias="x-admin-token")) -> None:
    expected = admin_token()
    if not expected:
        return
    if (x_admin_token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token.")


def require_destructive_access(x_admin_token: Optional[str] = Header(default=None, alias="x-admin-token")) -> None:
    if not env_flag("SENTINEXT_ENABLE_DESTRUCTIVE", False):
        raise HTTPException(
            status_code=403,
            detail="Destructive actions are disabled by SENTINEXT_ENABLE_DESTRUCTIVE.",
        )
    require_admin_token(x_admin_token)
