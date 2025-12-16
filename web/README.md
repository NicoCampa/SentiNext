# SentiNext Web (Vercel)

This is a small Next.js website that sells a €10 PDF report and triggers the SentiNext backend to generate + email it.

## How it works
- User enters Steam `app_id` + email and is redirected to Stripe Checkout.
- Stripe webhook (`/api/stripe/webhook`) calls the backend `POST /report/pdf`.
- Backend generates the report (hard-capped to 100 reviews for now) and emails the PDF attachment.

## Required env vars (Vercel Project → Settings → Environment Variables)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SENTINEXT_API_BASE_URL` (your deployed FastAPI base URL, e.g. `https://api.yourdomain.com`)
- `APP_URL` (optional; if omitted, uses `VERCEL_URL` at runtime)
- `SENTINEXT_SERVICE_TOKEN` (recommended; must match backend `SENTINEXT_SERVICE_TOKEN`)

## Stripe webhook
- Add a webhook endpoint in Stripe pointing to:
  - `https://<your-vercel-domain>/api/stripe/webhook`
- Subscribe to event:
  - `checkout.session.completed`

## Local dev
```bash
cd web
npm install
npm run dev
```

You also need the backend running somewhere reachable by the webhook (or use a tunnel).
