# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SentiNext ingests Steam game reviews, classifies them using LLM (Google Gemini) into a structured taxonomy, and surfaces actionable insights like top issues and feature requests.

## Build & Run Commands

### Environment Setup
```bash
conda env create -f environment.yml
conda activate SentiNext
```

### Local Development
See `LOCAL_DEVELOPMENT.md` for full setup. Quick start:
```bash
./run_backend_local.sh
./run_frontend_local.sh
```

### Frontend Lint
```bash
cd frontend && npm run lint
```

## Architecture

### Deployment Modes
1. **Web Deployment**: Separate frontend (Next.js server) and backend (FastAPI) services

### Backend Structure (`backend/`)
- `main.py` - FastAPI REST API (~25 endpoints)
- `senti_next/` - Core package:
  - `llm.py` - Google Gemini integration, review classification with batching (3 reviews/batch), taxonomy parsing
  - `storage.py` - PostgreSQL persistence (reviews, labels, starred games, analysis results)
  - `steam_api.py` - Steam API wrapper for fetching reviews and game details
  - `insights.py` - Aggregates classification results into dashboard metrics
  - `chat.py` - Chat interface using review context

### Frontend Structure (`frontend/`)
- Next.js 14 App Router with TypeScript
- `src/app/` - Pages: dashboard, reviews, chat, compare, database, settings
- `src/lib/api.ts` - API client with auth token injection
- `src/components/` - React components (charts, review explorer, filters)

### Data Flow
1. User searches game via Steam API
2. `/analyze` endpoint fetches reviews, triggers background LLM classification
3. Labels cached in PostgreSQL with prompt version tracking
4. `/analysis/{app_id}` returns insights when ready
5. Frontend polls `/progress/{app_id}` for classification status

### Authentication
- Clerk integration for web deployment (`SENTINEXT_AUTH_ENABLED=1`)
- JWT validation via `SENTINEXT_CLERK_JWKS_URL`
- Local mode uses `user_id="local"` (no auth)
- Admin actions require `SENTINEXT_ADMIN_TOKEN` or inclusion in `SENTINEXT_ADMIN_USER_IDS`

## Key Environment Variables

**Backend:**
- `GEMINI_API_KEY` - Required for LLM classification
- `SENTINEXT_GEMINI_MODEL` - Optional, defaults to gemini-flash-lite-latest
- `DATABASE_URL` - PostgreSQL connection string
- `SENTINEXT_AUTH_ENABLED` - Enable Clerk auth
- `SENTINEXT_ENABLE_DESTRUCTIVE` - Allow delete endpoints

**Frontend:**
- `NEXT_PUBLIC_API_BASE_URL` - Backend URL (dev defaults to `http://localhost:8000`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key

## LLM Classification Taxonomy

Reviews are classified into categories like:
- `technical/` - performance, bugs, stability_crashes, compatibility, networking, installation, save_data
- `gameplay/` - mechanics, controls, difficulty, balance
- `content_design/` - level_design, narrative, replayability
- `ui_ux_accessibility/` - menus, quality_of_life
- `monetization_value/` - pricing, regional_pricing, dlc, microtransactions, battle_pass_fomo

Labels include `subcategories`, `issue_subcategories`, `request_subcategories`, and `evidence` (verbatim quotes).

## Database

PostgreSQL with tables: `reviews`, `review_labels`, `starred_games`, `analysis_results`, `progress`, `job_registry`. Full-text search uses `search_vector`.
