# SentiNext

SentiNext turns raw Steam reviews into clear, actionable insights. It ingests Steam reviews, classifies them into a consistent taxonomy, and surfaces top issues and feature requests.

## Structure
- `backend/` – FastAPI app (`backend/main.py`) and shared package (`senti_next/`)
- `frontend/` – Next.js web application
- `data/` – Local runtime data (logs, caches)
- `docs/` – Engineering documentation

## Quick Start (Docker)

```bash
cp .env.example .env.local
# Edit .env.local and set your GEMINI_API_KEY (or XAI_API_KEY)

docker compose up --build
```

Open `http://localhost:3000` in your browser.

## Manual Setup

See `LOCAL_DEVELOPMENT.md` for step-by-step setup.

```bash
./run_backend_local.sh
./run_frontend_local.sh
```

## Authentication (Optional)

SentiNext supports optional Clerk authentication. When disabled (default for local dev), all requests use `user_id="local"`.

To enable Clerk auth, set these env vars:

Frontend (`.env.local`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY=YOUR_SECRET_KEY`

Backend:
- `SENTINEXT_AUTH_ENABLED=1`
- `SENTINEXT_CLERK_JWKS_URL` (from Clerk dashboard)

## Notes
- The API persists reviews/labels to PostgreSQL via `DATABASE_URL`.
- LLM classification uses xAI Grok (two-tier) or Google Gemini depending on configuration.
- Destructive admin actions are disabled by default. Set `SENTINEXT_ENABLE_DESTRUCTIVE=1` to enable.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
