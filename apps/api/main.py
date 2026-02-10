from __future__ import annotations

import asyncio
import collections
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, Optional

# Load environment variables from .env.local (for local development)
from dotenv import load_dotenv
_env_path = Path(__file__).resolve().parents[2] / ".env.local"
if _env_path.exists():
    load_dotenv(_env_path)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .senti_next import storage
from .senti_next import redis_client
from .senti_next import logging_config
from .senti_next import db as db_module
from .senti_next.routes import all_routers

# ---------------------------------------------------------------------------
# Sentry error monitoring (no-op if SENTRY_DSN is not set)
# ---------------------------------------------------------------------------
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=_sentry_dsn,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        )
    except Exception:
        pass  # Sentry is optional; don't block startup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Startup environment validation
# ---------------------------------------------------------------------------
def _validate_startup_env() -> None:
    """Fail fast if critical environment variables are missing."""
    errors: list[str] = []

    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_xai = bool(os.getenv("XAI_API_KEY"))
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_ollama = bool(os.getenv("SENTINEXT_OLLAMA_BASE_URL")) or os.path.exists("/usr/local/bin/ollama") or os.path.exists("/usr/bin/ollama")
    if not has_gemini and not has_xai and not has_openai and not has_ollama:
        errors.append("At least one LLM provider is required (GEMINI_API_KEY, XAI_API_KEY, OPENAI_API_KEY, or Ollama).")

    if errors:
        for err in errors:
            logger.error("Startup validation failed: %s", err)
        raise RuntimeError("Startup validation failed:\n  - " + "\n  - ".join(errors))

_validate_startup_env()

storage.init_db()

# Configure structured logging (JSON or text based on SENTINEXT_LOG_FORMAT)
logging_config.configure_logging()

APP_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("SENTINEXT_ALLOWED_ORIGINS")
    if not raw:
        return APP_ORIGINS
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or APP_ORIGINS

ALLOWED_ORIGINS = _parse_allowed_origins()


def _log_file_path() -> Path:
    raw = os.getenv("SENTINEXT_LOG_FILE")
    if raw:
        return Path(raw).expanduser()
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    return data_dir / "logs" / "backend.log"


def _configure_file_logging() -> None:
    """Write backend logs to a rotating file in the local data directory (optional)."""
    if os.getenv("SENTINEXT_LOG_FORMAT") == "json" and not os.getenv("SENTINEXT_LOG_FILE"):
        return

    log_file = _log_file_path()
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        return

    level_name = os.getenv("SENTINEXT_LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()

    for handler in root.handlers:
        if isinstance(handler, RotatingFileHandler) and getattr(handler, "baseFilename", "") == str(log_file):
            return

    handler = RotatingFileHandler(
        log_file,
        maxBytes=int(os.getenv("SENTINEXT_LOG_MAX_BYTES", "2000000")),
        backupCount=int(os.getenv("SENTINEXT_LOG_BACKUPS", "3")),
        encoding="utf-8",
    )
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(handler)


_configure_file_logging()

# ---------------------------------------------------------------------------
# Graceful shutdown via lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(application: FastAPI):
    # Startup
    logger.info("SentiNext API starting up")
    yield
    # Shutdown
    logger.info("SentiNext API shutting down")
    try:
        if redis_client.is_redis_configured():
            redis_client.get_redis().close()
            logger.info("Redis connection closed")
    except Exception as exc:
        logger.warning("Error closing Redis: %s", exc)
    db_module.close_engine()
    logger.info("Database engine closed")


app = FastAPI(
    title="SENTINEXT API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["content-type", "authorization", "x-admin-token"],
    expose_headers=["Content-Disposition"],
)


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
    )


# ---------------------------------------------------------------------------
# Rate limiting (Redis-backed with in-memory fallback)
# ---------------------------------------------------------------------------

_rate_limit_buckets: Dict[str, collections.deque] = {}

_RATE_LIMITS: Dict[str, int] = {
    "/analyze": 5,
    "/chat": 20,
    "/chat/simple": 20,
}
_DEFAULT_RATE_LIMIT = 60
_RATE_WINDOW_SECONDS = 60
_RATE_EXEMPT = {"/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico"}

_TRUSTED_PROXIES: set[str] = set(
    p.strip()
    for p in os.getenv("SENTINEXT_TRUSTED_PROXIES", "").split(",")
    if p.strip()
)


def _get_rate_key(request: Request) -> str:
    client = request.client
    client_ip = client.host if client else None
    if client_ip and client_ip in _TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{client_ip}" if client_ip else "ip:unknown"


async def _check_rate_limit_redis(key: str, limit: int) -> bool:
    try:
        r = redis_client.get_redis()
        redis_key = f"rl:{key}"
        count = r.incr(redis_key)
        if count == 1:
            r.expire(redis_key, _RATE_WINDOW_SECONDS)
        return count <= limit
    except Exception:
        return await _check_rate_limit_memory(key, limit)


_rate_limit_lock = asyncio.Lock()


async def _check_rate_limit_memory(key: str, limit: int) -> bool:
    async with _rate_limit_lock:
        now = time.time()
        bucket = _rate_limit_buckets.setdefault(key, collections.deque())
        while bucket and bucket[0] < now - _RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path in _RATE_EXEMPT or request.method == "OPTIONS":
        return await call_next(request)

    limit = _DEFAULT_RATE_LIMIT
    for prefix, max_req in _RATE_LIMITS.items():
        if path == prefix or path.startswith(prefix + "/"):
            limit = max_req
            break

    key = f"{_get_rate_key(request)}:{path.split('/')[1] if '/' in path[1:] else path}"

    if redis_client.is_redis_configured():
        allowed = await _check_rate_limit_redis(key, limit)
    else:
        allowed = await _check_rate_limit_memory(key, limit)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again shortly."},
            headers={"Retry-After": "60"},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# API request logging middleware
# ---------------------------------------------------------------------------

_USAGE_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico"}

_NUMERIC_SEGMENT_RE = re.compile(r"/(\d+)(?=/|$)")

def _normalize_api_path(path: str) -> str:
    return _NUMERIC_SEGMENT_RE.sub("/{id}", path)

_APP_ID_RE = re.compile(
    r"(?:/analysis|/progress|/starred|/steam|/reviews|/export|/chat)"
    r"/(\d+)"
)

def _extract_app_id(path: str) -> Optional[int]:
    m = _APP_ID_RE.search(path)
    return int(m.group(1)) if m else None


@app.middleware("http")
async def usage_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)

    if request.url.path in _USAGE_SKIP_PATHS:
        return response

    user_id = "local"
    path = _normalize_api_path(request.url.path)
    app_id = _extract_app_id(request.url.path)

    try:
        storage.log_api_request(
            user_id=user_id,
            method=request.method,
            path=path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            app_id=app_id,
        )
    except Exception:
        pass

    return response


# ---------------------------------------------------------------------------
# Include all routers
# ---------------------------------------------------------------------------

for router in all_routers:
    app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
