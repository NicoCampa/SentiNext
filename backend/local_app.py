from __future__ import annotations

from pathlib import Path
import sys

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse

from backend.main import app as api_app


def _resolve_ui_dir() -> Path:
    # Repo layout: <root>/backend/local_app.py -> <root>/frontend/out
    # PyInstaller layout: sys._MEIPASS is the bundle extraction root.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / "frontend" / "out"


UI_DIR = _resolve_ui_dir()

app = FastAPI(title="SENTINEXT (Local)")
app.mount("/api", api_app)


if UI_DIR.is_dir():
    def _safe_join(root: Path, relative: str) -> Path:
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError as exc:
            raise ValueError("Invalid path") from exc
        return candidate

    @app.get("/{path:path}", include_in_schema=False)
    def ui_files(path: str) -> FileResponse:
        requested = (path or "").strip("/")
        if requested == "":
            target = _safe_join(UI_DIR, "index.html")
            return FileResponse(target)

        # Serve exact file/directory if present.
        direct = _safe_join(UI_DIR, requested)
        if direct.is_dir():
            index = direct / "index.html"
            if index.exists():
                return FileResponse(index)
        if direct.exists() and direct.is_file():
            return FileResponse(direct)

        # Next static export (default) uses flat <route>.html files.
        if "." not in requested:
            html_candidate = _safe_join(UI_DIR, f"{requested}.html")
            if html_candidate.exists():
                return FileResponse(html_candidate)

        not_found = _safe_join(UI_DIR, "404.html")
        if not_found.exists():
            return FileResponse(not_found, status_code=404)
        return FileResponse(_safe_join(UI_DIR, "index.html"), status_code=404)
else:
    @app.get("/", include_in_schema=False)
    def missing_ui() -> HTMLResponse:
        return HTMLResponse(
            f"""
            <html>
              <head><title>SENTINEXT (Local)</title></head>
              <body style="font-family: Arial, sans-serif; padding: 24px;">
                <h1>SENTINEXT UI not built</h1>
                <p>Expected static UI at: <code>{UI_DIR}</code></p>
                <p>Build it with:</p>
                <pre><code>cd frontend
npm install
npm run build</code></pre>
                <p>Then restart the backend.</p>
              </body>
            </html>
            """.strip()
        )
