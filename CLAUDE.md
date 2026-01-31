# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SentiNext ingests Steam game reviews, classifies them using LLM (OpenAI gpt-5-mini) into a structured taxonomy, and surfaces actionable insights like top issues and feature requests.

## Build & Run Commands

### Environment Setup
```bash
conda env create -f environment.yml
conda activate SentiNext
```

### Local Development (Recommended)
Build UI once, then run single server:
```bash
cd frontend && npm install && SENTINEXT_STATIC_EXPORT=true npm run build
uvicorn backend.local_app:app --reload --port 8000
# Open http://localhost:8000
```

### Dev Mode (Separate Services)
```bash
# Backend
uvicorn backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm run dev  # http://localhost:3000
```

### Desktop App Build
```bash
./desktop/build.sh        # macOS/Linux
.\desktop\build.ps1       # Windows
```

### Frontend Lint
```bash
cd frontend && npm run lint
```

## Architecture

### Deployment Modes
1. **Local App** (`backend/local_app.py`): Single FastAPI server mounts API at `/api` and serves static UI from `frontend/out/`
2. **Web Deployment**: Separate frontend (Next.js server) and backend (FastAPI) services
3. **Desktop**: Tauri wraps PyInstaller-bundled backend + static frontend

### Backend Structure (`backend/`)
- `main.py` - FastAPI REST API (~25 endpoints)
- `local_app.py` - Combined API + static UI server for desktop/local use
- `senti_next/` - Core package:
  - `llm.py` - OpenAI integration, review classification with batching (10 reviews/batch), taxonomy parsing
  - `storage.py` - SQLite persistence (reviews, labels, starred games, analysis results)
  - `steam_api.py` - Steam API wrapper for fetching reviews and game details
  - `insights.py` - Aggregates classification results into dashboard metrics
  - `chat.py` - Chat interface using review context

### Frontend Structure (`frontend/`)
- Next.js 14 App Router with TypeScript
- `src/app/` - Pages: dashboard, reviews, chat, compare, database, settings
- `src/lib/api.ts` - API client with auth token injection
- `src/components/` - React components (charts, review explorer, filters)
- Static export mode via `SENTINEXT_STATIC_EXPORT=true` for desktop builds

### Data Flow
1. User searches game via Steam API
2. `/analyze` endpoint fetches reviews, triggers background LLM classification
3. Labels cached in SQLite with prompt version tracking
4. `/analysis/{app_id}` returns insights when ready
5. Frontend polls `/progress/{app_id}` for classification status

### Authentication
- Clerk integration for web deployment (`SENTINEXT_AUTH_ENABLED=1`)
- JWT validation via `SENTINEXT_CLERK_JWKS_URL`
- Local mode uses `user_id="local"` (no auth)
- Admin actions require `SENTINEXT_ADMIN_TOKEN` or inclusion in `SENTINEXT_ADMIN_USER_IDS`

## Key Environment Variables

**Backend:**
- `OPENAI_API_KEY` - Required for LLM classification
- `SENTINEXT_DB_PATH` - SQLite location (default: platform-specific user data dir)
- `SENTINEXT_AUTH_ENABLED` - Enable Clerk auth
- `SENTINEXT_ENABLE_DESTRUCTIVE` - Allow delete endpoints

**Frontend:**
- `NEXT_PUBLIC_API_BASE_URL` - Backend URL (default `/api` for local app)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key

## LLM Classification Taxonomy

Reviews are classified into categories like:
- `technical/` - performance, bugs, crashes, networking
- `gameplay/` - mechanics, controls, difficulty, balance
- `content_design/` - level_design, narrative, replayability
- `ui_ux_accessibility/` - menus, quality_of_life
- `monetization_value/` - price, dlc, microtransactions

Labels include `subcategories`, `issue_subcategories`, `request_subcategories`, and `evidence` (verbatim quotes).

## Database

SQLite with tables: `reviews`, `review_labels`, `starred_games`, `analysis_results`, `classification_progress`. FTS5 used for chat retrieval.
