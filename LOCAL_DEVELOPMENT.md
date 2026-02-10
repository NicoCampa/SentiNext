# Local Development Setup

## Quick Start with Docker Compose

The fastest way to get SentiNext running locally:

```bash
# 1. Copy and configure your API key
cp .env.example .env.local
# Edit .env.local and set your GEMINI_API_KEY (or XAI_API_KEY)

# 2. Start everything
docker compose up --build
```

This starts PostgreSQL, the backend (port 8000), and the frontend (port 3000).
Open `http://localhost:3000` in your browser.

---

## Manual Setup (without Docker)

### 1. Configure Backend Environment

Edit `.env.local` in the project root:

```bash
DATABASE_URL=postgresql://sentinext:sentinext@localhost:5432/sentinext
GEMINI_API_KEY=your_key_here
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000
SENTINEXT_AUTH_ENABLED=false
```

### 2. Start PostgreSQL

```bash
docker run -d \
  --name sentinext-postgres \
  -e POSTGRES_DB=sentinext \
  -e POSTGRES_USER=sentinext \
  -e POSTGRES_PASSWORD=sentinext \
  -p 5432:5432 \
  postgres:16
```

### 3. Configure Frontend Environment

Edit `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 4. Run Backend

```bash
./run_backend_local.sh
```

Backend will run on `http://localhost:8000`

### 5. Run Frontend (in a new terminal)

```bash
./run_frontend_local.sh
```

Frontend will run on `http://localhost:3000`

---

## Testing Workflow

1. Make changes to code
2. Backend auto-reloads (uvicorn --reload)
3. Frontend auto-reloads (Next.js dev server)
4. Test in browser at `http://localhost:3000`

---

## Troubleshooting

**Backend won't start:**
- Check DATABASE_URL is correct
- Make sure .env.local exists and variables are set
- Check PostgreSQL is reachable: `python backend/tools/diagnostics/db_check.py`

**Frontend can't connect:**
- Make sure backend is running on port 8000
- Check `frontend/.env.local` has `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- Check browser console for CORS errors

**Database errors:**
- Run diagnostic: `python backend/tools/diagnostics/backend_diagnostic.py`
- Check PostgreSQL connection: `python backend/tools/diagnostics/db_check.py`
