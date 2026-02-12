from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Load environment variables from .env.local (for local development)
from dotenv import load_dotenv
_env_path = Path(__file__).resolve().parents[2] / ".env.local"
if _env_path.exists():
    load_dotenv(_env_path)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .senti_next import logging_config
from .senti_next import db as db_module
from .senti_next.routes import all_routers

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Startup environment validation
# ---------------------------------------------------------------------------
def _validate_startup_env() -> None:
    """Warn if no LLM provider is configured yet (API keys can be added in Settings)."""
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_xai = bool(os.getenv("XAI_API_KEY"))
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_ollama = bool(os.getenv("SENTINEXT_OLLAMA_BASE_URL")) or os.path.exists("/usr/local/bin/ollama") or os.path.exists("/usr/bin/ollama")
    if not has_gemini and not has_xai and not has_openai and not has_ollama:
        logger.warning(
            "No LLM provider configured yet. Add an API key in Settings "
            "or set GEMINI_API_KEY, XAI_API_KEY, OPENAI_API_KEY, or configure Ollama."
        )

_validate_startup_env()

APP_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Tauri desktop origins — always allowed regardless of SENTINEXT_ALLOWED_ORIGINS
# since they are local-only and required for the desktop app to function.
_TAURI_ORIGINS = [
    "tauri://localhost",
    "https://tauri.localhost",
]

def _parse_allowed_origins() -> list[str]:
    raw = os.getenv("SENTINEXT_ALLOWED_ORIGINS")
    if not raw:
        return APP_ORIGINS + _TAURI_ORIGINS
    user_origins = [item.strip() for item in raw.split(",") if item.strip()]
    base = user_origins if user_origins else APP_ORIGINS
    # Merge Tauri origins (deduplicated) so desktop always works
    return list(dict.fromkeys(base + _TAURI_ORIGINS))

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
    # Startup — run DB init in a background thread so the server can
    # bind the port immediately and respond to /health while still loading.
    import threading

    def _background_init():
        try:
            db_module.init_db()
            logging_config.configure_logging()
        except Exception:
            logger.exception("Background startup init failed")
        finally:
            db_module.startup_complete.set()

    init_thread = threading.Thread(target=_background_init, daemon=True)
    init_thread.start()
    logger.info("SentiNext API starting up (DB init in background)")
    yield
    # Shutdown — wait briefly for the init thread, then clean up.
    init_thread.join(timeout=10)
    logger.info("SentiNext API shutting down")
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
    allow_headers=["content-type"],
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
# Startup gate — return 503 for non-health endpoints while DB init runs
# ---------------------------------------------------------------------------

_STARTUP_EXEMPT = {"/health", "/docs", "/openapi.json"}


@app.middleware("http")
async def startup_gate_middleware(request: Request, call_next):
    if not db_module.startup_complete.is_set() and request.url.path not in _STARTUP_EXEMPT:
        return JSONResponse(
            status_code=503,
            content={"detail": "Server is starting up, please wait..."},
        )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Include all routers
# ---------------------------------------------------------------------------

for router in all_routers:
    app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
