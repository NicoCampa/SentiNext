# SentiNext (minimal)

SentiNext turns raw Steam reviews into clear, actionable insights. It ingests recent reviews, clusters themes, highlights top issues and feature requests, and can email a polished PDF report to buyers via Stripe checkout.

## Structure
- `backend/` – FastAPI app (`backend/main.py`) and shared package (`senti_next/`)
- `frontend/` – Next.js app (static export UI)
- `data/` – SQLite database (created at runtime)

## Local app (recommended)
Build the UI once, then run a single local server that serves both UI and API.

### Build UI
```bash
cd frontend
npm install
npm run build
```

### Run local app server
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.local_app:app --reload --port 8000
```

Open `http://localhost:8000`.

## Downloadable desktop app (build it)
This project can be packaged into a desktop app that opens a window (no browser/localhost) and runs the local server in the background.

Prereqs: Node.js + Python 3.11+.

### macOS / Linux
```bash
./desktop/build.sh
```

### Windows (PowerShell)
```powershell
.\desktop\build.ps1
```

Output:
- `dist/SentiNext/` (foldered build)

## Dev mode (optional)
Run backend and frontend separately.

### Run backend
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Run frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # set NEXT_PUBLIC_API_BASE_URL if different
npm run dev  # http://localhost:3000
```

## Notes
- The API persists reviews/labels to `data/senti_next.db`. Set `SENTINEXT_DB_PATH` to override.
- LLM settings via env: `SENTINEXT_OLLAMA_MODEL`, `SENTINEXT_CLUSTER_LABELS`, `SENTINEXT_CLUSTER_SIMILARITY`.
- Destructive admin actions (delete game data / clear DB) are disabled by default. To enable them set `SENTINEXT_ENABLE_DESTRUCTIVE=1` and `SENTINEXT_ADMIN_TOKEN` on the backend, then unlock via the **Admin** box in the UI sidebar.

## PDF email reports (testing)
- Endpoint: `POST /report/pdf` (hard-caps `review_count` to 100 for now).
- Poll status: `GET /report/pdf/status/{job_id}`.
- Generated PDFs are saved under `SENTINEXT_REPORTS_DIR` (or next to the DB under `reports/`) and emailed as an attachment.
- For production, set `SENTINEXT_SERVICE_TOKEN` and send it as `x-service-token` from your website/webhook.
- For local testing without email/LLM:
  - Set `SENTINEXT_DISABLE_EMAIL=1` to skip SMTP sending (PDF still gets written to disk).
  - Set `SENTINEXT_DISABLE_LLM=1` to skip Ollama calls (labels fall back to defaults).
  - If your network can’t reach Steam, set `SENTINEXT_PDF_USE_CACHE=1` to generate PDFs from cached DB reviews (run an analysis first to populate the cache).

### SMTP env vars
- `SENTINEXT_SMTP_HOST` (required)
- `SENTINEXT_SMTP_PORT` (default `587`)
- `SENTINEXT_SMTP_USER` / `SENTINEXT_SMTP_PASS` (optional, if your SMTP requires auth)
- `SENTINEXT_SMTP_FROM` (required)
- `SENTINEXT_SMTP_TLS` (default `true`)
