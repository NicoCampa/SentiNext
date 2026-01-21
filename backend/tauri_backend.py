"""Tauri sidecar entrypoint for the local API server."""
from __future__ import annotations

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SentiNext backend for Tauri.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.getenv("SENTINEXT_PORT", "0")))
    args = parser.parse_args()

    port = args.port if args.port else 8000
    config = uvicorn.Config(
        "backend.main:app",
        host=args.host,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    main()
