# SentiNext Backend

SQLite-powered backend for Steam review analysis.

## Requirements

- Python 3.10+
- At least one LLM provider (Gemini, xAI, OpenAI, or Ollama)

## Environment Variables

Required:
```bash
# At least one of these:
GEMINI_API_KEY=your_key_here
# XAI_API_KEY=your_key_here
# OPENAI_API_KEY=your_key_here
# SENTINEXT_OLLAMA_BASE_URL=http://localhost:11434/v1
```

Optional:
```bash
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
# Override default SQLite path (defaults to platformdirs location):
# DATABASE_URL=sqlite:///path/to/sentinext.db
```

## Local Development

See `../../LOCAL_DEVELOPMENT.md` for setup instructions.

## Database

The app uses SQLite. Schema is initialized automatically on first run. No migrations needed.

## Deployment

Use `docker compose up --build` from the project root. See `../../LOCAL_DEVELOPMENT.md` for details.
