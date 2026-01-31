# SentiNext Backend

PostgreSQL-only backend for Steam review analysis.

## Requirements

- Python 3.10+
- PostgreSQL database (required)
- OpenAI API key

## Environment Variables

Required:
```bash
DATABASE_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=sk-xxx
```

Optional:
```bash
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
SENTINEXT_AUTH_ENABLED=false
SENTINEXT_LICENSE_ENFORCE=false
SENTINEXT_ENABLE_DESTRUCTIVE=true
SENTINEXT_ADMIN_USER_IDS=local
```

## Local Development

See `../LOCAL_DEVELOPMENT.md` for setup instructions.

## Database

The app uses PostgreSQL exclusively. No SQLite support.

Schema is initialized automatically on first run via `storage.init_db()`.

Run migrations if needed:
```bash
python backend/migrate_postgres_schema.py
```

## Production Deployment

Deploy on Render with:
- PostgreSQL database (managed)
- Environment variables configured
- Internal DATABASE_URL for optimal performance
