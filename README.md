# SentiNext

**Open-source Steam review intelligence for game teams.**

SentiNext turns large volumes of Steam reviews into a clear, prioritized view of what players want you to fix next. It is self-hosted, evidence-driven, and built for teams that need decisions they can defend.

## Why SentiNext

- Turn noisy review data into a roadmap signal.
- See the top issues and feature requests without reading thousands of reviews manually.
- Keep every insight traceable with verbatim evidence quotes.
- Self-host everything so your data stays in your environment.

## Core Features

1. **Review ingestion from Steam:** Pull public reviews by game name or App ID and store them for repeatable analysis.
2. **AI classification with a structured taxonomy:** Label each review into consistent categories and separate issues from requests.
3. **Evidence-first insights:** Every label is backed by short verbatim quotes so findings stay auditable.
4. **Dashboard for product decisions:** Track category breakdowns, trend shifts, issue/request rates, and recommendation context.
5. **Built-in analysis workflows:** Explore reviews, compare games, generate reports, export data, and query results with AI chat.

## How It Works

1. Ingest recent Steam reviews for a game.
2. Classify each review with your configured LLM provider.
3. Aggregate patterns into actionable insights.
4. Explore, validate, and share outcomes from the dashboard.

## Quick Start (Docker)

```bash
cp .env.example .env.local
# Edit .env.local and set at least one LLM API key
# (GEMINI_API_KEY, XAI_API_KEY, OPENAI_API_KEY, or configure Ollama)

docker compose up --build
```

Open `http://localhost:3000`.

## Local Development

For full local setup, see `LOCAL_DEVELOPMENT.md`.

```bash
./run_backend_local.sh
./run_frontend_local.sh
```

## LLM Providers

Set at least one provider:

| Provider | Env Variable | Suggested Models |
|----------|--------------|------------------|
| Google Gemini | `GEMINI_API_KEY` | `gemini-flash-lite-latest`, `gemini-flash-latest` |
| xAI Grok | `XAI_API_KEY` | `grok-4-1-fast-non-reasoning`, `grok-4-1-fast-reasoning` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5-mini`, `gpt-5-nano` |
| Ollama (local) | No key needed | `llama3.1:8b`, `qwen2.5:7b`, `gemma2:9b` |

Provider/model can be changed in Settings or via `PUT /settings/llm`.

## Architecture At A Glance

- `apps/api/`: FastAPI backend and core analysis logic
- `apps/dashboard/`: Next.js product dashboard
- `apps/marketing/`: Marketing website
- `tooling/`: Benchmarks and internal scripts
- `infra/`: Deployment/build infrastructure

## Technical Notes

- Review classification strategy:
SentiNext uses the currently active provider/model and performs one structured classification call per review.

## License

Apache License 2.0. See `LICENSE`.
