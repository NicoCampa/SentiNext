# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SentiNext is an open-source tool that ingests Steam game reviews, classifies them using LLMs into a structured taxonomy, and surfaces actionable insights like top issues and feature requests. It is designed for self-hosting.

## Build & Run Commands

### Quick Start (Docker Compose)
```bash
cp .env.example .env.local
# Edit .env.local with your API key
docker compose up --build
```

### Environment Setup (Manual)
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

### Frontend TypeScript Check
```bash
cd apps/dashboard && npx tsc --noEmit
```

## Architecture

### Deployment Modes
1. **Docker Compose**: One-command self-hosting with backend and frontend
2. **Manual**: Separate frontend (Next.js) and backend (FastAPI) services

### Backend Structure (`apps/api/`)
- `main.py` - Slim FastAPI app: creation, CORS, rate limiting, router includes
- `senti_next/routes/` - API route handlers split into modules:
  - `analysis.py` - /analyze, /progress, /analysis/* endpoints
  - `games.py` - /search, /game, /starred/* endpoints
  - `reviews.py` - /reviews, /labels, /database/* endpoints
  - `chat.py` - /chat, /chat/simple, /chat/* endpoints
  - `settings.py` - /config, /settings/*, /health, /admin/* endpoints
  - `misc.py` - /translate, /compare/*, /report/* endpoints
  - `_shared.py` - Shared models and helpers across routes
- `senti_next/providers/` - LLM provider abstraction:
  - `base.py` - Abstract LLMProvider interface
  - `gemini.py` - Google Gemini provider
  - `xai.py` - xAI Grok provider
  - `openai_compat.py` - OpenAI + Ollama (both use openai SDK)
  - `config.py` - Runtime provider/model configuration
- `senti_next/llm.py` - Classification logic, taxonomy, prompts (uses providers/)
- `senti_next/storage.py` - SQLite persistence
- `senti_next/steam_api.py` - Steam API wrapper
- `senti_next/insights.py` - Dashboard metrics aggregation
- `senti_next/chat.py` - Chat interface using review context

### Frontend Structure (`apps/dashboard/`)
- Next.js App Router with TypeScript
- `src/app/` - Pages: dashboard, reviews, chat, compare, database, settings
- `src/lib/api.ts` - API client
- `src/components/` - React components (charts, review explorer, filters)

### Data Flow
1. User searches game via Steam API
2. `/analyze` endpoint fetches reviews, triggers background LLM classification
3. Labels cached in SQLite with prompt version tracking
4. `/analysis/{app_id}` returns insights when ready
5. Frontend polls `/progress/{app_id}` for classification status

## Key Environment Variables

**Backend:**
- `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY` - LLM API keys (at least one required, or use Ollama)
- `SENTINEXT_OLLAMA_BASE_URL` - Ollama endpoint (default: http://localhost:11434/v1)
- `SENTINEXT_LLM_PROVIDER` / `SENTINEXT_LLM_MODEL` - Override active provider/model
**Frontend:**
- `NEXT_PUBLIC_API_BASE_URL` - Backend URL (dev defaults to `http://localhost:8000`)

## LLM Classification Taxonomy

Reviews are classified into categories like:
- `technical/` - performance, bugs, stability_crashes, compatibility, networking, installation, save_data
- `gameplay/` - mechanics, controls, difficulty, balance
- `content_design/` - level_design, narrative, replayability
- `ui_ux_accessibility/` - menus, quality_of_life
- `monetization_value/` - pricing, regional_pricing, dlc, microtransactions, battle_pass_fomo

Labels include `subcategories`, `issue_subcategories`, `request_subcategories`, and `evidence` (verbatim quotes).

## Database

SQLite with tables: `reviews`, `review_labels`, `starred_games`, `analysis_results`, `progress`. Full-text search uses FTS5.
