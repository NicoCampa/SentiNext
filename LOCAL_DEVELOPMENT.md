# Local Development Setup

Test changes locally without waiting for Render deploys.

## Quick Start

### 1. Configure Backend Environment

Edit `.env.local` in the project root and add your Render PostgreSQL URL:

```bash
# Get the External Database URL from Render dashboard
DATABASE_URL=postgres://sentinext_db_user:xxxxx@dpg-xxxxx.oregon-postgres.render.com/sentinext_db
GEMINI_API_KEY=your_key_here
SENTINEXT_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
SENTINEXT_AUTH_ENABLED=false
```

**Where to find External Database URL:**
- Render Dashboard → Your PostgreSQL service → "External Database URL"
- Use the **External** URL (public), not the Internal URL

### 2. Configure Frontend Environment

Edit `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx  # Optional for local testing
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

## Testing Workflow

1. Make changes to code
2. Backend auto-reloads (uvicorn --reload)
3. Frontend auto-reloads (Next.js dev server)
4. Test in browser at `http://localhost:3000`
5. When ready, commit and push to deploy to Render

---

## Alternative: Local PostgreSQL with Docker

If you prefer a fully local setup:

```bash
# Start local PostgreSQL
docker run -d \
  --name sentinext-postgres \
  -e POSTGRES_DB=sentinext \
  -e POSTGRES_USER=sentinext \
  -e POSTGRES_PASSWORD=localdev \
  -p 5432:5432 \
  postgres:15

# Update .env.local
DATABASE_URL=postgresql://sentinext:localdev@localhost:5432/sentinext

# Initialize database (run once)
python -c "from backend.senti_next import storage; storage.init_db()"
```

---

## Troubleshooting

**Backend won't start:**
- Check DATABASE_URL is correct (External URL, not Internal)
- Make sure .env.local exists and variables are set
- Check PostgreSQL is reachable: `python backend/tools/diagnostics/db_check.py`

**Frontend can't connect:**
- Make sure backend is running on port 8000
- Check `frontend/.env.local` has `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- Check browser console for CORS errors

**Database errors:**
- Run diagnostic: `python backend/tools/diagnostics/backend_diagnostic.py`
- Check PostgreSQL connection: `python backend/tools/diagnostics/db_check.py`
