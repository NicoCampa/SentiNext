# SentiNext – Steam Sentiment MVP

SentiNext now ships as a FastAPI backend paired with a Next.js frontend. The backend fetches and analyses Steam reviews, while the React dashboard surfaces trends, cohorts, risk signals, and comparison tooling for starred games.

## Features

- Search the Steam catalogue and fetch up to 2,000 reviews via the public `appreviews` endpoint with control over order (newest vs helpful) and optional day-range filters.
- VADER-driven sentiment scoring plus helpfulness, recommendation, and playtime summaries.
- Time-series trends, confidence-band overlays, cohort donuts (release stage & purchase source), playtime-vs-sentiment scatterplots, helpfulness heatmaps, and reviewer/veteran benchmarking.
- Refund risk, core-fan disappointment, and churn indicators.
- Keyword spotlight for positive and negative topics.
- Star games to pin their datasets, revisit them from the sidebar workspace, and unlock a multi-title comparison dashboard.
- Persist reviews locally (SQLite) so subsequent analyses reuse the cached corpus while optional refresh pulls in the latest feedback. Full datasets are available via `/reviews/{app_id}` for bulk export.

## Architecture

- **Backend** – `FastAPI` app in `backend/main.py` that exposes `/search` and `/analyze` endpoints by composing the helpers in `senti_next`.
- **Frontend** – Next.js (TypeScript + Tailwind) application in `frontend/` consuming the API and managing the starred workspace client-side.

Streamlit is still available in `streamlit_app.py` for reference, but the primary experience now runs through Next.js.

## Getting started

Both services run locally; open two terminals inside the project root.

### 1. Backend (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The backend persists reviews to an on-disk SQLite database at `data/senti_next.db`. Disable persistence by sending `persist=false` on the `/analyze` request.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install        # downloads dependencies (requires network access)
cp .env.example .env.local  # optional: tweak API base URL
npm run dev        # launches on http://localhost:3000
```

The frontend expects the backend at `http://localhost:8000`. Adjust `NEXT_PUBLIC_API_BASE_URL` in `.env.local` if you change the port/host.

> **Note**: Dependencies were scaffolded offline. The first `npm install` will fetch packages from the registry on your machine.

## FastAPI endpoints

| Method | Endpoint     | Description                                 |
| ------ | ------------ | ------------------------------------------- |
| GET    | `/health`    | Basic health check                          |
| GET    | `/search`    | Query the Steam store for matching titles   |
| POST   | `/analyze`   | Fetch reviews and return sentiment insights |
| GET    | `/reviews/{app_id}` | Download cached reviews as CSV or JSON |

`/analyze` returns metadata, a JSON-serialised insight bundle, and a compact review table suitable for the frontend’s explorer.

## Notes & next steps

- Steam enforces cursor-based pagination (max 100 reviews per call); the backend keeps requesting pages until the requested count is reached or the API stops returning data.
- Topic modelling currently relies on frequent keyword extraction. Swap in LDA or embedding-based clustering once the MVP is validated.
- VADER works well for short, informal reviews. Consider fine-tuning or replacing it with a custom model for production accuracy.
- Respect Steam’s [API terms of use](https://partner.steamgames.com/doc/store/getreviews) and rate limits when deploying.
