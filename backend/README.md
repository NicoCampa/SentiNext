# SentiNext Backend

PostgreSQL-only backend for Steam review analysis.

## Requirements

- Python 3.10+
- PostgreSQL database (required)
- Google Gemini API key or xAI API key

## Environment Variables

Required:
```bash
DATABASE_URL=postgresql://user:password@host:port/database
GEMINI_API_KEY=your_key_here
```

Optional:
```bash
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
SENTINEXT_AUTH_ENABLED=false
SENTINEXT_ENABLE_DESTRUCTIVE=true
SENTINEXT_ADMIN_USER_IDS=local
```

## Local Development

See `../LOCAL_DEVELOPMENT.md` for setup instructions.

## Database

The app uses PostgreSQL exclusively. Schema is initialized automatically on first run.

Run migrations if needed:
```bash
cd backend && alembic upgrade head
```

## Deployment

Use `docker compose up --build` from the project root. See `../LOCAL_DEVELOPMENT.md` for details.
