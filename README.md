# SentiNext

SentiNext turns raw Steam reviews into clear, actionable insights. It ingests Steam reviews, classifies them into a consistent taxonomy, and surfaces top issues and feature requests.

## Structure
- `backend/` – FastAPI app (`backend/main.py`) and shared package (`senti_next/`)
- `frontend/` – Next.js app (server for web, static export for desktop)
- `data/` – SQLite database (created at runtime)
- `web/` – Marketing site (landing, docs, download)
- `src-tauri/` – Tauri desktop wrapper (builds macOS/Windows apps)

## Local app (recommended)
Build the UI once, then run a single local server that serves both UI and API.

## Python environment (Conda)
This repo uses a Conda environment named `SentiNext` (no `venv`).

```bash
conda env create -f environment.yml
conda activate SentiNext
```

### Build UI
```bash
cd frontend
npm install
SENTINEXT_STATIC_EXPORT=true npm run build
```

### Run local app server
```bash
conda activate SentiNext
uvicorn backend.local_app:app --reload --port 8000
```

Open `http://localhost:8000`.

## Downloadable desktop app (build it)
This project can be packaged into a desktop app that opens a window (no browser/localhost) and runs the local server in the background.

Prereqs: Node.js + Conda (Python 3.11+).

### macOS / Linux
```bash
./desktop/build.sh
```

### Windows (PowerShell)
```powershell
.\desktop\build.ps1
```

Output:
- `dist/SentiNext/` (foldered build)

## Dev mode (optional)
Run backend and frontend separately.

### Run backend
```bash
conda activate SentiNext
uvicorn backend.main:app --reload --port 8000
```

### Run frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # set NEXT_PUBLIC_API_BASE_URL if different
npm run dev  # http://localhost:3000
```

## Deploy (web)
Deploy the API and UI as separate services:
- Frontend: use `Dockerfile.frontend` (Next.js server). Set `NEXT_PUBLIC_API_BASE_URL` to the backend URL and add Clerk keys.
- Backend: use `Dockerfile.backend` (FastAPI API-only). Attach a persistent disk and set `SENTINEXT_DB_PATH` to its mount path.

## Authentication (Clerk)
Frontend (Next.js App Router, stored in `.env.local`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY=YOUR_SECRET_KEY`

Backend (FastAPI):
- `SENTINEXT_AUTH_ENABLED=1`
- `SENTINEXT_CLERK_JWKS_URL` (from Clerk dashboard)
- `SENTINEXT_AUTH_ISSUER` (Clerk issuer)
- `SENTINEXT_AUTH_AUDIENCE` (Clerk client id, optional)

## Notes
- The API persists reviews/labels to `data/senti_next.db`. Set `SENTINEXT_DB_PATH` to override.
- LLM settings via env: `SENTINEXT_OLLAMA_MODEL` (default `gpt-oss:20b-cloud`), `SENTINEXT_CLUSTER_LABELS`, `SENTINEXT_CLUSTER_SIMILARITY`.
- Destructive admin actions (delete game data / clear DB) are disabled by default. To enable them set `SENTINEXT_ENABLE_DESTRUCTIVE=1` and `SENTINEXT_ADMIN_TOKEN` on the backend, then unlock via the **Admin** box in the UI sidebar.
