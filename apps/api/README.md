# SentiNext Backend

PostgreSQL-only backend for Steam review analysis.

## Requirements

- Python 3.10+
- PostgreSQL database (required)
- At least one LLM provider (Gemini, xAI, OpenAI, or Ollama)

## Environment Variables

Required:
```bash
DATABASE_URL=postgresql://user:password@host:port/database
# At least one of these:
GEMINI_API_KEY=your_key_here
# XAI_API_KEY=your_key_here
# OPENAI_API_KEY=your_key_here
# SENTINEXT_OLLAMA_BASE_URL=http://localhost:11434/v1
```

Optional:
```bash
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
SENTINEXT_ENABLE_DESTRUCTIVE=true
SENTINEXT_ADMIN_TOKEN=change-me-if-you-need-admin-locks
```

When `SENTINEXT_ADMIN_TOKEN` is set, include `x-admin-token: <token>` for `/admin/*` endpoints and destructive operations (database/game deletion).
When `SENTINEXT_ENABLE_DESTRUCTIVE=false`, destructive endpoints return `403`.

## Local Development

See `../../LOCAL_DEVELOPMENT.md` for setup instructions.

## Database

The app uses PostgreSQL exclusively. Schema is initialized automatically on first run.

Run migrations if needed:
```bash
cd apps/api && alembic upgrade head
```

## Deployment

Use `docker compose up --build` from the project root. See `../../LOCAL_DEVELOPMENT.md` for details.
