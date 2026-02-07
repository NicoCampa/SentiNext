from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
import os
import re
import secrets
import csv
import io
from datetime import datetime
import hashlib
from pathlib import Path
import asyncio
import time
from typing import Any, Dict, List, Optional, Union

# Load environment variables from .env.local (for local development)
from dotenv import load_dotenv
_env_path = Path(__file__).resolve().parents[1] / ".env.local"
if _env_path.exists():
    load_dotenv(_env_path)

import pandas as pd
import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from .senti_next import (
    STEAM_LANGUAGES,
    SteamAPIError,
    build_reviews_dataframe,
    fetch_reviews,
    fetch_reviews_multi_language,
    search_applications,
)
from .senti_next import ingest
from .senti_next.steam_api import (
    fetch_app_details,
    fetch_news_for_app,
    fetch_current_players,
    fetch_global_achievements,
    fetch_achievement_schema,
    fetch_achievements_with_stats,
)
from .senti_next.insights import prepare_insights
from .senti_next.analysis import recommended_share_over_time
from .senti_next import storage
from .senti_next import llm
from .senti_next import license as license_guard
from .senti_next import chat
from .senti_next import chat_agent
from .senti_next import redis_client
from .senti_next import jobs as job_runner
from .senti_next import logging_config
from .senti_next import credits
from .senti_next import stripe_billing
from .senti_next import db as db_module

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

    # At least one LLM key must be configured
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_xai = bool(os.getenv("XAI_API_KEY"))
    if not has_gemini and not has_xai:
        errors.append("At least one LLM API key is required (GEMINI_API_KEY or XAI_API_KEY).")

    # If auth is enabled, JWKS URL is required
    auth_enabled = os.getenv("SENTINEXT_AUTH_ENABLED", "false").lower() in {"1", "true", "yes"}
    if auth_enabled:
        jwks_url = os.getenv("SENTINEXT_AUTH_JWKS_URL") or os.getenv("SENTINEXT_CLERK_JWKS_URL")
        if not jwks_url:
            errors.append(
                "Auth is enabled but SENTINEXT_CLERK_JWKS_URL is not set. "
                "Set SENTINEXT_CLERK_JWKS_URL or disable auth."
            )

    if errors:
        for err in errors:
            logger.error("Startup validation failed: %s", err)
        raise RuntimeError("Startup validation failed:\n  - " + "\n  - ".join(errors))

_validate_startup_env()

# Review limits - configurable via environment
SAMPLE_LIMIT = int(os.getenv("SENTINEXT_SAMPLE_LIMIT", "1000"))  # Reviews to sample for analysis
FETCH_LIMIT = int(os.getenv("SENTINEXT_FETCH_LIMIT", "1000"))    # Max reviews to fetch from Steam (matches MAX_REVIEWS_PER_GAME)

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


def _validate_redirect_url(url: str, label: str = "URL") -> None:
    """Validate that a redirect URL belongs to an allowed origin (prevents open redirects)."""
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {label}.")
    if not parsed.scheme or not parsed.netloc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}: must be an absolute URL.")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {label}: redirect must point to an allowed origin.",
        )


ADMIN_TOKEN = os.getenv("SENTINEXT_ADMIN_TOKEN")
DESTRUCTIVE_ENABLED = os.getenv("SENTINEXT_ENABLE_DESTRUCTIVE", "false").lower() in {"1", "true", "yes"}
AUTH_ENABLED = os.getenv("SENTINEXT_AUTH_ENABLED", "false").lower() in {"1", "true", "yes"}
AUTH_JWKS_URL = os.getenv("SENTINEXT_AUTH_JWKS_URL") or os.getenv("SENTINEXT_CLERK_JWKS_URL")
AUTH_ISSUER = os.getenv("SENTINEXT_AUTH_ISSUER", "").strip() or None
AUTH_AUDIENCE = os.getenv("SENTINEXT_AUTH_AUDIENCE", "").strip() or None

def _parse_admin_user_ids() -> set[str]:
    raw = os.getenv("SENTINEXT_ADMIN_USER_IDS", "")
    return {item.strip() for item in raw.split(",") if item.strip()}

ADMIN_USER_IDS = _parse_admin_user_ids()

_JWKS_CLIENT: Optional[PyJWKClient] = None

# In-memory chat status tracking for SSE
# Maps session_id -> list of status messages
_chat_status_store: Dict[str, List[str]] = {}
_chat_status_lock = None  # Will be initialized lazily for async

def _get_chat_status_store() -> Dict[str, List[str]]:
    """Get the chat status store (thread-safe access)."""
    return _chat_status_store

def _emit_chat_status(session_id: str, status: str) -> None:
    """Emit a status update for a chat session."""
    store = _get_chat_status_store()
    if session_id not in store:
        store[session_id] = []
    store[session_id].append(status)
    # Keep only last 20 status messages per session
    if len(store[session_id]) > 20:
        store[session_id] = store[session_id][-20:]

def _get_chat_status(session_id: str) -> List[str]:
    """Get all status messages for a session."""
    return _get_chat_status_store().get(session_id, [])

def _clear_chat_status(session_id: str) -> None:
    """Clear status messages for a session."""
    store = _get_chat_status_store()
    if session_id in store:
        del store[session_id]

storage.init_db()

# Configure structured logging (JSON or text based on SENTINEXT_LOG_FORMAT)
logging_config.configure_logging()

def _log_file_path() -> Path:
    raw = os.getenv("SENTINEXT_LOG_FILE")
    if raw:
        return Path(raw).expanduser()
    # Use platformdirs for cross-platform data directory
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    return data_dir / "logs" / "backend.log"


def _configure_file_logging() -> None:
    """Write backend logs to a rotating file in the local data directory (optional)."""
    # Only add file logging if SENTINEXT_LOG_FILE is set or running locally
    if os.getenv("SENTINEXT_LOG_FORMAT") == "json" and not os.getenv("SENTINEXT_LOG_FILE"):
        # Skip file logging in production JSON mode unless explicitly requested
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
from contextlib import asynccontextmanager

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


app = FastAPI(title="SENTINEXT API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["content-type", "authorization", "x-admin-token"],
    expose_headers=["Content-Disposition"],
)


# ---------------------------------------------------------------------------
# Global exception handler — prevent stack traces from leaking to clients
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
import collections

_rate_limit_buckets: Dict[str, collections.deque] = {}

# Per-path rate limits (max requests per 60-second window)
_RATE_LIMITS: Dict[str, int] = {
    "/analyze": 5,
    "/chat": 20,
    "/chat/simple": 20,
    "/credits/stripe-webhook": 30,
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
    user_payload = getattr(request.state, "user", None)
    if user_payload and isinstance(user_payload, dict):
        uid = user_payload.get("sub") or user_payload.get("user_id")
        if uid:
            return f"user:{uid}"
    # Only trust X-Forwarded-For when the direct client is a known proxy
    client = request.client
    client_ip = client.host if client else None
    if client_ip and client_ip in _TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{client_ip}" if client_ip else "ip:unknown"


def _check_rate_limit_redis(key: str, limit: int) -> bool:
    """Check rate limit via Redis INCR + EXPIRE. Returns True if allowed."""
    try:
        r = redis_client.get_redis()
        redis_key = f"rl:{key}"
        count = r.incr(redis_key)
        if count == 1:
            r.expire(redis_key, _RATE_WINDOW_SECONDS)
        return count <= limit
    except Exception:
        # Redis error — fall through to in-memory
        return _check_rate_limit_memory(key, limit)


def _check_rate_limit_memory(key: str, limit: int) -> bool:
    """Fallback in-memory rate limiter (per-worker, lost on restart)."""
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

    # Find the matching limit
    limit = _DEFAULT_RATE_LIMIT
    for prefix, max_req in _RATE_LIMITS.items():
        if path == prefix or path.startswith(prefix + "/"):
            limit = max_req
            break

    key = f"{_get_rate_key(request)}:{path.split('/')[1] if '/' in path[1:] else path}"

    if redis_client.is_redis_configured():
        allowed = _check_rate_limit_redis(key, limit)
    else:
        allowed = _check_rate_limit_memory(key, limit)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again shortly."},
            headers={"Retry-After": "60"},
        )

    return await call_next(request)

AUTH_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/credits/stripe-webhook"}
SSE_PATHS = {"/progress/{app_id}/stream"}  # SSE endpoints get token from query param


def _get_jwks_client() -> PyJWKClient:
    global _JWKS_CLIENT
    if _JWKS_CLIENT is None:
        if not AUTH_JWKS_URL:
            raise RuntimeError("Auth enabled but SENTINEXT_CLERK_JWKS_URL is not configured.")
        _JWKS_CLIENT = PyJWKClient(AUTH_JWKS_URL)
    return _JWKS_CLIENT


def _decode_auth_token(token: str) -> dict:
    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token).key
    options = {"verify_aud": bool(AUTH_AUDIENCE), "verify_iss": bool(AUTH_ISSUER)}
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=AUTH_AUDIENCE,
        issuer=AUTH_ISSUER,
        options=options,
    )


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not AUTH_ENABLED:
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in AUTH_EXEMPT_PATHS:
        return await call_next(request)

    # SSE endpoints: token validation is optional, endpoint has its own auth
    # Use exact suffix matching to avoid accidentally bypassing auth for paths
    # that happen to contain "/stream" (e.g. a path parameter value).
    is_sse = request.url.path.endswith("/stream")

    auth_header = request.headers.get("authorization", "")
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.query_params.get("token")
    if not token:
        if is_sse:
            # SSE without token: let endpoint handle auth via require_user_id
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Missing bearer token."})
    try:
        payload = _decode_auth_token(token)
    except RuntimeError as exc:
        logger.error("Auth configuration error: %s", exc)
        if is_sse:
            # SSE: set empty user, require_user_id will reject if needed
            request.state.user = {}
            return await call_next(request)
        return JSONResponse(status_code=500, content={"detail": "Auth is misconfigured."})
    except InvalidTokenError as exc:
        logger.warning("Auth token rejected for %s: %s", request.url.path, exc)
        if is_sse:
            # SSE: set empty user, require_user_id will reject if needed
            request.state.user = {}
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token."})
    except Exception as exc:
        logger.error("Auth verification failed for %s: %s", request.url.path, exc)
        if is_sse:
            # SSE: set empty user, require_user_id will reject if needed
            request.state.user = {}
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token."})
    request.state.user = payload
    return await call_next(request)


# ---------------------------------------------------------------------------
# API request logging middleware (placed after auth so request.state.user exists)
# ---------------------------------------------------------------------------

_USAGE_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico"}

# Regex to replace numeric path segments with {id}
_NUMERIC_SEGMENT_RE = re.compile(r"/(\d+)(?=/|$)")

def _normalize_api_path(path: str) -> str:
    """Replace numeric path segments with {id} for meaningful aggregation."""
    return _NUMERIC_SEGMENT_RE.sub("/{id}", path)

_APP_ID_RE = re.compile(
    r"(?:/analysis|/progress|/starred|/steam|/reviews|/export|/chat)"
    r"/(\d+)"
)

def _extract_app_id(path: str) -> Optional[int]:
    """Extract the first app_id-like numeric segment after known prefixes."""
    m = _APP_ID_RE.search(path)
    return int(m.group(1)) if m else None


@app.middleware("http")
async def usage_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)

    if request.url.path in _USAGE_SKIP_PATHS:
        return response

    user_id: Optional[str] = None
    if not AUTH_ENABLED:
        user_id = "local"
    else:
        payload = getattr(request.state, "user", None) or {}
        if payload:
            user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")

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


def _resolve_user_id(request: Request) -> str:
    if not AUTH_ENABLED:
        logger.debug("Auth disabled, using 'local' user_id")
        return "local"
    payload = getattr(request.state, "user", None) or {}
    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        logger.warning("Missing user identity in JWT payload: %s", payload.keys())
        raise HTTPException(status_code=401, detail="Missing user identity.")
    logger.info(f"Resolved user_id: {user_id} from JWT (sub={payload.get('sub')}, user_id={payload.get('user_id')}, id={payload.get('id')})")
    return str(user_id)


def require_user_id(request: Request) -> str:
    return _resolve_user_id(request)


def _optional_user_id(request: Request) -> str:
    """Get user ID or 'anonymous' for SSE endpoints."""
    try:
        return _resolve_user_id(request)
    except HTTPException:
        return "anonymous"


def is_admin_user_id(user_id: str) -> bool:
    return bool(user_id and user_id in ADMIN_USER_IDS)


def _resolve_admin_user_id(request: Request) -> Optional[str]:
    try:
        return _resolve_user_id(request)
    except HTTPException:
        return None


def resolve_scope_user_id(scope: Optional[str], user_id: str) -> Optional[str]:
    if scope and scope.strip().lower() == "all":
        if not is_admin_user_id(user_id):
            raise HTTPException(status_code=403, detail="Admin access required.")
        return None
    return user_id


def _raise_insufficient_credits(user_id: str, exc: credits.InsufficientCreditsError) -> None:
    status = exc.status or credits.get_credit_status(user_id)
    raise HTTPException(
        status_code=402,
        detail={
            "message": str(exc),
            "credits_needed": exc.amount,
            "credits_available": status.get("balance"),
            "tier": status.get("tier"),
        },
    ) from exc


class SearchResult(BaseModel):
    appid: int
    name: str
    price: Optional[str] = None
    url: str
    image_url: Optional[str] = None


class AnalyzeRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    review_count: int = Field(FETCH_LIMIT, ge=0, le=FETCH_LIMIT)
    language: str = Field("all", min_length=2, max_length=32)
    languages: Optional[List[str]] = Field(None, description="List of language codes for multi-language analysis")
    filter: str = Field("recent")
    day_range: Optional[int] = Field(None, ge=1, le=365)
    persist: bool = Field(True)
    refresh: bool = Field(False)
    refresh_days: Optional[int] = Field(None, ge=1, le=365, description="Only fetch reviews from the last N days")


class AnalyzeMetadata(BaseModel):
    app_id: int
    requested: int
    retrieved: int
    language: str
    languages: Optional[List[str]] = None
    fetched_at: str
    header_image: Optional[str] = None
    # Price fields
    price_initial: Optional[float] = None
    price_final: Optional[Union[float, str]] = None  # Can be number or "Free"
    price_initial_formatted: Optional[str] = None
    price_final_formatted: Optional[str] = None
    price_discount: Optional[int] = None
    price_currency: Optional[str] = None
    is_free: Optional[bool] = None


class LabelReuseEstimate(BaseModel):
    total_reviews: int
    cached_reviews: int
    llm_reviews: int
    needs_refresh_reviews: int
    empty_reviews: int
    short_reviews: int
    reasons: Dict[str, int] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    reviews: List[dict]
    label_estimate: Optional[LabelReuseEstimate] = None

class AnalyzeEstimateResponse(BaseModel):
    app_id: int
    will_fetch: bool
    will_persist: bool
    review_count_requested: int
    reviews_considered: int
    cached_labels_total: int
    cached_reviews: int
    needs_refresh_reviews: int
    empty_reviews: int
    short_reviews: int
    llm_reviews: int
    prompt_version: str
    model_id: str
    labeling_strategy: str
    reasons: Dict[str, int] = Field(default_factory=dict)


class StarredGamePayload(BaseModel):
    app_id: int
    name: str
    metadata: AnalyzeMetadata
    insights: Optional[dict] = None
    sample: List[dict] = Field(default_factory=list)


class StarredGameResponse(BaseModel):
    app_id: int
    name: str
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    sample: List[dict]
    updated_at: str
    is_favorite: bool = False


class AnalysisStatusResponse(BaseModel):
    status: str
    metadata: Optional[AnalyzeMetadata] = None
    insights: Optional[dict] = None
    reviews: List[dict] = Field(default_factory=list)
    error: Optional[str] = None
    run_id: Optional[str] = None
    snapshot_hash: Optional[str] = None
    stale: bool = False
    stale_reason: Optional[str] = None


class LicenseStatusResponse(BaseModel):
    valid: bool
    reason: str
    license_id: Optional[str] = None
    issued_to: Optional[str] = None
    expires_at: Optional[str] = None
    features: List[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    question: str = Field(..., min_length=3)
    sentiment: str = Field("all")
    min_helpful: int = Field(0, ge=0)
    max_days: Optional[int] = Field(None, ge=1, le=365)
    playtime_bucket: str = Field("all")
    language: str = Field("all")
    max_reviews: int = Field(500, ge=1, le=5000)
    max_snippets: int = Field(8, ge=1, le=20)


class SimpleChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    # Game context for "Chat with Your Data"
    app_ids: Optional[List[int]] = Field(None, max_length=2, description="App IDs for game context (max 2)")
    date_filter: str = Field("all", description="Date filter: 30d, 90d, 365d, or all")
    max_reviews_per_game: int = Field(50, ge=1, le=50, description="Max reviews per game")
    language: Optional[str] = Field(None, description="Preferred language for responses (e.g., 'en', 'it', 'fr', 'de')")


class ChatCitationItem(BaseModel):
    review_id: str
    app_id: int
    game_name: str
    snippet: str
    votes_up: int
    voted_up: Optional[bool] = None
    playtime_hours: float


class SimpleChatResponse(BaseModel):
    response: str
    session_id: str
    # Game context response fields
    citations: List[ChatCitationItem] = Field(default_factory=list)
    games_used: List[Dict[str, Any]] = Field(default_factory=list)
    reviews_searched: int = 0
    has_game_context: bool = False
    # Agentic chat enhancements
    suggested_questions: List[str] = Field(default_factory=list)
    needs_clarification: bool = False
    clarification_options: List[str] = Field(default_factory=list)
    tool_calls_made: int = 0
    # Suggest searching for a game (shows button to go to home)
    suggest_search_game: bool = False
    search_game_name: str = ""
    # Source reviews used in context
    source_reviews: List[ChatCitationItem] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None
    session_id: Optional[str] = None


class ChatSession(BaseModel):
    session_id: str
    message_count: int
    started_at: Optional[str] = None
    last_message_at: Optional[str] = None
    first_user_message: Optional[str] = None


class AdminChatSession(BaseModel):
    """Chat session info for admin view, includes user_id and feedback stats."""
    session_id: str
    user_id: str
    title: Optional[str] = None
    app_ids: List[int] = []
    first_user_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    message_count: int = 0
    positive_feedback: int = 0
    negative_feedback: int = 0


class SupportMessage(BaseModel):
    id: int
    thread_id: str
    user_id: str
    sender_id: str
    sender_role: str
    message: str
    created_at: Optional[str] = None
    read_by_admin: bool = False
    read_by_user: bool = False


class SupportThreadSummary(BaseModel):
    user_id: str
    last_message_at: Optional[str] = None
    last_message: Optional[str] = None
    last_sender_role: Optional[str] = None
    message_count: int = 0
    unread_count: int = 0


class SupportMessageRequest(BaseModel):
    message: str


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


class TierCount(BaseModel):
    tier: Optional[str] = None
    count: int = 0


class CreditsBreakdownItem(BaseModel):
    operation: Optional[str] = None
    transactions: int = 0
    credits_used: int = 0


class TopUserCredits(BaseModel):
    user_id: str
    credits_used: int = 0


class TopAppCredits(BaseModel):
    app_id: int
    credits_used: int = 0


class UsersSummary(BaseModel):
    total: int = 0
    new: int = 0
    active: int = 0
    paid: int = 0
    mrr_estimate: float = 0.0
    tier_counts: List[TierCount] = Field(default_factory=list)


class CreditsSummary(BaseModel):
    used: int = 0
    by_operation: List[CreditsBreakdownItem] = Field(default_factory=list)
    top_users: List[TopUserCredits] = Field(default_factory=list)
    top_apps: List[TopAppCredits] = Field(default_factory=list)


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


class TierCostEstimate(BaseModel):
    tier: str
    credits: int
    light_usd: float = 0.0
    typical_usd: float = 0.0
    heavy_usd: float = 0.0


class AdminDashboardResponse(BaseModel):
    since: str
    days: int
    users: UsersSummary
    credits: CreditsSummary
    llm: LLMCostSummary
    cost_per_user: List[TierCostEstimate] = Field(default_factory=list)


class ApiEndpointUsage(BaseModel):
    path: str
    count: int = 0
    avg_ms: int = 0


class ApiUserUsage(BaseModel):
    user_id: str
    count: int = 0
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None


class ApiDailyCount(BaseModel):
    date: str
    count: int = 0


class ApiUsageResponse(BaseModel):
    period_days: int
    total_requests: int = 0
    unique_users: int = 0
    by_endpoint: List[ApiEndpointUsage] = Field(default_factory=list)
    by_user: List[ApiUserUsage] = Field(default_factory=list)
    daily: List[ApiDailyCount] = Field(default_factory=list)


class ChatCitation(BaseModel):
    review_id: str
    subcategory: str
    snippet: str
    votes_up: Optional[int] = None
    created_at: Optional[str] = None
    voted_up: Optional[bool] = None
    review_text: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    citations: List[ChatCitation]
    used_subcategories: List[str]
    model: str
    review_count: int
    filtered_review_count: int


class FeedbackItem(BaseModel):
    feedback_id: str
    app_id: int
    source: str
    text: str
    created_at: Optional[str] = None
    author: Optional[str] = None
    language: Optional[str] = None
    engagement: Optional[dict] = None
    url: Optional[str] = None
    context: Optional[dict] = None


class DatabaseReviewItem(BaseModel):
    review_id: str
    app_id: int
    app_name: Optional[str] = None
    review: str
    language: Optional[str] = None
    voted_up: bool
    votes_up: int = 0
    votes_funny: int = 0
    author_num_games_owned: int = 0
    author_num_reviews: int = 0
    author_playtime_forever: int = 0
    author_playtime_last_two_weeks: int = 0
    author_playtime_hours: Optional[float] = None
    author_recent_playtime_hours: Optional[float] = None
    created_at: Optional[str] = None
    llm_main_category: Optional[str] = None
    llm_subcategory: Optional[str] = None
    llm_subcategories: List[str] = Field(default_factory=list)
    llm_issue_subcategories: List[str] = Field(default_factory=list)
    llm_request_subcategories: List[str] = Field(default_factory=list)
    llm_subcategory_evidence: Dict[str, List[str]] = Field(default_factory=dict)
    llm_has_issue: bool = False
    llm_has_request: bool = False


class DatabaseReviewsResponse(BaseModel):
    items: List[DatabaseReviewItem]
    total: int
    offset: int
    limit: int


class DatabaseGameOption(BaseModel):
    app_id: int
    name: Optional[str] = None


class CreditStatusResponse(BaseModel):
    balance: int
    limit: int
    used: int
    tier: str
    period_end: Optional[str] = None
    percent_used: float
    warning: bool
    blocked: bool
    stripe_customer_id: Optional[str] = None
    cancel_at_period_end: bool = False
    payment_failed: bool = False


class CreditEstimateResponse(BaseModel):
    review_count: int
    credits_needed: int
    current_balance: int
    can_afford: bool


class CheckoutSessionRequest(BaseModel):
    tier: str = Field(..., pattern="^(indie|pro)$")
    success_url: str
    cancel_url: str
    billing_period: str = Field(default="monthly", pattern="^(monthly|annual)$")


REVIEW_EXPORT_COLUMNS = [
    "app_id",
    "app_name",
    # Review content
    "review_id",
    "review",
    "language",
    "created_at",
    # Steam sentiment (thumbs up/down)
    "voted_up",
    # Engagement metrics
    "votes_up",
    "votes_funny",
    # Author info
    "author_num_games_owned",
    "author_num_reviews",
    "author_playtime_forever",
    "author_playtime_last_two_weeks",
    "author_playtime_hours",
    "author_recent_playtime_hours",
    # Purchase & platform info
    "steam_purchase",
    "received_for_free",
    "primarily_steam_deck",
    # LLM classification
    "llm_main_category",
    "llm_subcategory",
    "llm_subcategories",
    "llm_issue_subcategories",
    "llm_request_subcategories",
    "llm_subcategory_evidence",
    "llm_has_issue",
    "llm_has_request",
]

EXPORT_MAX_ROWS = max(1, int(os.getenv("SENTINEXT_EXPORT_MAX_ROWS", "50000")))


def _parse_json_payload(value: Any, fallback: dict) -> dict:
    if value is None:
        return fallback
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return fallback


def _database_row_to_item(row: Dict[str, Any], games_map: Dict[int, Optional[str]]) -> "DatabaseReviewItem":
    payload = _parse_json_payload(row.get("data"), {})
    label_payload = _parse_json_payload(row.get("label_payload"), {})
    if label_payload and (
        label_payload.get("subcategories")
        or label_payload.get("main_category")
        or label_payload.get("subcategory")
    ):
        label_payload = llm.normalize_taxonomy_payload(label_payload)

    author = payload.get("author", {}) or {}
    playtime_forever = int(author.get("playtime_forever") or 0)
    playtime_recent = int(author.get("playtime_last_two_weeks") or 0)
    created_ts = payload.get("timestamp_created")
    created_at = (
        datetime.utcfromtimestamp(created_ts).isoformat() + "Z"
        if isinstance(created_ts, (int, float))
        else None
    )

    issue_subcats = label_payload.get("issue_subcategories") or []
    request_subcats = label_payload.get("request_subcategories") or []
    evidence = label_payload.get("evidence")
    if not isinstance(evidence, dict):
        evidence = {}

    app_id_value = int(row.get("app_id") or payload.get("app_id") or 0)

    return DatabaseReviewItem(
        review_id=str(payload.get("recommendationid") or row.get("review_id") or ""),
        app_id=app_id_value,
        app_name=games_map.get(app_id_value),
        review=payload.get("review") or "",
        language=payload.get("language"),
        voted_up=bool(payload.get("voted_up")),
        votes_up=int(payload.get("votes_up") or 0),
        votes_funny=int(payload.get("votes_funny") or 0),
        author_num_games_owned=int(author.get("num_games_owned") or 0),
        author_num_reviews=int(author.get("num_reviews") or 0),
        author_playtime_forever=playtime_forever,
        author_playtime_last_two_weeks=playtime_recent,
        author_playtime_hours=playtime_forever / 60.0 if playtime_forever else 0.0,
        author_recent_playtime_hours=playtime_recent / 60.0 if playtime_recent else 0.0,
        created_at=created_at,
        llm_main_category=label_payload.get("main_category"),
        llm_subcategory=label_payload.get("subcategory"),
        llm_subcategories=list(label_payload.get("subcategories") or []),
        llm_issue_subcategories=list(issue_subcats) if isinstance(issue_subcats, list) else [],
        llm_request_subcategories=list(request_subcats) if isinstance(request_subcats, list) else [],
        llm_subcategory_evidence=evidence,
        llm_has_issue=bool(issue_subcats),
        llm_has_request=bool(request_subcats),
    )


def _serialize_export_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)

def require_admin(request: Request) -> None:
    """Guard destructive endpoints behind an admin token or admin user allowlist."""
    if not DESTRUCTIVE_ENABLED:
        raise HTTPException(status_code=403, detail="Destructive endpoints are disabled. Set SENTINEXT_ENABLE_DESTRUCTIVE=1 to allow.")

    provided = request.headers.get("x-admin-token") or ""
    if provided:
        if not ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Admin token not configured. Set SENTINEXT_ADMIN_TOKEN.")
        if not secrets.compare_digest(provided, ADMIN_TOKEN):
            raise HTTPException(status_code=401, detail="Invalid admin token.")
        return

    user_id = _resolve_admin_user_id(request)
    if user_id and is_admin_user_id(user_id):
        return

    if ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Admin token required.")
    if ADMIN_USER_IDS:
        raise HTTPException(status_code=403, detail="Admin access required.")
    raise HTTPException(status_code=403, detail="Admin access not configured.")


def require_license() -> None:
    try:
        license_guard.require_license()
    except PermissionError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc


@app.get("/health")
def healthcheck(response: Response) -> dict:
    db_ok = db_module.check_db_health()
    if not db_ok:
        response.status_code = 503
        return {"status": "unhealthy", "database": "unreachable", "timestamp": datetime.utcnow().isoformat() + "Z"}
    return {"status": "ok", "database": "connected", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.get("/languages")
def get_available_languages() -> dict:
    """Return the list of available Steam language codes for review fetching."""
    return {
        "languages": list(STEAM_LANGUAGES.keys()),
        "default": "all",
        "popular": ["english", "german", "french", "spanish", "russian", "schinese", "japanese", "portuguese", "brazilian"],
    }


@app.get("/settings/storage", dependencies=[Depends(require_admin)])
def storage_paths() -> dict:
    from platformdirs import user_data_dir
    data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    log_file = _log_file_path()
    return {
        "database": "PostgreSQL (external)",
        "data_dir": str(data_dir),
        "logs_dir": str(log_file.parent),
        "log_file": str(log_file),
    }

@app.get("/settings/llm", dependencies=[Depends(require_admin)])
def llm_settings() -> dict:
    """Return current LLM provider and model configuration."""
    from .senti_next import llm as llm_module

    return {
        "provider": "google",
        "model": llm_module.GEMINI_MODEL,
        "api_key_configured": bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
    }

@app.get("/logs/tail", dependencies=[Depends(require_admin)])
def logs_tail(bytes: int = 20000) -> dict:
    """Return the last N bytes of the backend log file (best-effort)."""
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

@app.get("/license/status", response_model=LicenseStatusResponse)
def license_status() -> LicenseStatusResponse:
    status = license_guard.get_license_status()
    return LicenseStatusResponse(
        valid=status.valid,
        reason=status.reason,
        license_id=status.license_id,
        issued_to=status.issued_to,
        expires_at=status.expires_at,
        features=status.features or [],
    )

@app.get("/admin/status")
def admin_status() -> dict:
    """Expose whether destructive endpoints are available (no secrets)."""
    return {
        "destructive_enabled": DESTRUCTIVE_ENABLED,
        "token_configured": bool(ADMIN_TOKEN),
        "admin_user_ids_configured": bool(ADMIN_USER_IDS),
    }

@app.post("/admin/verify")
def admin_verify(_: None = Depends(require_admin)) -> dict:
    """Non-destructive endpoint to validate admin auth."""
    return {"ok": True}


class AuthStatusResponse(BaseModel):
    user_id: str
    is_admin: bool


@app.get("/auth/status", response_model=AuthStatusResponse)
def auth_status(user_id: str = Depends(require_user_id)) -> AuthStatusResponse:
    return AuthStatusResponse(user_id=user_id, is_admin=is_admin_user_id(user_id))


# ─────────────────────────────────────────────────────────────────────────────
# Credit System Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/credits", response_model=CreditStatusResponse)
def get_credit_status(user_id: str = Depends(require_user_id)) -> CreditStatusResponse:
    """Get current credit status for the authenticated user."""
    status = credits.get_credit_status(user_id)
    return CreditStatusResponse(**status)


@app.get("/credits/estimate", response_model=CreditEstimateResponse)
def get_credit_estimate(
    review_count: int = 0,
    new_reviews: int = 0,
    cached_reviews: int = 0,
    user_id: str = Depends(require_user_id),
) -> CreditEstimateResponse:
    """Estimate credits needed for an analysis operation.

    Args:
        review_count: Total review count (legacy param, used if new_reviews not specified)
        new_reviews: Number of new reviews requiring LLM classification (1 credit each)
        cached_reviews: Number of cached reviews (1 credit each)
    """
    # If new_reviews/cached_reviews provided, use them; otherwise treat all as new
    if new_reviews > 0 or cached_reviews > 0:
        credits_needed = credits.estimate_analysis_cost(new_reviews, cached_reviews)
    else:
        credits_needed = credits.estimate_analysis_cost(review_count)

    subscription = credits.get_user_subscription(user_id)
    balance = subscription["credits_balance"]
    limit = subscription["credits_monthly_limit"]
    used = subscription["credits_used_this_period"]
    hard_limit = credits.calculate_hard_limit(limit, used, balance)

    return CreditEstimateResponse(
        review_count=review_count or (new_reviews + cached_reviews),
        credits_needed=credits_needed,
        current_balance=balance,
        can_afford=used + credits_needed <= hard_limit,
    )


@app.post("/credits/checkout")
def create_checkout(
    request: CheckoutSessionRequest,
    http_request: Request,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Create a Stripe Checkout session for subscription upgrade."""
    if not stripe_billing.is_stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    # Validate redirect URLs to prevent open-redirect attacks
    _validate_redirect_url(request.success_url, "success_url")
    _validate_redirect_url(request.cancel_url, "cancel_url")

    # Get user email from JWT if available
    payload = getattr(http_request.state, "user", None) or {}
    user_email = payload.get("email")

    try:
        checkout_url = stripe_billing.create_checkout_session(
            user_id=user_id,
            tier=request.tier,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            user_email=user_email,
            billing_period=request.billing_period,
        )
        return {"checkout_url": checkout_url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to create checkout session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create checkout session.") from exc


@app.get("/credits/portal")
def get_billing_portal(
    return_url: str,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Get a Stripe Customer Portal URL for subscription management."""
    if not stripe_billing.is_stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    # Validate redirect URL to prevent open-redirect attacks
    _validate_redirect_url(return_url, "return_url")

    try:
        portal_url = stripe_billing.create_customer_portal_session(
            user_id=user_id,
            return_url=return_url,
        )
        return {"portal_url": portal_url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to create portal session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create billing portal session.") from exc


@app.post("/credits/stripe-webhook")
async def stripe_webhook(request: Request) -> dict:
    """Handle incoming Stripe webhook events."""
    if not stripe_billing.is_stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature header.")

    try:
        payload = await request.body()
        result = stripe_billing.handle_webhook_event(payload, signature)
        return result
    except ValueError as exc:
        logger.warning("Stripe webhook validation failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Stripe webhook processing failed: %s", exc)
        raise HTTPException(status_code=500, detail="Webhook processing failed.") from exc


@app.post("/credits/sync")
def sync_credits(user_id: str = Depends(require_user_id)) -> dict:
    """Sync subscription status from Stripe (useful for debugging)."""
    if not stripe_billing.is_stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    result = stripe_billing.sync_subscription_status(user_id)
    if result is None:
        return {"synced": False, "message": "No Stripe customer found"}
    return result


@app.get("/credits/invoices")
def get_invoices(user_id: str = Depends(require_user_id)) -> list:
    """Get billing invoice history from Stripe."""
    if not stripe_billing.is_stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    subscription = credits.get_user_subscription(user_id)
    customer_id = subscription.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=404, detail="No billing account found.")

    return stripe_billing.get_invoices(customer_id)


@app.get("/search", response_model=List[SearchResult])
def search(query: str) -> List[SearchResult]:
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters long.")
    try:
        results = search_applications(query.strip(), limit=5)
    except SteamAPIError as exc:
        logger.error("Steam API error during search: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during search")
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    return [
        SearchResult(appid=item.appid, name=item.name, price=item.price, url=item.url, image_url=item.image_url)
        for item in results
    ]


def _run_analysis_job(
    user_id: str,
    app_id: int,
    all_reviews: List[dict],
    metadata: AnalyzeMetadata,
    game_context: Optional[dict],
) -> None:
    run_id = hashlib.sha256(f"{app_id}-{datetime.utcnow().isoformat()}".encode("utf-8")).hexdigest()[:16]
    snapshot_hash = hashlib.sha256(json.dumps(all_reviews, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    context_hash = hashlib.sha256(json.dumps(game_context or {}, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    total_reviews = len(all_reviews)
    progress_active = total_reviews > 0

    if progress_active:
        # Reset progress to classifying phase (fetch phase is done at this point)
        storage.reset_progress(user_id, app_id, total_reviews, phase="classifying")

        def _progress_callback(processed: int, total: int) -> None:
            # Check for cancellation
            if storage.is_cancelled(user_id, app_id):
                raise InterruptedError("Analysis cancelled by user")
            try:
                storage.update_progress(user_id, app_id, processed, total)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Progress update failed: %s", exc)
    else:
        storage.clear_progress(user_id, app_id)

    credit_tracker = llm.CreditAccumulator()
    analysis_failed = False

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="classify", credit_accumulator=credit_tracker):
            llm_labels = llm.ensure_review_labels(
                app_id,
                all_reviews,
                progress_callback=_progress_callback if progress_active else None,
                game_context=game_context,
            )

        df = build_reviews_dataframe(all_reviews)
        df = llm.apply_review_labels(df, llm_labels)

        if df is None or df.empty:
            storage.save_analysis_result(user_id, app_id, metadata.dict(), None, [], status="completed", run_id=run_id, snapshot_hash=snapshot_hash, context_hash=context_hash)
            return

        # Update phase to building_insights so frontend shows appropriate status
        storage.update_progress_phase(user_id, app_id, "building_insights")

        insights = prepare_insights(df)

        export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
        if export_columns:
            sample_limit = min(SAMPLE_LIMIT, df.shape[0])
            reviews_payload = json.loads(
                df[export_columns]
                .head(sample_limit)
                .to_json(orient="records", date_format="iso", date_unit="s")
            )
        else:
            reviews_payload = []

        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=insights,
            reviews=reviews_payload,
            status="completed",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except credits.InsufficientCreditsError as exc:
        analysis_failed = True
        logger.info(f"Analysis failed due to insufficient credits for app {app_id}: {exc}")
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=None,
            reviews=[],
            status="failed",
            error=str(exc),
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except InterruptedError as exc:
        analysis_failed = True
        # User cancelled the analysis
        logger.info(f"Analysis cancelled for app {app_id}: {exc}")
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=None,
            reviews=[],
            status="cancelled",
            error="Analysis cancelled by user",
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    except Exception as exc:  # pragma: no cover - defensive
        analysis_failed = True
        logger.exception("Analysis job failed: %s", exc)
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata=metadata.dict(),
            insights=None,
            reviews=[],
            status="failed",
            error=str(exc),
            run_id=run_id,
            snapshot_hash=snapshot_hash,
            context_hash=context_hash,
        )
    finally:
        if progress_active:
            # Mark progress as fully complete; do NOT clear_progress() here
            # because the SSE stream / polling endpoint may still need to see
            # the final state.  The progress row is overwritten on the next
            # analysis via reset_progress().
            storage.update_progress(user_id, app_id, total_reviews, total_reviews)

        # Refund credits if analysis failed and produced no usable result
        if analysis_failed and credit_tracker.total > 0:
            try:
                credits.refund_credits(
                    user_id=user_id,
                    amount=credit_tracker.total,
                    operation="classify_refund",
                    description=f"Refund for failed analysis of app {app_id} ({credit_tracker.total} credits)",
                    app_id=app_id,
                )
                logger.info(f"Refunded {credit_tracker.total} credits to user {user_id} for failed analysis of app {app_id}")
            except Exception as refund_exc:
                logger.error(f"Failed to refund {credit_tracker.total} credits for user {user_id}: {refund_exc}")


@app.post("/analyze", response_model=AnalyzeResponse, status_code=202, dependencies=[Depends(require_license)])
def analyze(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_user_id),
) -> AnalyzeResponse:
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    # Determine which languages to fetch
    languages_to_fetch = request.languages or ([request.language] if request.language and request.language != "all" else None)

    # Filter cached reviews by requested language(s) to check if we have enough in the right language
    language_filtered_reviews = stored_reviews
    if languages_to_fetch:
        # Specific language(s) requested - filter cached reviews
        language_filtered_reviews = [
            r for r in stored_reviews
            if r.get("language") in languages_to_fetch
        ]
    # If language="all" or not specified, use all cached reviews

    # Treat review_count=0 as "all available reviews" (unlimited), always fetch in that case
    has_enough_cached = request.review_count > 0 and len(language_filtered_reviews) >= request.review_count
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached

    # --- Early credit pre-check before expensive fetching ---
    # Use review_count as a rough upper bound (worst case: all reviews need labeling).
    # The precise check happens later after we know cached vs new, but this catches
    # obvious cases (e.g. 0 credits) before wasting time fetching from Steam.
    if request.review_count and request.review_count > 0:
        can_preflight, preflight_msg, preflight_status = credits.check_credits_available(user_id, request.review_count)
        if not can_preflight:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": preflight_msg,
                    "credits_needed": request.review_count,
                    "credits_available": preflight_status.get("balance"),
                    "tier": preflight_status.get("tier"),
                },
            )

    fetched_reviews: List[dict] = []
    if should_fetch:
        # Set up fetch progress tracking
        def _fetch_progress_callback(fetched_count: int) -> None:
            try:
                storage.update_fetch_progress(user_id, request.app_id, fetched_count)
            except Exception as exc:
                logger.warning("Fetch progress update failed: %s", exc)

        # Initialize progress with fetching phase
        storage.reset_progress(user_id, request.app_id, total=0, phase="fetching")

        try:
            if languages_to_fetch and len(languages_to_fetch) > 1:
                # Multi-language fetch
                fetched_reviews = fetch_reviews_multi_language(
                    request.app_id,
                    count=request.review_count,
                    languages=languages_to_fetch,
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                    progress_callback=_fetch_progress_callback,
                )
            else:
                # Single language fetch (or "all")
                fetched_reviews = fetch_reviews(
                    request.app_id,
                    count=request.review_count,
                    language=languages_to_fetch[0] if languages_to_fetch else "all",
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                    progress_callback=_fetch_progress_callback,
                )
        except SteamAPIError as exc:
            storage.clear_progress(user_id, request.app_id)
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if request.persist:
            storage.upsert_reviews(request.app_id, fetched_reviews)
            # Enforce review limit - keep only most recent reviews, delete old ones
            storage.enforce_review_limit(request.app_id)
            stored_reviews = storage.load_reviews(request.app_id)
        else:
            stored_reviews = fetched_reviews

    if stored_reviews:
        all_reviews = stored_reviews
    else:
        all_reviews = fetched_reviews

    # Always apply review_count limit if specified
    if request.review_count and len(all_reviews) > request.review_count:
        all_reviews = all_reviews[: request.review_count]

    # Sort reviews by language to maximize LLM batch efficiency
    # (groups same-language reviews together for batching, newest first within each language)
    all_reviews.sort(key=lambda r: (r.get("language", "english"), -(r.get("timestamp_created") or 0)))

    label_estimate = None
    try:
        estimate = llm.estimate_review_labeling(request.app_id, all_reviews)
        label_estimate = LabelReuseEstimate(
            total_reviews=int(estimate.get("total_reviews", len(all_reviews)) or 0),
            cached_reviews=int(estimate.get("cached_reviews", 0) or 0),
            llm_reviews=int(estimate.get("llm_reviews", 0) or 0),
            needs_refresh_reviews=int(estimate.get("needs_refresh_reviews", 0) or 0),
            empty_reviews=int(estimate.get("empty_reviews", 0) or 0),
            short_reviews=int(estimate.get("short_reviews", 0) or 0),
            reasons={str(key): int(value) for key, value in (estimate.get("reasons") or {}).items() if key},
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to estimate cached labels for app %s: %s", request.app_id, exc)

    # Credit preflight for review labeling (cached + LLM labels)
    credits_needed = None
    if label_estimate is not None:
        credits_needed = int(label_estimate.cached_reviews + label_estimate.llm_reviews)
    else:
        credits_needed = len(all_reviews)
    if credits_needed and credits_needed > 0:
        can_proceed, credit_message, credit_status = credits.check_credits_available(user_id, credits_needed)
        if not can_proceed:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": credit_message,
                    "credits_needed": credits_needed,
                    "credits_available": credit_status.get("balance"),
                    "tier": credit_status.get("tier"),
                },
            )

    # Check if there's already a running analysis for this game
    existing_result = storage.load_analysis_result(user_id, request.app_id)
    if existing_result and existing_result.get("status") == "running":
        # The analysis result is marked as running - check if the job is still active.
        # A progress row existing (even with total=0 in early "fetching" phase) means
        # the job was initialized and hasn't completed yet.
        progress = storage.load_progress(user_id, request.app_id)
        if progress is not None:
            processed = progress.get("processed", 0)
            total = progress.get("total", 0)
            # Job is actively running - don't start another
            logger.info(f"Analysis already running for app {request.app_id} ({processed}/{total})")
            return AnalyzeResponse(
                metadata=AnalyzeMetadata(**existing_result.get("metadata", {})),
                insights=None,
                reviews=[],
            )

    game_context = fetch_app_details(request.app_id)
    header_image = None
    if game_context:
        header_image = game_context.get("header_image")

    metadata = AnalyzeMetadata(
        app_id=request.app_id,
        requested=request.review_count,
        retrieved=len(all_reviews),
        language=request.language,
        languages=languages_to_fetch,
        fetched_at=datetime.utcnow().isoformat() + "Z",
        header_image=header_image,
    )

    # Persist placeholder result and kick off background job
    storage.save_analysis_result(
        user_id=user_id,
        app_id=request.app_id,
        metadata=metadata.dict(),
        insights=None,
        reviews=[],
        status="running",
        run_id=None,
        snapshot_hash=None,
        stale=False,
    )
    # Initialize progress in "fetching" phase immediately so the frontend
    # never sees an empty progress row between the /analyze response and
    # the background job starting (fixes progress bar flicker bug).
    storage.reset_progress(user_id, request.app_id, total=0, phase="fetching")

    if game_context:
        logger.info(f"Fetched game context for {game_context.get('name', request.app_id)}")

    # Try to enqueue with Redis/RQ, fall back to BackgroundTasks if not configured
    if redis_client.is_redis_configured():
        import uuid
        job_id = str(uuid.uuid4())
        storage.create_job_registry(job_id, user_id, request.app_id, job_type="analysis")
        redis_client.enqueue_job(
            job_runner.run_analysis_job,
            user_id,
            request.app_id,
            all_reviews,
            metadata.dict(),
            game_context,
            job_id,
            job_timeout=3600,  # 1 hour timeout
        )
        logger.info(f"Enqueued analysis job {job_id} for app {request.app_id}")
    else:
        # Fallback to in-process background task
        background_tasks.add_task(
            _run_analysis_job,
            user_id,
            request.app_id,
            all_reviews,
            metadata,
            game_context,
        )

    return AnalyzeResponse(metadata=metadata, insights=None, reviews=[], label_estimate=label_estimate)

@app.post("/analyze/estimate", response_model=AnalyzeEstimateResponse, dependencies=[Depends(require_license)])
def analyze_estimate(request: AnalyzeRequest, user_id: str = Depends(require_user_id)) -> AnalyzeEstimateResponse:
    """Estimate how many labels will be reused vs require new work (no LLM calls)."""
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    # Determine which languages to fetch
    languages_to_fetch = request.languages or ([request.language] if request.language and request.language != "all" else None)

    # Filter cached reviews by requested language(s) to check if we have enough in the right language
    language_filtered_reviews = stored_reviews
    if languages_to_fetch:
        # Specific language(s) requested - filter cached reviews
        language_filtered_reviews = [
            r for r in stored_reviews
            if r.get("language") in languages_to_fetch
        ]
    # If language="all" or not specified, use all cached reviews

    # Treat review_count=0 as "all available reviews" (unlimited), always fetch in that case
    has_enough_cached = request.review_count > 0 and len(language_filtered_reviews) >= request.review_count
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached

    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            if languages_to_fetch and len(languages_to_fetch) > 1:
                fetched_reviews = fetch_reviews_multi_language(
                    request.app_id,
                    count=request.review_count,
                    languages=languages_to_fetch,
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                )
            else:
                fetched_reviews = fetch_reviews(
                    request.app_id,
                    count=request.review_count,
                    language=languages_to_fetch[0] if languages_to_fetch else "all",
                    filter_type=filter_type,
                    day_range=request.refresh_days or request.day_range,
                )
        except SteamAPIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    all_reviews = stored_reviews if stored_reviews else fetched_reviews
    if request.review_count and len(all_reviews) > request.review_count:
        all_reviews = all_reviews[: request.review_count]

    cached_labels = storage.load_review_labels(request.app_id)
    estimate = llm.estimate_review_labeling(
        request.app_id,
        all_reviews,
    )

    return AnalyzeEstimateResponse(
        app_id=request.app_id,
        will_fetch=bool(should_fetch),
        will_persist=bool(request.persist),
        review_count_requested=int(request.review_count or 0),
        reviews_considered=len(all_reviews),
        cached_labels_total=len(cached_labels),
        cached_reviews=int(estimate.get("cached_reviews", 0) or 0),
        needs_refresh_reviews=int(estimate.get("needs_refresh_reviews", 0) or 0),
        empty_reviews=int(estimate.get("empty_reviews", 0) or 0),
        short_reviews=int(estimate.get("short_reviews", 0) or 0),
        llm_reviews=int(estimate.get("llm_reviews", 0) or 0),
        prompt_version=str(estimate.get("prompt_version") or ""),
        model_id=str(estimate.get("model_id") or ""),
        labeling_strategy=str(estimate.get("labeling_strategy") or ""),
        reasons={str(key): int(value) for key, value in (estimate.get("reasons") or {}).items() if key},
    )


@app.get("/analysis/{app_id}", response_model=AnalysisStatusResponse, dependencies=[Depends(require_license)])
def get_analysis_result(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> AnalysisStatusResponse:
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result available for this app.")

    metadata_payload = result.get("metadata")
    if metadata_payload and not metadata_payload.get("header_image"):
        details = fetch_app_details(app_id)
        if details and details.get("header_image"):
            metadata_payload["header_image"] = details["header_image"]
    metadata = AnalyzeMetadata(**metadata_payload) if metadata_payload else None
    stale_reason = None
    if metadata and metadata.fetched_at:
        try:
            fetched_dt = datetime.fromisoformat(metadata.fetched_at.replace("Z", "+00:00"))
            max_age_days = int(os.getenv("SENTINEXT_STALE_DAYS", "30"))
            age_days = (datetime.utcnow() - fetched_dt.replace(tzinfo=None)).days
            if age_days > max_age_days:
                result["stale"] = True
                stale_reason = f"Analysis older than {max_age_days} days"
        except Exception:
            pass
    # Compare app context hash to detect build/content changes
    try:
        app_details = fetch_app_details(app_id) or {}
        current_ctx_hash = hashlib.sha256(json.dumps(app_details, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
        stored_hash = result.get("context_hash")
        if stored_hash and current_ctx_hash != stored_hash:
            result["stale"] = True
            stale_reason = stale_reason or "App details changed since last run"
    except Exception:
        logger.warning("Failed to compare app context hash for %s", app_id)

    return AnalysisStatusResponse(
        status=result.get("status", "unknown"),
        metadata=metadata,
        insights=result.get("insights"),
        reviews=result.get("reviews") or [],
        error=result.get("error"),
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        stale=bool(result.get("stale")),
        stale_reason=stale_reason,
    )


@app.post("/analysis/{app_id}/rebuild-insights", dependencies=[Depends(require_license)])
def rebuild_insights(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Rebuild insights from existing reviews and labels without re-fetching or re-classifying.

    This is useful when the insights computation logic has been updated and you want
    to regenerate insights without incurring LLM costs.
    """
    # Load existing analysis result
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result found for this app.")

    # Load stored reviews
    stored_reviews = storage.load_reviews(app_id)
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    # Build DataFrame from reviews
    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Could not build DataFrame from stored reviews.")

    # Load and apply existing labels
    llm_labels = storage.load_review_labels(app_id)
    df = llm.apply_review_labels(df, llm_labels)

    # Rebuild insights with current logic
    insights = prepare_insights(df)

    # Get existing metadata
    metadata = result.get("metadata", {})

    # Export reviews sample
    export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
    if export_columns:
        sample_limit = min(SAMPLE_LIMIT, df.shape[0])
        reviews_payload = json.loads(
            df[export_columns]
            .head(sample_limit)
            .to_json(orient="records", date_format="iso", date_unit="s")
        )
    else:
        reviews_payload = []

    # Save updated result
    storage.save_analysis_result(
        user_id=user_id,
        app_id=app_id,
        metadata=metadata,
        insights=insights,
        reviews=reviews_payload,
        status="completed",
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        context_hash=result.get("context_hash"),
    )

    # Keep starred cache in sync for the dashboard list
    starred_games = storage.load_starred_games(user_id)
    starred = next((entry for entry in starred_games if entry.get("app_id") == app_id), None)
    if starred:
        storage.save_starred_game(
            user_id=user_id,
            app_id=app_id,
            name=starred.get("name") or str(app_id),
            metadata=starred.get("metadata") or {},
            insights=insights,
            sample=starred.get("sample") or [],
            genres=starred.get("genres") or [],
            categories=starred.get("categories") or [],
        )

    return {"status": "ok", "message": "Insights rebuilt successfully", "app_id": app_id}


@app.post("/analysis/{app_id}/rebuild-trends", dependencies=[Depends(require_license)])
def rebuild_trends(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Rebuild only trend data from existing reviews without re-fetching or re-classifying."""
    result = storage.load_analysis_result(user_id, app_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis result found for this app.")

    stored_reviews = storage.load_reviews(app_id)
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Could not build DataFrame from stored reviews.")

    trend_df = recommended_share_over_time(df, freq="W-SUN", fill_missing=True)
    trend_payload = (
        json.loads(trend_df.to_json(orient="records", date_format="iso", date_unit="s"))
        if trend_df is not None and not trend_df.empty
        else []
    )

    insights = result.get("insights") or {}
    insights["trend"] = trend_payload

    storage.save_analysis_result(
        user_id=user_id,
        app_id=app_id,
        metadata=result.get("metadata", {}),
        insights=insights,
        reviews=result.get("reviews") or [],
        status="completed",
        run_id=result.get("run_id"),
        snapshot_hash=result.get("snapshot_hash"),
        context_hash=result.get("context_hash"),
        stale=result.get("stale", False),
        stale_reason=result.get("stale_reason"),
    )

    # Keep starred cache in sync for the dashboard list
    starred_games = storage.load_starred_games(user_id)
    starred = next((entry for entry in starred_games if entry.get("app_id") == app_id), None)
    if starred:
        storage.save_starred_game(
            user_id=user_id,
            app_id=app_id,
            name=starred.get("name") or str(app_id),
            metadata=starred.get("metadata") or {},
            insights=insights,
            sample=starred.get("sample") or [],
            genres=starred.get("genres") or [],
            categories=starred.get("categories") or [],
        )

    return {"status": "ok", "message": "Trends rebuilt successfully", "app_id": app_id}


class SummarizeSubcategoryRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    subcategory: str = Field(..., min_length=3)
    reviews: List[dict] = Field(..., min_length=1, max_length=100)
    summary_type: str = Field(default="general", pattern="^(issue|request|general)$")
    summary_context: Optional[str] = Field(
        default=None,
        description="Optional scope/filter context shown in the UI (e.g., language, date range, segment).",
        max_length=1200,
    )


class SummarizeSubcategoryResponse(BaseModel):
    summary: str
    pros: List[str]
    cons: List[str]


@app.post("/summarize/subcategory", response_model=SummarizeSubcategoryResponse, dependencies=[Depends(require_license)])
def summarize_subcategory(
    request: SummarizeSubcategoryRequest,
    user_id: str = Depends(require_user_id),
) -> SummarizeSubcategoryResponse:
    """Generate a summary with pros/cons for reviews in a specific subcategory."""
    # Get game context
    game_context = fetch_app_details(request.app_id)

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize"):
            result = llm.summarize_subcategory_reviews(
                reviews=request.reviews,
                subcategory=request.subcategory,
                game_context=game_context,
                summary_type=request.summary_type,
                summary_context=request.summary_context,
            )
        return SummarizeSubcategoryResponse(**result)
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)
    except Exception as exc:
        logger.exception("Summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate summary.") from exc


class SummarizeWidgetRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    widget_kind: str = Field(..., pattern="^(trend_week|segment|top_issues|top_requests)$")
    widget_label: str = Field(..., min_length=1, max_length=160)
    context: Dict[str, Any] = Field(default_factory=dict)
    reviews: List[dict] = Field(..., min_length=1, max_length=100)


class SummarizeWidgetResponse(BaseModel):
    summary: str
    key_points: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)


@app.post("/summarize/widget", response_model=SummarizeWidgetResponse, dependencies=[Depends(require_license)])
def summarize_widget(
    request: SummarizeWidgetRequest,
    user_id: str = Depends(require_user_id),
) -> SummarizeWidgetResponse:
    """Generate a widget-specific summary for a set of reviews shown in the UI."""
    game_context = fetch_app_details(request.app_id)

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize"):
            result = llm.summarize_widget_reviews(
                reviews=request.reviews,
                widget_kind=request.widget_kind,
                widget_label=request.widget_label,
                widget_context=request.context,
                game_context=game_context,
            )
        return SummarizeWidgetResponse(**result)
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)
    except Exception as exc:
        logger.exception("Widget summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate widget summary.") from exc


class SummarizeRecentReviewsRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    count: int = Field(default=100, ge=10, le=200)
    filter_context: Optional[str] = Field(default=None, description="Description of active filters for context")


class SummarizeRecentReviewsResponse(BaseModel):
    summary: str
    key_points: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)
    review_count: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@app.post("/summarize/recent-reviews", response_model=SummarizeRecentReviewsResponse, dependencies=[Depends(require_license)])
def summarize_recent_reviews(
    request: SummarizeRecentReviewsRequest,
    user_id: str = Depends(require_user_id),
) -> SummarizeRecentReviewsResponse:
    """Generate a summary for the most recent N stored reviews (no re-analysis)."""
    stored_reviews = storage.load_reviews(request.app_id, limit=int(request.count or 100))
    if not stored_reviews:
        raise HTTPException(status_code=404, detail="No stored reviews found for this app.")

    game_context = fetch_app_details(request.app_id)

    df = build_reviews_dataframe(stored_reviews)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No review data available for this app.")

    # Apply cached labels when available (no new LLM labeling here).
    try:
        llm_labels = storage.load_review_labels(request.app_id)
        df = llm.apply_review_labels(df, llm_labels)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to apply cached labels for app %s: %s", request.app_id, exc)

    if "created_at" in df.columns:
        try:
            df = df.sort_values(by="created_at", ascending=False)
        except Exception:
            pass
    df = df.head(int(request.count or 100))

    start_date = None
    end_date = None
    try:
        if "created_at" in df.columns and not df["created_at"].dropna().empty:
            start_dt = df["created_at"].min()
            end_dt = df["created_at"].max()
            if start_dt is not None and hasattr(start_dt, "date"):
                start_date = start_dt.date().isoformat()
            if end_dt is not None and hasattr(end_dt, "date"):
                end_date = end_dt.date().isoformat()
    except Exception:
        pass

    baseline = None
    try:
        result = storage.load_analysis_result(user_id, request.app_id) or {}
        insights = result.get("insights") or {}
        if insights:
            baseline = {
                "recommendation_rate": insights.get("recommendation"),
                "issue_rate": (insights.get("llm") or {}).get("issue_rate"),
                "request_rate": (insights.get("llm") or {}).get("feature_request_rate"),
            }
    except Exception:
        baseline = None

    export_columns = [
        "review_id",
        "review",
        "language",
        "created_at",
        "voted_up",
        "votes_up",
        "votes_funny",
        "comment_count",
        "llm_subcategories",
        "llm_issue_subcategories",
        "llm_request_subcategories",
        "llm_subcategory_evidence",
    ]
    export_columns = [col for col in export_columns if col in df.columns]
    reviews_payload = (
        json.loads(
            df[export_columns].to_json(orient="records", date_format="iso", date_unit="s")
        )
        if export_columns
        else []
    )

    widget_context: Dict[str, Any] = {
        "date_range": f"{start_date} → {end_date}" if start_date and end_date else None,
        "baseline": baseline,
        "filters": request.filter_context if request.filter_context else None,
    }

    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize"):
            result = llm.summarize_widget_reviews(
                reviews=reviews_payload,
                widget_kind="recent_reviews",
                widget_label=f"Most recent {len(reviews_payload)} reviews",
                widget_context=widget_context,
                game_context=game_context,
            )
        return SummarizeRecentReviewsResponse(
            **result,
            review_count=len(reviews_payload),
            start_date=start_date,
            end_date=end_date,
        )
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)
    except Exception as exc:
        logger.exception("Recent reviews summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate recent reviews summary.") from exc


class SummarizeNewsRequest(BaseModel):
    app_id: int
    news_count: int = Field(default=10, ge=1, le=30)
    include_sentiment: bool = Field(default=True)


class SummarizeNewsResponse(BaseModel):
    summary: str
    key_updates: List[str] = Field(default_factory=list)
    potential_impacts: List[str] = Field(default_factory=list)
    correlation_insights: Optional[str] = None
    news_count: int
    credits_charged: int


@app.post("/summarize/news", response_model=SummarizeNewsResponse, dependencies=[Depends(require_license)])
def summarize_news(
    request: SummarizeNewsRequest,
    user_id: str = Depends(require_user_id),
) -> SummarizeNewsResponse:
    """Generate AI summary of recent game news/patches and correlate with sentiment."""
    # Fetch news from Steam API
    try:
        news_items = fetch_news_for_app(request.app_id, count=request.news_count, max_length=500)
    except SteamAPIError as exc:
        logger.error("Failed to fetch news for app %s: %s", request.app_id, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch news: {str(exc)}") from exc

    if not news_items:
        return SummarizeNewsResponse(
            summary="No recent news or updates available for this game.",
            key_updates=[],
            potential_impacts=[],
            correlation_insights=None,
            news_count=0,
            credits_charged=0,
        )

    # Get game context
    game_context = fetch_app_details(request.app_id)

    # Get recent sentiment data if requested
    recent_sentiment = None
    if request.include_sentiment:
        try:
            result = storage.load_analysis_result(user_id, request.app_id)
            if result:
                insights = result.get("insights") or {}
                llm_insights = insights.get("llm") or {}
                recent_sentiment = {
                    "recommendation_rate": insights.get("recommendation"),
                    "trend": insights.get("trend_direction"),
                    "top_issues": [
                        item.get("subcategory")
                        for item in (llm_insights.get("top_issue_subcategories") or [])[:3]
                    ],
                    "top_requests": [
                        item.get("subcategory")
                        for item in (llm_insights.get("top_request_subcategories") or [])[:3]
                    ],
                }
        except Exception as exc:
            logger.warning("Failed to load sentiment data for news summary: %s", exc)

    # Reserve credits
    credit_cost = credits.CREDIT_COSTS.get("summarize", 2)
    try:
        credits.reserve_credits_or_raise(
            user_id=user_id,
            amount=credit_cost,
            operation="summarize_news",
            description="Summarize game news/updates",
        )
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)

    # Convert news items to dicts for the LLM function
    news_dicts = [
        {
            "title": item.title,
            "contents": item.contents,
            "date": item.date,
            "feed_label": item.feed_label,
        }
        for item in news_items
    ]

    # Generate summary
    try:
        with llm.llm_usage_context(user_id=user_id, app_id=request.app_id, operation="summarize_news"):
            result = llm.summarize_news_updates(
                news_items=news_dicts,
                game_name=game_context.get("name") if game_context else None,
                game_context=game_context,
                recent_sentiment=recent_sentiment,
            )
        return SummarizeNewsResponse(
            **result,
            news_count=len(news_items),
            credits_charged=credit_cost,
        )
    except Exception as exc:
        logger.exception("News summarize failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate news summary.") from exc


class GameComparisonData(BaseModel):
    app_id: int
    name: str
    reviews: List[dict] = Field(..., max_length=50)
    metrics: dict


class ComparisonSummarizeRequest(BaseModel):
    games: List[GameComparisonData] = Field(..., min_length=2, max_length=2)
    comparison_type: str = Field(..., pattern="^(overview|category|subcategory)$")
    category: Optional[str] = None
    subcategory: Optional[str] = None


class ComparisonSummaryResponse(BaseModel):
    summary: str
    winners: Dict[str, List[int]]
    key_differences: List[str]
    strengths_per_game: Dict[int, List[str]]
    weaknesses_per_game: Dict[int, List[str]]
    recommendations: Dict[int, str]
    cached: bool
    credits_charged: int


@app.post("/compare/summarize", response_model=ComparisonSummaryResponse, dependencies=[Depends(require_license)])
def compare_games_summarize(
    request: ComparisonSummarizeRequest,
    user_id: str = Depends(require_user_id),
) -> ComparisonSummaryResponse:
    """Generate AI comparison summary for 2-4 games."""
    # 1. Generate cache key
    app_ids = [g.app_id for g in request.games]
    cache_key = storage.generate_comparison_cache_key(
        app_ids, request.comparison_type, request.category, request.subcategory
    )

    # 2. Determine credit cost and reserve upfront (cached + uncached)
    credit_operation = {
        "overview": "compare_overview",
        "category": "compare_category",
        "subcategory": "compare_subcategory",
    }[request.comparison_type]
    credit_cost = credits.CREDIT_COSTS[credit_operation]

    try:
        credits.reserve_credits_or_raise(
            user_id=user_id,
            amount=credit_cost,
            operation=credit_operation,
            description=f"Compare {request.comparison_type}",
        )
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)

    # 3. Check cache
    cached = storage.load_comparison_summary(cache_key)
    if cached:
        return ComparisonSummaryResponse(**cached, cached=True, credits_charged=credit_cost)

    # 4. Call LLM
    try:
        logger.info(f"Generating comparison for {len(app_ids)} games (type: {request.comparison_type})")
        with llm.llm_usage_context(user_id=user_id, operation="compare"):
            result = llm.compare_games(
                games_data=[g.dict() for g in request.games],
                comparison_type=request.comparison_type,
                category=request.category,
                subcategory=request.subcategory,
            )

        # 6. Save to cache
        storage.save_comparison_summary(
            user_id=user_id,
            app_ids=app_ids,
            comparison_type=request.comparison_type,
            category=request.category,
            subcategory=request.subcategory,
            summary_data=result,
        )

        logger.info(f"Successfully generated comparison for {len(app_ids)} games")
        return ComparisonSummaryResponse(**result, cached=False, credits_charged=credit_cost)

    except llm.LLMError as exc:
        credits.refund_credits(
            user_id=user_id,
            amount=credit_cost,
            operation=credit_operation,
            description="Refund: comparison LLM failed",
        )
        logger.exception("LLM comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI comparison failed: {str(exc)}") from exc
    except Exception as exc:
        credits.refund_credits(
            user_id=user_id,
            amount=credit_cost,
            operation=credit_operation,
            description="Refund: comparison failed",
        )
        logger.exception("Comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate comparison: {str(exc)}") from exc


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_license)])
def chat_insights(request: ChatRequest, user_id: str = Depends(require_user_id)) -> ChatResponse:
    question = (request.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    sentiment = (request.sentiment or "all").strip().lower()
    if sentiment not in {"all", "positive", "negative"}:
        sentiment = "all"

    try:
        payload = chat.answer_chat(
            user_id=user_id,
            app_id=request.app_id,
            question=question,
            sentiment=sentiment,
            min_helpful=request.min_helpful,
            max_days=request.max_days,
            playtime_bucket=request.playtime_bucket,
            language=request.language,
            max_reviews=request.max_reviews,
            max_snippets=request.max_snippets,
        )
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Chat failed: %s", exc)
        raise HTTPException(status_code=500, detail="Chat request failed.") from exc

    return ChatResponse(**payload)


class TranslateRequest(BaseModel):
    text: str
    target_language: str  # e.g., 'en', 'it', 'fr', 'de'


class TranslateResponse(BaseModel):
    translated_text: str
    model_id: str


@app.post("/translate", response_model=TranslateResponse, dependencies=[Depends(require_license)])
def translate_text_endpoint(
    request: TranslateRequest,
    user_id: str = Depends(require_user_id),
) -> TranslateResponse:
    """Translate text to the target language using the LLM."""
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    target_language = (request.target_language or "").strip().lower()
    if not target_language:
        raise HTTPException(status_code=400, detail="Target language is required.")

    try:
        with llm.llm_usage_context(user_id=user_id, operation="translate"):
            translated, model_id = llm.translate_text(text, target_language)
        return TranslateResponse(translated_text=translated, model_id=model_id)
    except credits.InsufficientCreditsError as exc:
        _raise_insufficient_credits(user_id, exc)
    except Exception as exc:
        logger.exception("Translation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Translation failed.") from exc


@app.post("/chat/simple", response_model=SimpleChatResponse)
async def simple_chat(request: SimpleChatRequest, user_id: str = Depends(require_user_id)) -> SimpleChatResponse:
    """Simple chatbot endpoint that uses Gemini for general conversation with memory.

    If app_ids are provided, enables "Chat with Your Data" mode which searches
    through game reviews to answer questions with citations.
    """
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    session_id: Optional[str] = None
    try:
        import uuid

        # Generate session_id if not provided
        session_id = request.session_id
        if not session_id:
            session_id = str(uuid.uuid4())

        # Load recent conversation history for this session (last 20 messages for context)
        history = storage.load_chat_history(user_id, limit=20, session_id=session_id)

        # Check if we have game context (Chat with Your Data mode)
        app_ids = request.app_ids or []
        has_game_context = bool(app_ids)

        if has_game_context:
            # Game-aware chat: use agentic chat with tool calling
            logger.info(f"Chat with game context: app_ids={app_ids}, date_filter={request.date_filter}")

            # Create status callback that emits to SSE store
            def status_callback(status: str) -> None:
                _emit_chat_status(session_id, status)

            # Load game metadata for context
            game_metadata = storage.load_game_metadata_for_chat(user_id, app_ids)
            game_names = {g["app_id"]: g["name"] for g in game_metadata}

            # Build agent context
            agent_context = chat_agent.AgentContext(
                user_id=user_id,
                session_id=session_id,
                app_ids=app_ids,
                date_filter=request.date_filter,
                max_reviews_per_game=request.max_reviews_per_game,
                language=request.language,
                conversation_history=[
                    {"role": msg["role"], "content": msg["content"]}
                    for msg in history
                ],
                game_names=game_names,
            )

            # Run the agentic chat
            with llm.llm_usage_context(
                user_id=user_id,
                session_id=session_id,
                app_id=app_ids[0] if len(app_ids) == 1 else None,
                operation="chat_agent",
            ):
                agent_result = await chat_agent.run_agent(
                    message=message,
                    context=agent_context,
                    status_callback=status_callback,
                )

            # Clear status after completion
            _clear_chat_status(session_id)

            # Handle clarification response
            if agent_result.needs_clarification:
                clarification_text = chat_agent.build_clarification_response(
                    agent_result.clarification_options,
                    agent_result.clarification_context,
                )
                return SimpleChatResponse(
                    response=clarification_text,
                    session_id=session_id,
                    citations=[],
                    source_reviews=[],
                    games_used=game_metadata,
                    reviews_searched=0,
                    has_game_context=True,
                    suggested_questions=[],
                    needs_clarification=True,
                    clarification_options=agent_result.clarification_options,
                    tool_calls_made=len(agent_result.tool_calls_made),
                )

            # Handle suggest searching for a game
            if agent_result.suggest_search_game:
                return SimpleChatResponse(
                    response=agent_result.response,
                    session_id=session_id,
                    citations=[],
                    source_reviews=[],
                    games_used=game_metadata,
                    reviews_searched=0,
                    has_game_context=True,
                    suggested_questions=[],
                    needs_clarification=False,
                    clarification_options=[],
                    tool_calls_made=len(agent_result.tool_calls_made),
                    suggest_search_game=True,
                    search_game_name=agent_result.search_game_name,
                )

            response_text = agent_result.response
            suggested_questions = agent_result.suggested_questions
            tool_calls_made = len(agent_result.tool_calls_made)

            # Extract citations from tool results (top 5 for inline display)
            citations = []
            for tc in agent_result.tool_calls_made:
                if tc.get("tool") == "search_reviews":
                    result_data = tc.get("result", {})
                    for review in result_data.get("reviews", []):
                        if review.get("review_id"):
                            # Find the game name for this citation
                            citation_app_id = int(tc.get("params", {}).get("app_id") or (app_ids[0] if app_ids else 0))
                            citation = ChatCitationItem(
                                review_id=str(review.get("review_id", "")),
                                app_id=citation_app_id,
                                game_name=game_names.get(citation_app_id, f"Game {citation_app_id}"),
                                snippet=review.get("text", "")[:200],
                                votes_up=review.get("votes_up", 0),
                                voted_up=review.get("sentiment") == "positive",
                                playtime_hours=review.get("playtime_hours", 0),
                            )
                            citations.append(citation)
                            if len(citations) >= 5:
                                break
                if len(citations) >= 5:
                    break

            # Extract ALL source reviews used in context (for expandable widget)
            source_reviews = []
            for tc in agent_result.tool_calls_made:
                if tc.get("tool") == "search_reviews":
                    result_data = tc.get("result", {})
                    for review in result_data.get("reviews", []):
                        if review.get("review_id"):
                            citation_app_id = int(tc.get("params", {}).get("app_id") or (app_ids[0] if app_ids else 0))
                            source_review = ChatCitationItem(
                                review_id=str(review.get("review_id", "")),
                                app_id=citation_app_id,
                                game_name=game_names.get(citation_app_id, f"Game {citation_app_id}"),
                                snippet=review.get("text", ""),  # Full text, not truncated
                                votes_up=review.get("votes_up", 0),
                                voted_up=review.get("sentiment") == "positive",
                                playtime_hours=review.get("playtime_hours", 0),
                            )
                            source_reviews.append(source_review)

            games_used = game_metadata
            reviews_searched = sum(
                tc.get("result", {}).get("total_found", 0)
                for tc in agent_result.tool_calls_made
                if tc.get("tool") == "search_reviews"
            )
        else:
            # Standard chat: general conversation
            conversation_text = ""
            for msg in history:
                role_label = "User" if msg["role"] == "user" else "Assistant"
                conversation_text += f"{role_label}: {msg['content']}\n\n"

            # Add current message
            conversation_text += f"User: {message}\n\nAssistant:"

            # Create full prompt
            prompt = f"""You are a helpful, friendly AI assistant. You are having a conversation with a user.
Previous conversation:
{conversation_text if history else 'This is the start of the conversation.'}

Please respond naturally to the user's latest message, considering the conversation history.
If the user asks for a chart/plot/graph, include a fenced code block with language 'chart' containing JSON for Chart.js.
Example:
```chart
{{"type":"bar","title":"Example","data":{{"labels":["A","B"],"datasets":[{{"label":"Value","data":[1,2]}}]}}}}
```
"""

            # Use Gemini to generate response
            with llm.llm_usage_context(
                user_id=user_id,
                session_id=session_id,
                operation="chat_simple",
            ):
                response_text, model_id = llm.run_chat_completion(prompt)
            citations = []
            source_reviews = []
            games_used = []
            reviews_searched = 0
            suggested_questions = []
            tool_calls_made = 0

        # Save both user message and assistant response with session_id
        storage.save_chat_message(user_id, "user", message, session_id=session_id)
        storage.save_chat_message(user_id, "assistant", response_text, session_id=session_id)

        return SimpleChatResponse(
            response=response_text,
            session_id=session_id,
            citations=citations,
            source_reviews=source_reviews,
            games_used=games_used,
            reviews_searched=reviews_searched,
            has_game_context=has_game_context,
            suggested_questions=suggested_questions,
            needs_clarification=False,
            clarification_options=[],
            tool_calls_made=tool_calls_made,
            suggest_search_game=False,
            search_game_name="",
        )
    except credits.InsufficientCreditsError as exc:
        if session_id:
            _clear_chat_status(session_id)
        _raise_insufficient_credits(user_id, exc)
    except Exception as exc:
        logger.exception("Simple chat failed: %s", exc)
        raise HTTPException(status_code=500, detail="Chat request failed.") from exc


@app.get("/chat/sessions", response_model=List[ChatSession])
def get_chat_sessions(user_id: str = Depends(require_user_id)) -> List[ChatSession]:
    """Get all chat sessions for the current user."""
    try:
        sessions = storage.get_chat_sessions(user_id)
        return [ChatSession(**session) for session in sessions]
    except Exception as exc:
        logger.exception("Failed to load chat sessions: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat sessions.") from exc


@app.get("/chat/history", response_model=List[ChatMessage])
def get_chat_history(session_id: Optional[str] = None, user_id: str = Depends(require_user_id)) -> List[ChatMessage]:
    """Get chat history for the current user, optionally filtered by session."""
    try:
        history = storage.load_chat_history(user_id, limit=100, session_id=session_id)
        return [ChatMessage(**msg) for msg in history]
    except Exception as exc:
        logger.exception("Failed to load chat history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat history.") from exc


@app.delete("/chat/history")
def clear_chat_history_endpoint(session_id: Optional[str] = None, user_id: str = Depends(require_user_id)) -> Dict[str, Any]:
    """Clear chat history for the current user. If session_id provided, only clears that session."""
    try:
        count = storage.clear_chat_history(user_id, session_id=session_id)
        return {"deleted": count}
    except Exception as exc:
        logger.exception("Failed to clear chat history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to clear chat history.") from exc


class CitationFeedbackRequest(BaseModel):
    review_id: str
    session_id: str
    helpful: bool


@app.post("/chat/citation-feedback")
def submit_citation_feedback(
    request: CitationFeedbackRequest,
    user_id: str = Depends(require_user_id),
) -> Dict[str, str]:
    """Submit feedback on whether a citation was helpful."""
    try:
        storage.save_citation_feedback(
            user_id=user_id,
            session_id=request.session_id,
            review_id=request.review_id,
            helpful=request.helpful,
        )
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("Failed to save citation feedback: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save feedback.") from exc


@app.get("/support/thread", response_model=List[SupportMessage])
def get_support_thread(
    mark_read: bool = True,
    user_id: str = Depends(require_user_id),
) -> List[SupportMessage]:
    """Get support thread messages for the current user."""
    try:
        messages = storage.load_support_thread(user_id, limit=500)
        if mark_read:
            storage.mark_support_thread_read_by_user(user_id)
        return [SupportMessage(**msg) for msg in messages]
    except Exception as exc:
        logger.exception("Failed to load support thread: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load support thread.") from exc


@app.post("/support/message", response_model=SupportMessage)
def send_support_message(
    request: SupportMessageRequest,
    user_id: str = Depends(require_user_id),
) -> SupportMessage:
    """Send a support message as the current user."""
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    try:
        saved = storage.save_support_message(
            user_id=user_id,
            sender_id=user_id,
            sender_role="user",
            message=message,
        )
        return SupportMessage(**saved)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to send support message: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send support message.") from exc


@app.get("/admin/support/threads", response_model=List[SupportThreadSummary])
def get_admin_support_threads(
    limit: int = 100,
    _: None = Depends(require_admin),
) -> List[SupportThreadSummary]:
    """List support threads with unread counts (admin only)."""
    try:
        threads = storage.list_support_threads(limit=limit)
        return [SupportThreadSummary(**thread) for thread in threads]
    except Exception as exc:
        logger.exception("Failed to load support threads: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load support threads.") from exc


@app.get("/admin/support/thread/{thread_user_id}", response_model=List[SupportMessage])
def get_admin_support_thread(
    thread_user_id: str,
    mark_read: bool = True,
    _: None = Depends(require_admin),
) -> List[SupportMessage]:
    """Get support thread messages for a user (admin only)."""
    try:
        messages = storage.load_support_thread(thread_user_id, limit=500)
        if mark_read:
            storage.mark_support_thread_read_by_admin(thread_user_id)
        return [SupportMessage(**msg) for msg in messages]
    except Exception as exc:
        logger.exception("Failed to load support thread: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load support thread.") from exc


@app.post("/admin/support/thread/{thread_user_id}/reply", response_model=SupportMessage)
def send_admin_support_reply(
    thread_user_id: str,
    request: SupportMessageRequest,
    http_request: Request,
    _: None = Depends(require_admin),
) -> SupportMessage:
    """Send a reply in a support thread (admin only)."""
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    sender_id = _resolve_admin_user_id(http_request) or "admin"
    try:
        saved = storage.save_support_message(
            user_id=thread_user_id,
            sender_id=sender_id,
            sender_role="admin",
            message=message,
        )
        return SupportMessage(**saved)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to send admin support reply: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send support reply.") from exc


class UnreadCountResponse(BaseModel):
    """Response for unread message count."""
    unread_count: int


@app.get("/support/unread", response_model=UnreadCountResponse)
def get_support_unread_count(
    user_id: str = Depends(require_user_id),
) -> UnreadCountResponse:
    """Get count of unread admin replies for the current user."""
    try:
        count = storage.get_user_unread_support_count(user_id)
        return UnreadCountResponse(unread_count=count)
    except Exception as exc:
        logger.exception("Failed to get unread count: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to get unread count.") from exc


@app.get("/admin/support/unread", response_model=UnreadCountResponse)
def get_admin_support_unread_count(
    _: None = Depends(require_admin),
) -> UnreadCountResponse:
    """Get total count of unread user messages across all threads (admin only)."""
    try:
        count = storage.get_admin_total_unread_support_count()
        return UnreadCountResponse(unread_count=count)
    except Exception as exc:
        logger.exception("Failed to get admin unread count: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to get unread count.") from exc


@app.get("/admin/chat-sessions", response_model=List[AdminChatSession])
def get_admin_chat_sessions(
    limit: int = 100,
    _: None = Depends(require_admin),
) -> List[AdminChatSession]:
    """Get all chat sessions from all users with feedback info (admin only)."""
    try:
        sessions = storage.list_all_chat_sessions_with_feedback(limit=limit)
        return [AdminChatSession(**session) for session in sessions]
    except Exception as exc:
        logger.exception("Failed to load admin chat sessions: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat sessions.") from exc


@app.get("/admin/chat-history/{session_id}", response_model=List[ChatMessage])
def get_admin_chat_history(
    session_id: str,
    _: None = Depends(require_admin),
) -> List[ChatMessage]:
    """Get chat history for any session (admin only)."""
    try:
        # Load history directly by session_id (no user_id filter)
        history = storage.load_chat_history_by_session(session_id, limit=500)
        if not history:
            raise HTTPException(status_code=404, detail="Session not found or empty.")

        return [ChatMessage(**msg) for msg in history]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load chat history: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load chat history.") from exc


@app.get("/admin/llm-usage/summary", response_model=LLMUsageSummaryResponse)
def get_admin_llm_usage_summary(
    days: int = 30,
    user_id: Optional[str] = None,
    app_id: Optional[int] = None,
    session_id: Optional[str] = None,
    _: None = Depends(require_admin),
) -> LLMUsageSummaryResponse:
    """Get aggregated LLM usage metrics (admin only)."""
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


@app.get("/admin/usage", response_model=ApiUsageResponse)
def get_admin_usage(
    days: int = 30,
    user_id: Optional[str] = None,
    _: None = Depends(require_admin),
) -> ApiUsageResponse:
    """Get aggregated API request usage metrics (admin only)."""
    try:
        summary = storage.get_api_usage_summary(days=days, user_id=user_id)
        return ApiUsageResponse(**summary)
    except Exception as exc:
        logger.exception("Failed to load API usage summary: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load API usage summary.") from exc


def _llm_pricing_for_model(model_id: str) -> tuple:
    """Return (input_per_1m, output_per_1m) for a model ID."""
    return credits.LLM_MODEL_PRICING.get(model_id, credits.DEFAULT_LLM_PRICING)


def _llm_pricing_for_operation(operation: str) -> tuple:
    """Return (input_per_1m, output_per_1m) for an operation name."""
    return credits.OPERATION_LLM_PRICING.get(operation, credits.DEFAULT_LLM_PRICING)


def _compute_costs(prompt_tokens: int, response_tokens: int, pricing: tuple) -> Dict[str, float]:
    input_rate, output_rate = pricing
    input_cost = (prompt_tokens * input_rate) / 1_000_000
    output_cost = (response_tokens * output_rate) / 1_000_000
    return {
        "input": round(input_cost, 6),
        "output": round(output_cost, 6),
        "total": round(input_cost + output_cost, 6),
    }


def _estimate_cost_per_credit(operation: str) -> float:
    """Estimate LLM cost (USD) per credit spent on an operation."""
    pricing = _llm_pricing_for_operation(operation)
    tokens = credits.OPERATION_TOKEN_ESTIMATES.get(operation, (1500, 400))
    credit_cost = credits.CREDIT_COSTS.get(operation, 1)
    input_rate, output_rate = pricing
    llm_cost = (tokens[0] * input_rate + tokens[1] * output_rate) / 1_000_000
    return llm_cost / max(credit_cost, 1)


def _compute_tier_cost_estimates() -> List[TierCostEstimate]:
    """Compute estimated LLM cost per user for each tier at different usage levels."""
    # Light: all credits on classify (cheapest per credit)
    light_cpc = _estimate_cost_per_credit("classify")
    # Heavy: all credits on chat_agent (most expensive per credit)
    heavy_cpc = _estimate_cost_per_credit("chat_agent")
    # Typical: weighted mix — 55% classify, 20% chat, 15% summarize, 5% translate, 5% compare
    typical_cpc = (
        0.55 * _estimate_cost_per_credit("classify")
        + 0.20 * _estimate_cost_per_credit("chat_insights")
        + 0.15 * _estimate_cost_per_credit("summarize")
        + 0.05 * _estimate_cost_per_credit("translate")
        + 0.05 * _estimate_cost_per_credit("compare_overview")
    )

    estimates = []
    tiers = [
        ("free", credits.TRIAL_CREDITS),
        ("indie", credits.TIER_LIMITS["indie"]),
        ("pro", credits.TIER_LIMITS["pro"]),
        ("max", credits.TIER_LIMITS["max"]),
    ]
    for tier, cr in tiers:
        estimates.append(TierCostEstimate(
            tier=tier,
            credits=cr,
            light_usd=round(cr * light_cpc, 4),
            typical_usd=round(cr * typical_cpc, 4),
            heavy_usd=round(cr * heavy_cpc, 4),
        ))
    return estimates


@app.get("/admin/dashboard", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    days: int = 30,
    _: None = Depends(require_admin),
) -> AdminDashboardResponse:
    """Get aggregated admin dashboard metrics."""
    try:
        safe_days = max(1, min(int(days or 30), 365))
        user_summary = storage.get_user_summary(safe_days)
        tier_counts = storage.get_subscription_tier_counts()
        credit_summary = storage.get_credit_usage_summary(safe_days, limit=10)

        llm_usage = storage.get_llm_usage_summary(days=safe_days)

        # --- per-model costs (most accurate: uses model-specific pricing) ---
        by_model_costs = []
        total_input_cost = 0.0
        total_output_cost = 0.0
        for item in llm_usage.get("by_model", []) or []:
            model_id = str(item.get("model") or "unknown")
            prompt_tokens = int(item.get("prompt_tokens", 0) or 0)
            response_tokens = int(item.get("response_tokens", 0) or 0)
            costs = _compute_costs(prompt_tokens, response_tokens, _llm_pricing_for_model(model_id))
            total_input_cost += costs["input"]
            total_output_cost += costs["output"]
            by_model_costs.append(
                LLMCostBreakdown(
                    key=model_id,
                    calls=int(item.get("calls", 0) or 0),
                    prompt_tokens=prompt_tokens,
                    response_tokens=response_tokens,
                    total_tokens=int(item.get("total_tokens", 0) or 0),
                    cost_input_usd=costs["input"],
                    cost_output_usd=costs["output"],
                    cost_total_usd=costs["total"],
                )
            )

        # --- per-operation costs (uses operation→model mapping) ---
        by_operation_costs = []
        for item in llm_usage.get("by_operation", []) or []:
            operation = str(item.get("operation") or "unknown")
            prompt_tokens = int(item.get("prompt_tokens", 0) or 0)
            response_tokens = int(item.get("response_tokens", 0) or 0)
            costs = _compute_costs(prompt_tokens, response_tokens, _llm_pricing_for_operation(operation))
            by_operation_costs.append(
                LLMCostBreakdown(
                    key=operation,
                    calls=int(item.get("calls", 0) or 0),
                    prompt_tokens=prompt_tokens,
                    response_tokens=response_tokens,
                    total_tokens=int(item.get("total_tokens", 0) or 0),
                    cost_input_usd=costs["input"],
                    cost_output_usd=costs["output"],
                    cost_total_usd=costs["total"],
                )
            )

        # Total cost derived from per-model sums (most accurate)
        total_cost_usd = round(total_input_cost + total_output_cost, 6)

        mrr = 0.0
        for entry in tier_counts:
            tier = (entry.get("tier") or "free").lower()
            count = int(entry.get("count", 0) or 0)
            price = float(credits.TIER_PRICES.get(tier, 0))
            mrr += price * count

        users_payload = UsersSummary(
            total=user_summary.get("total", 0),
            new=user_summary.get("new", 0),
            active=user_summary.get("active", 0),
            paid=user_summary.get("paid", 0),
            mrr_estimate=round(mrr, 2),
            tier_counts=[TierCount(**item) for item in tier_counts],
        )

        credits_payload = CreditsSummary(
            used=credit_summary.get("used", 0),
            by_operation=[CreditsBreakdownItem(**item) for item in credit_summary.get("by_operation", [])],
            top_users=[TopUserCredits(**item) for item in credit_summary.get("top_users", [])],
            top_apps=[
                TopAppCredits(app_id=int(item.get("app_id")), credits_used=int(item.get("credits_used", 0) or 0))
                for item in credit_summary.get("top_apps", [])
                if item.get("app_id") is not None
            ],
        )

        llm_payload = LLMCostSummary(
            calls=int(llm_usage.get("total_calls", 0) or 0),
            prompt_tokens=int(llm_usage.get("prompt_tokens", 0) or 0),
            response_tokens=int(llm_usage.get("response_tokens", 0) or 0),
            total_tokens=int(llm_usage.get("total_tokens", 0) or 0),
            cost_input_usd=round(total_input_cost, 6),
            cost_output_usd=round(total_output_cost, 6),
            cost_total_usd=total_cost_usd,
            by_operation=by_operation_costs,
            by_model=by_model_costs,
        )

        return AdminDashboardResponse(
            since=str(llm_usage.get("since") or ""),
            days=int(llm_usage.get("days", safe_days) or safe_days),
            users=users_payload,
            credits=credits_payload,
            llm=llm_payload,
            cost_per_user=_compute_tier_cost_estimates(),
        )
    except Exception as exc:
        logger.exception("Failed to load admin dashboard: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load admin dashboard.") from exc


class GrantCreditsRequest(BaseModel):
    user_id: str
    amount: int = Field(..., gt=0, le=100000)
    reason: str = Field(..., min_length=1, max_length=200)


class GrantCreditsResponse(BaseModel):
    user_id: str
    amount_granted: int
    new_balance: int
    reason: str


@app.post("/admin/credits/grant", response_model=GrantCreditsResponse)
def grant_credits_to_user(
    payload: GrantCreditsRequest,
    _: None = Depends(require_admin),
) -> GrantCreditsResponse:
    """Grant credits to a user (admin only)."""
    try:
        new_balance = credits.add_credits(
            user_id=payload.user_id,
            amount=payload.amount,
            reason=payload.reason,
            description=f"Admin grant: {payload.reason}",
        )
        logger.info(f"Admin granted {payload.amount} credits to user {payload.user_id}")
        return GrantCreditsResponse(
            user_id=payload.user_id,
            amount_granted=payload.amount,
            new_balance=new_balance,
            reason=payload.reason,
        )
    except Exception as exc:
        logger.exception("Failed to grant credits: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class UpdateTierRequest(BaseModel):
    user_id: str
    tier: str = Field(..., pattern="^(free|indie|pro|max)$")


class UpdateTierResponse(BaseModel):
    user_id: str
    tier: str
    credits_monthly_limit: int
    credits_balance: int


@app.post("/admin/update-tier", response_model=UpdateTierResponse)
def admin_update_tier(
    payload: UpdateTierRequest,
    _: None = Depends(require_admin),
) -> UpdateTierResponse:
    """Update user subscription tier (admin only)."""
    try:
        credits.update_tier(user_id=payload.user_id, new_tier=payload.tier)
        subscription = credits.get_user_subscription(payload.user_id)
        logger.info(f"Admin updated user {payload.user_id} to tier {payload.tier}")
        return UpdateTierResponse(
            user_id=payload.user_id,
            tier=subscription["tier"],
            credits_monthly_limit=subscription["credits_monthly_limit"],
            credits_balance=subscription["credits_balance"],
        )
    except Exception as exc:
        logger.exception("Failed to update tier: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class UserSubscriptionInfo(BaseModel):
    user_id: str
    tier: str
    credits_balance: int
    credits_monthly_limit: int
    credits_used_this_period: int
    current_period_start: Optional[str]
    current_period_end: Optional[str]
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


@app.get("/admin/users/subscriptions", response_model=List[UserSubscriptionInfo])
def admin_list_user_subscriptions(
    limit: int = 100,
    _: None = Depends(require_admin),
) -> List[UserSubscriptionInfo]:
    """List all user subscriptions (admin only)."""
    try:
        from .senti_next import db as db_module
        with db_module.get_connection() as conn:
            result = conn.execute(
                text("""
                    SELECT user_id, tier, credits_balance, credits_monthly_limit,
                           credits_used_this_period, current_period_start, current_period_end,
                           stripe_customer_id, stripe_subscription_id, created_at, updated_at
                    FROM user_subscriptions
                    ORDER BY updated_at DESC
                    LIMIT :limit
                """),
                {"limit": limit},
            )
            rows = result.fetchall()

        return [
            UserSubscriptionInfo(
                user_id=row[0],
                tier=row[1],
                credits_balance=row[2],
                credits_monthly_limit=row[3],
                credits_used_this_period=row[4],
                current_period_start=row[5].isoformat() if row[5] else None,
                current_period_end=row[6].isoformat() if row[6] else None,
                stripe_customer_id=row[7],
                stripe_subscription_id=row[8],
                created_at=row[9].isoformat() if row[9] else None,
                updated_at=row[10].isoformat() if row[10] else None,
            )
            for row in rows
        ]
    except Exception as exc:
        logger.exception("Failed to list user subscriptions: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Frontend event tracking
# ---------------------------------------------------------------------------

class TrackEventRequest(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=100)
    event_category: str = Field("interaction", max_length=50)
    page: Optional[str] = Field(None, max_length=200)
    target: Optional[str] = Field(None, max_length=200)
    metadata: Optional[Dict[str, Any]] = None


@app.post("/track", status_code=204)
def track_event(request: TrackEventRequest, user_id: str = Depends(require_user_id)):
    """Record a frontend user interaction event."""
    storage.track_event(
        user_id=user_id,
        event_name=request.event_name,
        event_category=request.event_category,
        page=request.page,
        target=request.target,
        metadata=request.metadata,
    )


@app.get("/admin/analytics")
def admin_analytics(
    hours: int = 24,
    user_id: Optional[str] = None,
    _: None = Depends(require_admin),
):
    """Get user event analytics (admin only)."""
    hours = min(max(hours, 1), 720)  # clamp 1h - 30d
    return storage.get_events_summary(since_hours=hours, user_id=user_id)


@app.get("/chat/export/{session_id}")
def export_chat_session(
    session_id: str,
    format: str = "markdown",
    user_id: str = Depends(require_user_id),
):
    """Export a chat session as markdown or JSON."""
    messages = storage.load_chat_history(user_id, limit=500, session_id=session_id)

    if not messages:
        raise HTTPException(status_code=404, detail="No messages found for this session.")

    if format == "json":
        return JSONResponse(
            content={"session_id": session_id, "messages": messages},
            headers={"Content-Disposition": f"attachment; filename=chat-{session_id}.json"},
        )

    # Default to markdown
    md_lines = [f"# Chat Session {session_id}\n"]
    for msg in messages:
        role_label = "**User**" if msg["role"] == "user" else "**Assistant**"
        timestamp = msg.get("timestamp", "")
        if timestamp:
            md_lines.append(f"{role_label} ({timestamp}):\n")
        else:
            md_lines.append(f"{role_label}:\n")
        md_lines.append(f"{msg['content']}\n\n---\n")

    md_content = "\n".join(md_lines)
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=chat-{session_id}.md"},
    )


@app.get("/chat/stream/{session_id}")
async def chat_stream(
    session_id: str,
    user_id: str = Depends(_optional_user_id),
):
    """Server-Sent Events endpoint for real-time chat status updates.

    Subscribe to this endpoint when sending a chat message to receive
    status updates like "Searching reviews...", "Generating response...".

    Event types:
        - status: {"message": str, "timestamp": str}
        - done: {"status": "completed"}
    """
    import asyncio

    async def event_generator():
        last_index = 0
        idle_count = 0
        max_idle = 60  # 30 seconds of no updates = timeout

        while True:
            try:
                statuses = _get_chat_status(session_id)

                # Send any new status messages
                if len(statuses) > last_index:
                    for status in statuses[last_index:]:
                        yield f"event: status\ndata: {json.dumps({'message': status, 'timestamp': datetime.utcnow().isoformat() + 'Z'})}\n\n"
                        idle_count = 0
                    last_index = len(statuses)

                # Check if done (status list cleared or contains "done" indicator)
                if statuses and any("generating" in s.lower() for s in statuses[-3:]):
                    # Give some time for the response to complete
                    await asyncio.sleep(0.5)
                    if not _get_chat_status(session_id):
                        yield f"event: done\ndata: {json.dumps({'status': 'completed'})}\n\n"
                        return

                idle_count += 1
                if idle_count >= max_idle:
                    yield f"event: timeout\ndata: {json.dumps({'status': 'timeout'})}\n\n"
                    return

                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.warning("Chat SSE stream error: %s", exc)
                yield f"event: error\ndata: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/feedback/{app_id}", response_model=List[FeedbackItem], dependencies=[Depends(require_license)])
def aggregate_feedback(
    app_id: int,
    include_reddit: bool = True,
    include_discord: bool = True,
    include_steam_forums: bool = True,
    steam_limit: int = 200,
    reddit_limit: int = 50,
    discord_limit: int = 50,
    forum_limit: int = 30,
    user_id: str = Depends(require_user_id),
) -> List[FeedbackItem]:
    """Aggregate normalized feedback across Steam reviews, Reddit, Discord, and Steam forums."""
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")
    game_context = fetch_app_details(app_id) or {}
    app_name = game_context.get("name", str(app_id))

    steam_reviews = storage.load_reviews(app_id, limit=steam_limit)
    combined = ingest.collect_feedback(
        app_id,
        app_name,
        steam_reviews,
        include_reddit=include_reddit,
        include_discord=include_discord,
        include_steam_forums=include_steam_forums,
        reddit_limit=reddit_limit,
        discord_limit=discord_limit,
        forum_limit=forum_limit,
    )
    return [FeedbackItem(**item) for item in combined]


@app.get("/reviews/{app_id}", dependencies=[Depends(require_license)])
def export_reviews(
    app_id: int,
    limit: Optional[int] = None,
    format: str = "csv",
    refresh: bool = False,
    user_id: str = Depends(require_user_id),
):
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")
    rows = storage.load_reviews(app_id, limit)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No cached reviews for this app. Run an analysis with persistence enabled.",
        )

    if refresh:
        game_context = fetch_app_details(app_id)
        try:
            with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="export_refresh"):
                llm_labels = llm.ensure_review_labels(app_id, rows, game_context=game_context)
        except credits.InsufficientCreditsError as exc:
            _raise_insufficient_credits(user_id, exc)
    else:
        cached_labels = storage.load_review_labels(app_id)
        if not cached_labels:
            raise HTTPException(
                status_code=409,
                detail="No cached labels available. Re-run analysis or set refresh=true to regenerate.",
            )
        llm_labels = {rid: data.get("payload", {}) for rid, data in cached_labels.items()}

    df = build_reviews_dataframe(rows)
    df = llm.apply_review_labels(df, llm_labels)
    export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
    if not export_columns:
        raise HTTPException(status_code=500, detail="No exportable columns found.")

    if format == "json":
        data = df[export_columns].to_json(orient="records", date_format="iso", date_unit="s")
        return StreamingResponse(
            iter([data]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.json",
            },
        )

    # default CSV
    csv_data = df[export_columns].to_csv(index=False)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.csv",
        },
    )


@app.get("/reports/available-months/{app_id}", dependencies=[Depends(require_license)])
def get_report_months(
    app_id: int,
    user_id: str = Depends(require_user_id),
):
    """Get list of months with review data for a game.

    Returns list of months with review counts, ordered by most recent first.
    """
    from .senti_next import reports

    # Check if game is starred/analyzed by user
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")

    months = reports.get_available_months(app_id, user_id)

    return {"months": months}


@app.get("/reports/executive-summary/{app_id}", dependencies=[Depends(require_license)])
def generate_executive_summary(
    app_id: int,
    year: int,
    month: int,
    format: str = "pdf",
    include_llm_summary: bool = True,
    user_id: str = Depends(require_user_id),
):
    """Generate executive summary report for a game in a specific month.

    Query params:
    - year: 2024
    - month: 1 (January)
    - format: "pdf" (default) or "html" (preview)
    - include_llm_summary: true/false (default true)

    Returns: StreamingResponse with PDF
    """
    from .senti_next import reports

    # Validate year and month
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    if not (2000 <= year <= 2100):
        raise HTTPException(status_code=400, detail="Invalid year")

    # Check if game is starred/analyzed by user
    if not storage.user_has_game(user_id, app_id):
        raise HTTPException(status_code=404, detail="Game must be analyzed first")

    # Get game details
    game_context = fetch_app_details(app_id)
    game_name = game_context.get("name", f"App {app_id}") if game_context else f"App {app_id}"
    header_image = game_context.get("header_image", "") if game_context else ""

    # Load reviews for this game
    reviews = storage.load_reviews(app_id, limit=None)
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found for this game")

    # Build DataFrame with labels
    cached_labels = storage.load_review_labels(app_id)
    if not cached_labels:
        raise HTTPException(
            status_code=404,
            detail="No classification data available. Please analyze this game first.",
        )

    llm_labels = {rid: data.get("payload", {}) for rid, data in cached_labels.items()}
    df = build_reviews_dataframe(reviews)
    df = llm.apply_review_labels(df, llm_labels)

    # Filter to specified month
    filtered_df = reports.filter_reviews_by_month(df, year, month)
    if filtered_df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No reviews found for {datetime(year, month, 1).strftime('%B %Y')}",
        )

    # Calculate insights with month-over-month comparison
    try:
        insights = reports.calculate_monthly_insights(
            filtered_df,
            full_df=df,
            year=year,
            month=month,
        )
    except Exception as e:
        logger.error(f"Failed to calculate insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate insights") from e

    period = datetime(year, month, 1).strftime("%B %Y")

    # Optional LLM executive summary (generated on report download)
    if include_llm_summary and format in {"pdf", "html"}:
        try:
            summarize_cost = credits.CREDIT_COSTS["report_summary"]
            can_proceed, credit_message, _credit_status = credits.check_credits_available(user_id, summarize_cost)
            if can_proceed:
                with llm.llm_usage_context(user_id=user_id, app_id=app_id, operation="report_summary"):
                    llm_summary = llm.summarize_monthly_report(
                        game_name=game_name,
                        period=period,
                        insights=insights,
                    )
                llm_summary["generated_at"] = datetime.utcnow().isoformat() + "Z"
                insights = {**insights, "llm_summary": llm_summary}
            else:
                logger.info("Skipping report summary (credits unavailable): %s", credit_message)
        except credits.InsufficientCreditsError as exc:
            logger.info("Skipping report summary (insufficient credits): %s", exc)
        except Exception as exc:
            logger.exception("Failed to generate report summary: %s", exc)

    # Generate report

    # Format filename for downloads: GameName_January2026.pdf
    safe_game_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '' for c in game_name)
    safe_game_name = safe_game_name.replace(' ', '_')[:40]
    month_label = datetime(year, month, 1).strftime("%B%Y")

    if format == "html":
        # Return HTML for preview
        try:
            html_content = reports.create_dashboard_html(
                insights, game_name, period, app_id=app_id, header_image=header_image
            )
        except Exception as e:
            logger.error(f"Failed to generate HTML: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate HTML report") from e

        return StreamingResponse(
            iter([html_content.encode("utf-8")]),
            media_type="text/html; charset=utf-8",
        )

    elif format == "legacy":
        # Legacy multi-page PDF using ReportLab
        try:
            pdf_bytes = reports.create_pdf_report_legacy(insights, game_name, period)
        except Exception as e:
            logger.error(f"Failed to generate legacy PDF: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate PDF report") from e

        filename = f"{safe_game_name}_{month_label}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    elif format == "pdf":
        # New 1-page dashboard PDF (default)
        try:
            pdf_bytes = reports.create_pdf_report(
                insights, game_name, period, app_id=app_id, header_image=header_image
            )
        except Exception as e:
            logger.error(f"Failed to generate PDF: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate PDF report") from e

        filename = f"{safe_game_name}_{month_label}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    else:
        raise HTTPException(status_code=400, detail="Format must be 'pdf', 'html', or 'legacy'")


@app.get("/progress/{app_id}", dependencies=[Depends(require_license)])
def classification_progress(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> dict:
    progress = storage.load_progress(user_id, app_id)
    if not progress:
        # No progress row: check if an analysis is still marked as running
        # (covers the window after clear_progress but before result is updated)
        result = storage.load_analysis_result(user_id, app_id)
        if result and result.get("status") == "running":
            return {
                "app_id": app_id,
                "total": 0,
                "processed": 0,
                "active": True,
                "updated_at": None,
                "phase": "fetching",
                "fetched_count": 0,
            }
        return {
            "app_id": app_id,
            "total": 0,
            "processed": 0,
            "active": False,
            "updated_at": None,
            "phase": "idle",
            "fetched_count": 0,
        }

    total = int(progress.get("total", 0))
    processed = int(progress.get("processed", 0))
    phase = progress.get("phase", "classifying")
    fetched_count = int(progress.get("fetched_count", 0))
    timestamp = progress.get("updated_at")
    updated_at = (
        datetime.utcfromtimestamp(timestamp).isoformat() + "Z"
        if timestamp
        else None
    )

    # For fetching phase, consider active if fetched_count > 0
    # For classifying phase, consider active if processed < total
    if phase == "fetching":
        active = True
    else:
        active = processed < total

    return {
        "app_id": app_id,
        "total": total,
        "processed": processed,
        "active": active,
        "updated_at": updated_at,
        "phase": phase,
        "fetched_count": fetched_count,
    }


@app.get("/progress/{app_id}/stream", dependencies=[Depends(require_license)])
async def progress_stream(
    app_id: int,
    user_id: str = Depends(_optional_user_id),
):
    """Server-Sent Events endpoint for real-time progress updates.

    Streams progress updates every 500ms until analysis completes or client disconnects.
    Event types:
        - progress: {"processed": int, "total": int, "active": bool, "phase": str, "fetched_count": int}
        - completed: {"status": "completed"}
        - error: {"status": "failed", "error": str}
    """
    async def event_generator():
        last_processed = -1
        last_fetched = -1
        idle_count = 0
        max_idle = 120  # 60 seconds of no progress = timeout

        while True:
            try:
                progress = storage.load_progress(user_id, app_id)

                if not progress:
                    # Check if analysis result exists
                    result = storage.load_analysis_result(user_id, app_id)
                    if result:
                        status = result.get("status", "unknown")
                        if status == "completed":
                            yield f"event: completed\ndata: {json.dumps({'status': 'completed'})}\n\n"
                            return
                        elif status == "failed":
                            error = result.get("error", "Analysis failed")
                            yield f"event: error\ndata: {json.dumps({'status': 'failed', 'error': error})}\n\n"
                            return
                        elif status == "running":
                            # Job is still running but progress was cleared/not yet initialized
                            yield f"event: progress\ndata: {json.dumps({'processed': 0, 'total': 0, 'active': True, 'phase': 'fetching', 'fetched_count': 0})}\n\n"
                            idle_count += 1
                            await asyncio.sleep(0.5)
                            continue

                    # No progress and no result - send empty state
                    yield f"event: progress\ndata: {json.dumps({'processed': 0, 'total': 0, 'active': False, 'phase': 'idle', 'fetched_count': 0})}\n\n"
                    idle_count += 1
                else:
                    total = int(progress.get("total", 0))
                    processed = int(progress.get("processed", 0))
                    phase = progress.get("phase", "classifying")
                    fetched_count = int(progress.get("fetched_count", 0))

                    # For fetching phase, consider active if fetched_count is changing
                    # For classifying phase, consider active if processed < total
                    if phase == "fetching":
                        active = True  # Always active during fetching
                    else:
                        active = processed < total

                    yield f"event: progress\ndata: {json.dumps({'processed': processed, 'total': total, 'active': active, 'phase': phase, 'fetched_count': fetched_count})}\n\n"

                    # Track progress changes for both phases
                    if phase == "fetching":
                        if fetched_count == last_fetched:
                            idle_count += 1
                        else:
                            idle_count = 0
                            last_fetched = fetched_count
                    else:
                        if processed == last_processed:
                            idle_count += 1
                        else:
                            idle_count = 0
                            last_processed = processed

                    # Check if completed
                    if not active and total > 0:
                        result = storage.load_analysis_result(user_id, app_id)
                        if result:
                            status = result.get("status", "unknown")
                            if status == "completed":
                                yield f"event: completed\ndata: {json.dumps({'status': 'completed'})}\n\n"
                                return
                            elif status == "failed":
                                error = result.get("error", "Analysis failed")
                                yield f"event: error\ndata: {json.dumps({'status': 'failed', 'error': error})}\n\n"
                                return

                if idle_count >= max_idle:
                    yield f"event: timeout\ndata: {json.dumps({'status': 'timeout'})}\n\n"
                    return

                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                # Client disconnected
                return
            except Exception as exc:
                logger.warning("SSE progress stream error: %s", exc)
                yield f"event: error\ndata: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
                return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@app.post("/progress/{app_id}/cancel", dependencies=[Depends(require_license)])
def cancel_analysis(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Cancel a running analysis job."""
    cancelled = storage.cancel_progress(user_id, app_id)
    if cancelled:
        logger.info(f"Analysis cancelled for app {app_id} by user {user_id}")
        # Also mark the analysis result as cancelled
        storage.save_analysis_result(
            user_id=user_id,
            app_id=app_id,
            metadata={},
            insights=None,
            reviews=[],
            status="cancelled",
            error="Analysis cancelled by user",
        )
    return {"cancelled": cancelled, "app_id": app_id}


@app.get("/starred", response_model=List[StarredGameResponse], dependencies=[Depends(require_license)])
def list_starred_games(
    user_id: str = Depends(require_user_id),
) -> List[StarredGameResponse]:
    entries = storage.load_starred_games(user_id)
    response: List[StarredGameResponse] = []
    for item in entries:
        metadata_payload = item.get("metadata") or {}
        if metadata_payload and not metadata_payload.get("header_image"):
            details = fetch_app_details(item["app_id"])
            if details and details.get("header_image"):
                metadata_payload["header_image"] = details["header_image"]
        metadata = AnalyzeMetadata(**metadata_payload)
        updated_at = datetime.utcfromtimestamp(item["updated_at"]).isoformat() + "Z"
        response.append(
            StarredGameResponse(
                app_id=item["app_id"],
                name=item["name"],
                metadata=metadata,
                insights=item.get("insights"),
                sample=item.get("sample", []),
                updated_at=updated_at,
                is_favorite=item.get("is_favorite", False),
            )
        )
    return response


@app.post("/starred", status_code=204, dependencies=[Depends(require_license)])
def save_starred_game(
    payload: StarredGamePayload,
    user_id: str = Depends(require_user_id),
) -> Response:
    sample = payload.sample[:SAMPLE_LIMIT]

    # Fetch game details to get genres and categories
    game_details = fetch_app_details(payload.app_id)
    genres = game_details.get("genres", []) if game_details else []
    categories = game_details.get("categories", []) if game_details else []
    metadata_payload = payload.metadata.dict()
    if game_details and game_details.get("header_image"):
        metadata_payload["header_image"] = game_details["header_image"]

    storage.save_starred_game(
        user_id=user_id,
        app_id=payload.app_id,
        name=payload.name,
        metadata=metadata_payload,
        insights=payload.insights,
        sample=sample,
        genres=genres,
        categories=categories,
    )
    return Response(status_code=204)


@app.delete("/starred/{app_id}", status_code=204, dependencies=[Depends(require_license)])
def remove_starred_game(app_id: int, user_id: str = Depends(require_user_id)) -> Response:
    storage.delete_starred_game(user_id, app_id)
    return Response(status_code=204)


class FavoriteStatusPayload(BaseModel):
    is_favorite: bool


@app.patch("/starred/{app_id}/favorite", status_code=200, dependencies=[Depends(require_license)])
def toggle_favorite_status(
    app_id: int,
    payload: FavoriteStatusPayload,
    user_id: str = Depends(require_user_id),
) -> dict:
    """Toggle the favorite status of a starred game."""
    updated = storage.update_favorite_status(user_id, app_id, payload.is_favorite)
    if not updated:
        raise HTTPException(status_code=404, detail="Starred game not found")
    return {"app_id": app_id, "is_favorite": payload.is_favorite}


@app.get("/starred/favorites", response_model=List[StarredGameResponse], dependencies=[Depends(require_license)])
def list_favorite_games(
    user_id: str = Depends(require_user_id),
) -> List[StarredGameResponse]:
    """List all favorite games for the current user."""
    entries = storage.load_favorite_games(user_id)
    response: List[StarredGameResponse] = []
    for item in entries:
        metadata_payload = item.get("metadata") or {}
        if metadata_payload and not metadata_payload.get("header_image"):
            details = fetch_app_details(item["app_id"])
            if details and details.get("header_image"):
                metadata_payload["header_image"] = details["header_image"]
        metadata = AnalyzeMetadata(**metadata_payload)
        updated_at = datetime.utcfromtimestamp(item["updated_at"]).isoformat() + "Z"
        response.append(
            StarredGameResponse(
                app_id=item["app_id"],
                name=item["name"],
                metadata=metadata,
                insights=item.get("insights"),
                sample=item.get("sample", []),
                updated_at=updated_at,
                is_favorite=True,
            )
        )
    return response


@app.delete("/games/{app_id}", status_code=204)
def delete_game_data(app_id: int, _: None = Depends(require_admin)) -> Response:
    """Delete all data for a game (reviews, labels, progress, starred)."""
    storage.delete_all_game_data(app_id)
    return Response(status_code=204)


@app.get("/database/stats", dependencies=[Depends(require_license)])
def database_stats(scope: Optional[str] = None, user_id: str = Depends(require_user_id)) -> dict:
    """Get database statistics (games, reviews, labels counts)."""
    scope_user_id = resolve_scope_user_id(scope, user_id)
    return storage.get_database_stats(scope_user_id)


@app.delete("/database/labels", status_code=200)
def clear_labels(old_schema_only: bool = False, _: None = Depends(require_admin)) -> dict:
    """Clear labels from database. If old_schema_only=true, only removes labels with old schema."""
    if old_schema_only:
        count = storage.clear_old_schema_labels()
        return {"deleted": count, "scope": "old_schema_labels"}
    else:
        count = storage.clear_all_labels()
        return {"deleted": count, "scope": "all_labels"}


@app.delete("/database/clear", status_code=200)
def clear_database(_: None = Depends(require_admin)) -> dict:
    """Clear entire database (all games, reviews, labels, progress, starred)."""
    counts = storage.clear_entire_database()
    return {"deleted": counts, "scope": "entire_database"}


@app.get("/database/games", response_model=List[DatabaseGameOption], dependencies=[Depends(require_license)])
def database_games(scope: Optional[str] = None, user_id: str = Depends(require_user_id)) -> List[DatabaseGameOption]:
    scope_user_id = resolve_scope_user_id(scope, user_id)
    if scope_user_id is None:
        entries = storage.list_database_games_all()
    else:
        entries = storage.list_database_games(scope_user_id)
    return [DatabaseGameOption(**entry) for entry in entries]


@app.get("/database/reviews/{review_id}", dependencies=[Depends(require_license)])
def get_database_review_by_id(
    review_id: str,
    user_id: str = Depends(require_user_id),
):
    """
    Get a single review by its review_id for permalink support.
    Returns the review with game information and labels.
    """
    # Get the review from storage
    review_row = storage.get_review_by_id(review_id)
    if not review_row:
        raise HTTPException(status_code=404, detail="Review not found")

    # Check if user has access to this review's game
    app_id = review_row["app_id"]
    user_games = storage.list_database_games(user_id)
    user_app_ids = [entry["app_id"] for entry in user_games]

    # Allow access if user owns the game or if user is admin
    auth_status = _get_auth_status(user_id)
    if app_id not in user_app_ids and not auth_status.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Access denied to this review")

    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
    review_item = _database_row_to_item(review_row, games_map)

    return {"review": review_item}


@app.get("/database/reviews", response_model=DatabaseReviewsResponse, dependencies=[Depends(require_license)])
def database_reviews(
    limit: int = 200,
    offset: int = 0,
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
    scope: Optional[str] = None,
    user_id: str = Depends(require_user_id),
) -> DatabaseReviewsResponse:
    scope_user_id = resolve_scope_user_id(scope, user_id)
    if scope_user_id is None:
        user_games = storage.list_database_games_all()
        user_app_ids = None
    else:
        user_games = storage.list_database_games(scope_user_id)
        user_app_ids = [entry["app_id"] for entry in user_games]
    rows, total = storage.load_database_reviews(
        limit=limit,
        offset=offset,
        app_id=app_id,
        language=language,
        query=query,
        app_ids=user_app_ids,
    )
    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
    items: List[DatabaseReviewItem] = []

    for row in rows:
        items.append(_database_row_to_item(row, games_map))

    return DatabaseReviewsResponse(items=items, total=int(total), offset=int(offset), limit=int(limit))


@app.get("/database/reviews/count", dependencies=[Depends(require_license)])
def database_reviews_count(
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
    scope: Optional[str] = None,
    user_id: str = Depends(require_user_id),
):
    """
    Get export preview count and metadata for the database export.
    Returns total count, games count, date range, and top games.
    """
    scope_user_id = resolve_scope_user_id(scope, user_id)
    if scope_user_id is None:
        user_games = storage.list_database_games_all()
        user_app_ids = None
    else:
        user_games = storage.list_database_games(scope_user_id)
        user_app_ids = [entry["app_id"] for entry in user_games]

    # Get total count
    _, total = storage.load_database_reviews(
        limit=1,
        offset=0,
        app_id=app_id,
        language=language,
        query=query,
        app_ids=user_app_ids,
    )

    # Get top games (up to 5)
    top_games = []
    if not app_id:
        # Count reviews per game
        game_counts = {}
        offset_value = 0
        page_size = 1000
        while offset_value < total:
            rows, _ = storage.load_database_reviews(
                limit=page_size,
                offset=offset_value,
                app_id=app_id,
                language=language,
                query=query,
                app_ids=user_app_ids,
            )
            if not rows:
                break
            for row in rows:
                game_app_id = row["app_id"]
                game_counts[game_app_id] = game_counts.get(game_app_id, 0) + 1
            offset_value += len(rows)
            if len(rows) < page_size:
                break

        # Get top 5 games
        games_map = {entry["app_id"]: entry.get("name") for entry in user_games}
        sorted_games = sorted(game_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        top_games = [
            {"app_id": app_id, "name": games_map.get(app_id, f"App {app_id}"), "count": count}
            for app_id, count in sorted_games
        ]

    return {
        "total": int(total),
        "games": len(user_games) if not app_id else 1,
        "top_games": top_games,
    }


@app.get("/database/export", dependencies=[Depends(require_license)])
def database_export(
    format: str = "csv",
    app_id: Optional[int] = None,
    language: Optional[str] = None,
    query: Optional[str] = None,
    scope: Optional[str] = None,
    max_rows: Optional[int] = None,
    user_id: str = Depends(require_user_id),
):
    export_format = (format or "csv").strip().lower()
    if export_format not in {"csv", "jsonl"}:
        raise HTTPException(status_code=400, detail="Unsupported export format. Use csv or jsonl.")

    scope_user_id = resolve_scope_user_id(scope, user_id)
    if scope_user_id is None:
        user_games = storage.list_database_games_all()
        user_app_ids = None
        scope_label = "all"
    else:
        user_games = storage.list_database_games(scope_user_id)
        user_app_ids = [entry["app_id"] for entry in user_games]
        scope_label = "me"
    games_map = {entry["app_id"]: entry.get("name") for entry in user_games}

    if max_rows is None:
        max_rows_value = EXPORT_MAX_ROWS
    else:
        try:
            max_rows_value = int(max_rows)
        except Exception:
            max_rows_value = EXPORT_MAX_ROWS
    if max_rows_value <= 0:
        max_rows_value = EXPORT_MAX_ROWS
    max_rows_value = min(max_rows_value, EXPORT_MAX_ROWS)

    now_stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    app_label = str(app_id) if app_id else "all"
    ext = "csv" if export_format == "csv" else "jsonl"
    filename = f"sentinext-dataset-{scope_label}-{app_label}-{now_stamp}.{ext}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    def iter_review_items():
        offset_value = 0
        remaining = max_rows_value
        page_size = 500
        while remaining > 0:
            page_limit = min(page_size, remaining)
            rows, _total = storage.load_database_reviews(
                limit=page_limit,
                offset=offset_value,
                app_id=app_id,
                language=language,
                query=query,
                app_ids=user_app_ids,
            )
            if not rows:
                break
            for row in rows:
                yield _database_row_to_item(row, games_map)
            offset_value += len(rows)
            remaining -= len(rows)
            if len(rows) < page_limit:
                break

    if export_format == "jsonl":
        def iter_jsonl():
            for item in iter_review_items():
                payload = item.dict()
                yield (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")

        return StreamingResponse(iter_jsonl(), media_type="application/x-ndjson", headers=headers)

    def iter_csv():
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=REVIEW_EXPORT_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        yield output.getvalue().encode("utf-8")
        output.seek(0)
        output.truncate(0)

        buffered = 0
        for item in iter_review_items():
            payload = item.dict()
            row = {key: _serialize_export_value(payload.get(key)) for key in REVIEW_EXPORT_COLUMNS}
            writer.writerow(row)
            buffered += 1
            if buffered >= 100:
                yield output.getvalue().encode("utf-8")
                output.seek(0)
                output.truncate(0)
                buffered = 0

        if output.tell():
            yield output.getvalue().encode("utf-8")

    return StreamingResponse(iter_csv(), media_type="text/csv", headers=headers)


# ============================================================================
# Steam Extended Data Endpoints (News, Players, Achievements)
# ============================================================================

class NewsItemResponse(BaseModel):
    gid: str
    title: str
    url: str
    author: str
    contents: str
    feed_label: str
    date: int
    feed_name: str
    feed_type: int


class NewsResponse(BaseModel):
    app_id: int
    news_items: List[NewsItemResponse]


@app.get("/steam/news/{app_id}", response_model=NewsResponse, dependencies=[Depends(require_license)])
def get_steam_news(
    app_id: int,
    count: int = 20,
    max_length: int = 500,
    user_id: str = Depends(require_user_id),
):
    """Fetch news and announcements for a Steam game.

    Returns patch notes, announcements, and updates that can be used
    to correlate with sentiment changes on the timeline.
    """
    try:
        news_items = fetch_news_for_app(app_id, count=count, max_length=max_length)
        return NewsResponse(
            app_id=app_id,
            news_items=[
                NewsItemResponse(
                    gid=item.gid,
                    title=item.title,
                    url=item.url,
                    author=item.author,
                    contents=item.contents,
                    feed_label=item.feed_label,
                    date=item.date,
                    feed_name=item.feed_name,
                    feed_type=item.feed_type,
                )
                for item in news_items
            ],
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching news for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching news for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


class PlayerCountResponse(BaseModel):
    app_id: int
    player_count: Optional[int]
    timestamp: int


@app.get("/steam/players/{app_id}", response_model=PlayerCountResponse, dependencies=[Depends(require_license)])
def get_steam_player_count(
    app_id: int,
    user_id: str = Depends(require_user_id),
):
    """Fetch the current number of players for a Steam game.

    Returns the live player count which can be used to correlate
    with review volume and sentiment patterns.
    """
    try:
        player_count = fetch_current_players(app_id)
        return PlayerCountResponse(
            app_id=app_id,
            player_count=player_count,
            timestamp=int(datetime.utcnow().timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching player count for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching player count for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


class PriceResponse(BaseModel):
    app_id: int
    is_free: bool
    price_initial: Optional[float] = None  # Original price in major units (e.g., 29.99)
    price_final: Optional[float] = None    # Current price after discount
    price_initial_formatted: Optional[str] = None  # e.g., "$29.99"
    price_final_formatted: Optional[str] = None    # e.g., "$19.99"
    price_discount: int = 0                # Discount percentage (0-100)
    price_currency: Optional[str] = None   # e.g., "USD"
    timestamp: int


@app.get("/steam/price/{app_id}", response_model=PriceResponse, dependencies=[Depends(require_license)])
def get_steam_price(
    app_id: int,
    cc: str = "us",  # Country code for regional pricing (default USD)
    user_id: str = Depends(require_user_id),
):
    """Fetch the current price for a Steam game.

    Returns live pricing data including discounts. Prices are in USD by default.
    Use the 'cc' parameter for regional pricing (e.g., 'de' for Germany, 'it' for Italy).
    """
    try:
        details = fetch_app_details(app_id, use_cache=False)  # Don't cache for fresh prices
        if not details:
            raise HTTPException(status_code=404, detail="Game not found")

        is_free = details.get("is_free", False)

        return PriceResponse(
            app_id=app_id,
            is_free=is_free,
            price_initial=details.get("price_initial"),
            price_final=details.get("price_final") if not is_free else None,
            price_initial_formatted=details.get("price_initial_formatted"),
            price_final_formatted="Free" if is_free else details.get("price_final_formatted"),
            price_discount=details.get("price_discount", 0),
            price_currency=details.get("price_currency"),
            timestamp=int(datetime.utcnow().timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching price for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error fetching price for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


class GameDetailsResponse(BaseModel):
    app_id: int
    name: str
    release_date: Optional[str] = None
    coming_soon: bool = False
    developers: List[str] = []
    publishers: List[str] = []
    genres: List[str] = []
    categories: List[str] = []
    # Price info included for convenience
    is_free: bool = False
    price_initial: Optional[float] = None
    price_final: Optional[float] = None
    price_discount: int = 0
    price_currency: Optional[str] = None
    timestamp: int


@app.get("/steam/details/{app_id}", response_model=GameDetailsResponse, dependencies=[Depends(require_license)])
def get_steam_details(
    app_id: int,
    user_id: str = Depends(require_user_id),
):
    """Fetch detailed information for a Steam game.

    Returns release date, developers, publishers, genres, categories, and pricing.
    """
    try:
        details = fetch_app_details(app_id, use_cache=False)
        if not details:
            raise HTTPException(status_code=404, detail="Game not found")

        is_free = details.get("is_free", False)

        return GameDetailsResponse(
            app_id=app_id,
            name=details.get("name", ""),
            release_date=details.get("release_date"),
            coming_soon=details.get("coming_soon", False),
            developers=details.get("developers", []),
            publishers=details.get("publishers", []),
            genres=details.get("genres", []),
            categories=details.get("categories", []),
            is_free=is_free,
            price_initial=details.get("price_initial"),
            price_final=details.get("price_final") if not is_free else None,
            price_discount=details.get("price_discount", 0),
            price_currency=details.get("price_currency"),
            timestamp=int(datetime.utcnow().timestamp()),
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching details for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error fetching details for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


class AchievementResponse(BaseModel):
    name: str
    display_name: str
    description: str
    percent: float
    icon: str
    icon_gray: str
    hidden: bool


class AchievementsResponse(BaseModel):
    app_id: int
    achievements: List[AchievementResponse]
    total_count: int
    completion_rate: Optional[float]  # Average completion rate across all achievements


@app.get("/steam/achievements/{app_id}", response_model=AchievementsResponse, dependencies=[Depends(require_license)])
def get_steam_achievements(
    app_id: int,
    limit: int = 50,
    user_id: str = Depends(require_user_id),
):
    """Fetch global achievement statistics for a Steam game.

    Returns achievement percentages which can indicate player retention,
    difficulty perception, and engagement levels.
    """
    try:
        achievements = fetch_achievements_with_stats(app_id)

        # Calculate average completion rate
        completion_rate = None
        if achievements:
            completion_rate = sum(a["percent"] for a in achievements) / len(achievements)

        # Limit results
        limited_achievements = achievements[:limit]

        return AchievementsResponse(
            app_id=app_id,
            achievements=[
                AchievementResponse(
                    name=a["name"],
                    display_name=a["display_name"],
                    description=a["description"],
                    percent=a["percent"],
                    icon=a["icon"],
                    icon_gray=a["icon_gray"],
                    hidden=a["hidden"],
                )
                for a in limited_achievements
            ],
            total_count=len(achievements),
            completion_rate=completion_rate,
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching achievements for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching achievements for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


class GameContextResponse(BaseModel):
    """Extended game context including live data."""
    app_id: int
    name: Optional[str]
    short_description: Optional[str]
    genres: List[str]
    categories: List[str]
    header_image: Optional[str]
    current_players: Optional[int]
    recent_news: List[NewsItemResponse]


@app.get("/steam/context/{app_id}", response_model=GameContextResponse, dependencies=[Depends(require_license)])
def get_steam_game_context(
    app_id: int,
    news_count: int = 5,
    user_id: str = Depends(require_user_id),
):
    """Fetch comprehensive game context including details, players, and recent news.

    This is a convenience endpoint that combines multiple Steam API calls
    into a single response for dashboard display.
    """
    from concurrent.futures import ThreadPoolExecutor

    try:
        # Fetch all data in parallel for efficiency
        with ThreadPoolExecutor(max_workers=3) as executor:
            details_future = executor.submit(fetch_app_details, app_id)
            players_future = executor.submit(fetch_current_players, app_id)
            news_future = executor.submit(fetch_news_for_app, app_id, count=news_count, max_length=300)

            details = details_future.result()
            current_players = players_future.result()
            news_items = news_future.result()

        return GameContextResponse(
            app_id=app_id,
            name=details.get("name") if details else None,
            short_description=details.get("short_description") if details else None,
            genres=details.get("genres", []) if details else [],
            categories=details.get("categories", []) if details else [],
            header_image=details.get("header_image") if details else None,
            current_players=current_players,
            recent_news=[
                NewsItemResponse(
                    gid=item.gid,
                    title=item.title,
                    url=item.url,
                    author=item.author,
                    contents=item.contents,
                    feed_label=item.feed_label,
                    date=item.date,
                    feed_name=item.feed_name,
                    feed_type=item.feed_type,
                )
                for item in news_items
            ],
        )
    except SteamAPIError as exc:
        logger.error("Steam API error fetching context for app %s: %s", app_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching context for app %s", app_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


# ---------------------------------------------------------------------------
# GDPR: Account / data deletion
# ---------------------------------------------------------------------------

@app.delete("/account")
def delete_account(user_id: str = Depends(require_user_id)) -> dict:
    """Delete all user-owned data (GDPR right to erasure).

    Removes starred games, chat history, support messages, credit records,
    analysis results, and other user-specific data. Shared data (reviews,
    labels) is not affected.
    """
    deleted = storage.delete_user_data(user_id)
    total = sum(deleted.values())
    logger.info("GDPR deletion for user %s: %d rows across %d tables", user_id, total, len(deleted))
    return {
        "status": "deleted",
        "user_id": user_id,
        "deleted": deleted,
        "total_rows": total,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
