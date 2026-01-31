from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
import os
import secrets
import csv
import io
from datetime import datetime
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .senti_next import (
    SteamAPIError,
    build_reviews_dataframe,
    fetch_reviews,
    search_applications,
)
from .senti_next import ingest
from .senti_next.steam_api import fetch_app_details
from .senti_next.insights import prepare_insights
from .senti_next import storage
from .senti_next import llm
from .senti_next import license as license_guard
from .senti_next import chat
from .senti_next import redis_client
from .senti_next import jobs as job_runner
from .senti_next import logging_config

logger = logging.getLogger(__name__)

SAMPLE_LIMIT = 1000
FETCH_LIMIT = 2000

APP_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
]

def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("SENTINEXT_ALLOWED_ORIGINS")
    if not raw:
        return APP_ORIGINS
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or APP_ORIGINS

ALLOWED_ORIGINS = _parse_allowed_origins()

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

app = FastAPI(title="SentiNext API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}
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
    is_sse = "/stream" in request.url.path

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


def _resolve_user_id(request: Request) -> str:
    if not AUTH_ENABLED:
        return "local"
    payload = getattr(request.state, "user", None) or {}
    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user identity.")
    return str(user_id)


def require_user_id(request: Request) -> str:
    return _resolve_user_id(request)


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


class SearchResult(BaseModel):
    appid: int
    name: str
    price: Optional[str] = None
    url: str
    image_url: Optional[str] = None


class AnalyzeRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    review_count: int = Field(FETCH_LIMIT, ge=0, le=FETCH_LIMIT)
    language: str = Field("english", min_length=2, max_length=32)
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
    fetched_at: str
    header_image: Optional[str] = None


class AnalyzeResponse(BaseModel):
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    reviews: List[dict]

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


def _database_row_to_item(row: Dict[str, Any], games_map: Dict[int, Optional[str]]) -> "DatabaseReviewItem":
    try:
        payload = json.loads(row.get("data") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        label_payload = json.loads(row.get("label_payload") or "{}")
    except json.JSONDecodeError:
        label_payload = {}

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
def healthcheck() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.get("/settings/storage")
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

@app.get("/settings/llm")
def llm_settings() -> dict:
    """Return current LLM provider and model configuration."""
    from .senti_next import llm as llm_module
    provider = llm_module.LLM_PROVIDER

    if provider == "google":
        model = llm_module.GEMINI_MODEL
        api_key_set = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    else:
        model = llm_module.OPENAI_MODEL
        api_key_set = bool(os.getenv("OPENAI_API_KEY") or os.getenv("SENTINEXT_OPENAI_API_KEY"))

    return {
        "provider": provider,
        "model": model,
        "api_key_configured": api_key_set,
    }

@app.get("/logs/tail")
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
        storage.reset_progress(user_id, app_id, total_reviews)

        def _progress_callback(processed: int, total: int) -> None:
            try:
                storage.update_progress(user_id, app_id, processed, total)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Progress update failed: %s", exc)
    else:
        storage.clear_progress(user_id, app_id)

    try:
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
    except Exception as exc:  # pragma: no cover - defensive
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
            storage.update_progress(user_id, app_id, total_reviews, total_reviews)
            storage.clear_progress(user_id, app_id)


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

    has_enough_cached = len(stored_reviews) >= int(request.review_count or 0)
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached

    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            fetched_reviews = fetch_reviews(
                request.app_id,
                count=request.review_count,
                language=request.language,
                filter_type=filter_type,
                day_range=request.refresh_days or request.day_range,
            )
        except SteamAPIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if request.persist:
            storage.upsert_reviews(request.app_id, fetched_reviews)
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

    game_context = fetch_app_details(request.app_id)
    header_image = None
    if game_context:
        header_image = game_context.get("header_image")

    metadata = AnalyzeMetadata(
        app_id=request.app_id,
        requested=request.review_count,
        retrieved=len(all_reviews),
        language=request.language,
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
    storage.clear_progress(user_id, request.app_id)

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

    return AnalyzeResponse(metadata=metadata, insights=None, reviews=[])

@app.post("/analyze/estimate", response_model=AnalyzeEstimateResponse, dependencies=[Depends(require_license)])
def analyze_estimate(request: AnalyzeRequest) -> AnalyzeEstimateResponse:
    """Estimate how many labels will be reused vs require new work (no LLM calls)."""
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    has_enough_cached = len(stored_reviews) >= int(request.review_count or 0)
    should_fetch = not stored_reviews or request.refresh or not request.persist or not has_enough_cached
    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            fetched_reviews = fetch_reviews(
                request.app_id,
                count=request.review_count,
                language=request.language,
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
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Chat failed: %s", exc)
        raise HTTPException(status_code=500, detail="Chat request failed.") from exc

    return ChatResponse(**payload)


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
        llm_labels = llm.ensure_review_labels(app_id, rows, game_context=game_context)
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


@app.get("/progress/{app_id}", dependencies=[Depends(require_license)])
def classification_progress(
    app_id: int,
    user_id: str = Depends(require_user_id),
) -> dict:
    progress = storage.load_progress(user_id, app_id)
    if not progress:
        return {
            "app_id": app_id,
            "total": 0,
            "processed": 0,
            "active": False,
            "updated_at": None,
        }

    total = int(progress.get("total", 0))
    processed = int(progress.get("processed", 0))
    timestamp = progress.get("updated_at")
    updated_at = (
        datetime.utcfromtimestamp(timestamp).isoformat() + "Z"
        if timestamp
        else None
    )

    return {
        "app_id": app_id,
        "total": total,
        "processed": processed,
        "active": processed < total,
        "updated_at": updated_at,
    }


import asyncio


def _optional_user_id(request: Request) -> str:
    """Get user ID or 'anonymous' for SSE endpoints."""
    try:
        return _resolve_user_id(request)
    except HTTPException:
        return "anonymous"


@app.get("/progress/{app_id}/stream", dependencies=[Depends(require_license)])
async def progress_stream(
    app_id: int,
    user_id: str = Depends(_optional_user_id),
):
    """Server-Sent Events endpoint for real-time progress updates.

    Streams progress updates every 500ms until analysis completes or client disconnects.
    Event types:
        - progress: {"processed": int, "total": int, "active": bool}
        - completed: {"status": "completed"}
        - error: {"status": "failed", "error": str}
    """
    async def event_generator():
        last_processed = -1
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

                    # No progress and no result - send empty state
                    yield f"event: progress\ndata: {json.dumps({'processed': 0, 'total': 0, 'active': False})}\n\n"
                    idle_count += 1
                else:
                    total = int(progress.get("total", 0))
                    processed = int(progress.get("processed", 0))
                    active = processed < total

                    yield f"event: progress\ndata: {json.dumps({'processed': processed, 'total': total, 'active': active})}\n\n"

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
