# Local Development Setup

## Quick Start with Docker Compose

The fastest way to get SentiNext running locally:

```bash
# 1. Copy and configure your API key
cp .env.example .env.local
# Edit .env.local and set at least one LLM API key

# 2. Start everything
docker compose up --build
```

This starts the backend (port 8000) and the frontend (port 3000).
Open `http://localhost:3000` in your browser.

---

## Manual Setup (without Docker)

### 1. Configure Backend Environment

Edit `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_key_here
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
```

### 2. Configure Frontend Environment

Edit `apps/dashboard/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. Run Backend

```bash
./run_backend_local.sh
```

Backend will run on `http://localhost:8000`

### 4. Run Frontend (in a new terminal)

```bash
./run_frontend_local.sh
```

Frontend will run on `http://localhost:3000`

---

## Using Ollama (Local LLM)

To use local models via Ollama instead of cloud APIs:

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.1:8b`
3. Set in `.env.local`:
   ```bash
   SENTINEXT_OLLAMA_BASE_URL=http://localhost:11434/v1
   SENTINEXT_OLLAMA_MODEL=llama3.1:8b
   ```

Or configure via the Settings page in the frontend.

---

## Testing Workflow

1. Make changes to code
2. Backend auto-reloads (uvicorn --reload)
3. Frontend auto-reloads (Next.js dev server)
4. Test in browser at `http://localhost:3000`

---

## Troubleshooting

**Backend won't start:**
- Make sure .env.local exists and variables are set

**Frontend can't connect:**
- Make sure backend is running on port 8000
- Check `apps/dashboard/.env.local` has `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- Check browser console for CORS errors

**Database errors:**
- Run diagnostic: `python apps/api/tools/diagnostics/backend_diagnostic.py`
