"""Offline license validation helpers."""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from . import storage


@dataclass
class LicenseStatus:
    valid: bool
    reason: str
    license_id: Optional[str] = None
    issued_to: Optional[str] = None
    expires_at: Optional[str] = None
    features: list[str] = None


def _enforcement_enabled() -> bool:
    value = os.getenv("SENTINEXT_LICENSE_ENFORCE", "true").strip().lower()
    return value in {"1", "true", "yes"}


def _license_path() -> Path:
    raw = os.getenv("SENTINEXT_LICENSE_PATH")
    if raw:
        return Path(raw).expanduser()
    return storage.db_path().parent / "license.json"


def _load_public_key() -> Optional[bytes]:
    raw = os.getenv("SENTINEXT_LICENSE_PUBLIC_KEY")
    if raw:
        return base64.b64decode(raw)
    key_file = os.getenv("SENTINEXT_LICENSE_PUBLIC_KEY_FILE")
    if key_file:
        return Path(key_file).expanduser().read_bytes()
    return None


def _load_license_file() -> Optional[dict]:
    path = _license_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def _canonical_payload(payload: dict) -> bytes:
    data = {key: value for key, value in payload.items() if key != "signature"}
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def _parse_expiry(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def get_license_status() -> LicenseStatus:
    if not _enforcement_enabled():
        return LicenseStatus(valid=True, reason="License enforcement disabled.", features=[])

    public_key_bytes = _load_public_key()
    if not public_key_bytes:
        return LicenseStatus(valid=False, reason="License public key not configured.", features=[])

    payload = _load_license_file()
    if not payload:
        return LicenseStatus(valid=False, reason="License file not found or invalid.", features=[])

    signature_b64 = payload.get("signature")
    if not signature_b64:
        return LicenseStatus(valid=False, reason="License signature missing.", features=[])

    try:
        signature = base64.b64decode(signature_b64)
    except Exception:
        return LicenseStatus(valid=False, reason="License signature is invalid.", features=[])

    try:
        public_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
        public_key.verify(signature, _canonical_payload(payload))
    except Exception:
        return LicenseStatus(valid=False, reason="License signature verification failed.", features=[])

    expires_at = _parse_expiry(payload.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        return LicenseStatus(
            valid=False,
            reason="License has expired.",
            license_id=payload.get("license_id"),
            issued_to=payload.get("issued_to"),
            expires_at=expires_at.isoformat(),
            features=payload.get("features") or [],
        )

    return LicenseStatus(
        valid=True,
        reason="License valid.",
        license_id=payload.get("license_id"),
        issued_to=payload.get("issued_to"),
        expires_at=expires_at.isoformat() if expires_at else None,
        features=payload.get("features") or [],
    )


def require_license() -> None:
    status = get_license_status()
    if not status.valid:
        raise PermissionError(status.reason)
