# SentiNext

SentiNext is an open-source, self-hosted tool that turns raw Steam reviews into clear, actionable insights. It ingests Steam reviews, classifies them using LLMs into a structured taxonomy, and surfaces top issues and feature requests.

## Structure
- `apps/api/` – FastAPI app (`apps/api/main.py`) and core package (`senti_next/`)
- `apps/dashboard/` – Next.js web application
- `apps/marketing/` – Marketing site
- `tooling/` – Internal scripts and benchmark suite
- `infra/` – Deployment/build infrastructure files
- `data/` – Local runtime data (logs, caches)

## Quick Start (Docker)

```bash
cp .env.example .env.local
# Edit .env.local and set at least one LLM API key (GEMINI_API_KEY, XAI_API_KEY, OPENAI_API_KEY, or configure Ollama)

docker compose up --build
```

Open `http://localhost:3000` in your browser.

## Manual Setup

See `LOCAL_DEVELOPMENT.md` for step-by-step setup.

```bash
./run_backend_local.sh
./run_frontend_local.sh
```

## LLM Providers

SentiNext supports multiple LLM providers. Set at least one API key:

| Provider | Env Variable | Suggested Models |
|----------|-------------|------------------|
| Google Gemini | `GEMINI_API_KEY` | gemini-2.0-flash-lite, gemini-2.0-flash |
| xAI Grok | `XAI_API_KEY` | grok-3-fast, grok-3 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini, gpt-4o |
| Ollama (local) | No key needed | llama3.1:8b, qwen2.5:7b, gemma2:9b |

Provider and model can be changed at runtime via the Settings page or `PUT /settings/llm`.

## Notes
- The API persists reviews/labels to PostgreSQL via `DATABASE_URL`.
- All endpoints are open — self-hosted means you own everything.
- LLM classification uses a two-tier approach (fast model → reasoning fallback) for xAI, or single-call for other providers.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
