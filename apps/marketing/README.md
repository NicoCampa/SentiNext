# SentiNext Website

The official marketing and documentation site for SentiNext, built with Next.js 16 (App Router) and Tailwind CSS v4.

## Deploying on Vercel (Production)

This site is designed to be deployed on Vercel.

1. **Connect Repository**: Import the `SentiNext` repo.
2. **Root Directory**: Set the "Root Directory" to `apps/marketing`.
3. **Environment Variables**:
   - `NEXT_PUBLIC_APP_URL`: The URL of your SentiNext app (e.g., `http://localhost:3000` for local use or your self-hosted URL).

## Running Locally

```bash
cd apps/marketing
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `src/app`: App Router pages.
- `src/components/ui`: Reusable UI components (buttons, cards).
- `src/components/layout`: Global layout components (Header, Footer).
- `src/lib`: Utilities (clsx, tailwind-merge).

## Key Features

- **Performance**: Static generation where possible, optimized images, minimal client-side JS.
- **Styling**: Tailwind CSS v4 with design tokens for the "Deep Intelligence" theme.
- **Animation**: Framer Motion for scroll reveals and layout transitions.
- **Docs**: Markdown-based documentation pages in `src/app/docs`.
