"""Desktop-specific entry point for the SentiNext backend.

Runs as a PyInstaller-frozen sidecar binary launched by Tauri.
Sets up SQLite database in the platform data directory and starts uvicorn.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _setup_env(port: int) -> None:
    """Configure environment variables for desktop mode."""
    # Use platformdirs for the data directory
    try:
        from platformdirs import user_data_dir
        data_dir = Path(user_data_dir("SentiNext", "SentiNext"))
    except ImportError:
        data_dir = Path.home() / ".sentinext" / "data"

    data_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "sentinext.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

    # Allow all origins for local Tauri webview
    os.environ["SENTINEXT_ALLOWED_ORIGINS"] = f"http://127.0.0.1:{port},http://localhost:{port},tauri://localhost,https://tauri.localhost"

    # Use the same data dir for LLM config and API keys
    os.environ.setdefault("SENTINEXT_DATA_DIR", str(data_dir))

    # Set log file location
    log_dir = data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    os.environ["SENTINEXT_LOG_FILE"] = str(log_dir / "backend.log")


def main() -> None:
    parser = argparse.ArgumentParser(description="SentiNext Desktop Backend")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    args = parser.parse_args()

    _setup_env(args.port)

    # Import after env is set so db.get_database_url() sees SQLite URL
    import uvicorn

    # Add the api directory to sys.path so 'apps.api' package resolves
    api_dir = Path(__file__).resolve().parent.parent.parent / "api"
    if api_dir.exists() and str(api_dir.parent) not in sys.path:
        sys.path.insert(0, str(api_dir.parent.parent))

    uvicorn.run(
        "apps.api.main:app",
        host="127.0.0.1",
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
