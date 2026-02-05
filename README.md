# SentiNext

SentiNext turns raw Steam reviews into clear, actionable insights. It ingests Steam reviews, classifies them into a consistent taxonomy, and surfaces top issues and feature requests.

## Structure
- `backend/` – FastAPI app (`backend/main.py`) and shared package (`senti_next/`)
- `frontend/` – Next.js SaaS app (Render Node runtime)
- `data/` – Local runtime data (logs, caches; contents vary by deployment)
- `web/` – Marketing site (landing, docs, download)
- `scripts/` – Developer utilities and diagnostics
- `docs/` – Product + engineering documentation

## Python environment (Conda)
This repo uses a Conda environment named `SentiNext` (no `venv`).

```bash
conda env create -f environment.yml
conda activate SentiNext
```

## Local development
See `LOCAL_DEVELOPMENT.md` for step-by-step setup. Quick start:

```bash
./run_backend_local.sh
./run_frontend_local.sh
```

## Cleanup (optional)
Remove local build artifacts:

```bash
./scripts/clean_local.sh
```

## Deploy (web)
Deploy the API and UI as separate services:
- Marketing site: Vercel with `Root Directory=web`. Set `NEXT_PUBLIC_APP_URL` to the SaaS URL.
- Frontend: Render **Node** runtime with `Root Directory=frontend`, `Build Command=npm install && npm run build`, `Start Command=npm run start`. Set `NEXT_PUBLIC_API_BASE_URL` to the backend URL and add Clerk keys.
- Backend: Render Docker with `Dockerfile.backend`. Set `DATABASE_URL` to your PostgreSQL database (Render internal URL recommended).

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
- The API persists reviews/labels to PostgreSQL via `DATABASE_URL`.
- LLM settings via env: `SENTINEXT_OLLAMA_MODEL` (default `gpt-oss:20b-cloud`), `SENTINEXT_CLUSTER_LABELS`, `SENTINEXT_CLUSTER_SIMILARITY`.
- Destructive admin actions (delete game data / clear DB) are disabled by default. To enable them set `SENTINEXT_ENABLE_DESTRUCTIVE=1` and `SENTINEXT_ADMIN_TOKEN` on the backend, then unlock via the **Admin** box in the UI sidebar.
