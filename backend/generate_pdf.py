from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path


def _find_repo_root(start: Path) -> Path | None:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def _reports_dir() -> Path:
    raw = os.getenv("SENTINEXT_REPORTS_DIR")
    if raw:
        return Path(raw).expanduser()

    repo_root = _find_repo_root(Path.cwd()) or _find_repo_root(Path(__file__).resolve())
    if repo_root:
        return repo_root / "reports"

    from backend.senti_next import storage

    return storage.db_path().parent / "reports"


def _cached_game_name(app_id: int) -> str | None:
    from backend.senti_next import storage

    try:
        for item in storage.load_starred_games():
            if int(item.get("app_id", 0)) == int(app_id):
                name = (item.get("name") or "").strip()
                return name or None
    except Exception:
        return None
    return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a SentiNext PDF report for a Steam app id.")
    parser.add_argument("--app-id", type=int, required=True, help="Steam app id (e.g. 1091500)")
    parser.add_argument("--review-count", type=int, default=100, help="Max reviews to analyze (default: 100)")
    parser.add_argument("--language", default="english", help="Steam review language (default: english)")
    parser.add_argument("--filter", default="recent", help="Steam filter: recent|updated|all|recent_created|best")
    parser.add_argument("--day-range", type=int, default=None, help="Only include reviews from last N days")
    parser.add_argument(
        "--use-cache",
        action="store_true",
        help="Prefer cached DB reviews; if none are cached, fetch from Steam (useful if Steam is sometimes unreachable).",
    )
    parser.add_argument(
        "--cache-only",
        action="store_true",
        help="Only use cached DB reviews; fail if none are cached.",
    )
    parser.add_argument(
        "--persist",
        action="store_true",
        help="Persist fetched reviews to the SQLite DB for reuse (default: enabled unless --no-persist).",
    )
    parser.add_argument("--no-persist", action="store_true", help="Do not persist fetched reviews to the DB.")
    parser.add_argument("--out", default=None, help="Output PDF path (default: reports/ under the DB directory).")
    parser.add_argument(
        "--ollama-model",
        default=None,
        help="Override Ollama model (default: SENTINEXT_OLLAMA_MODEL or gpt-oss:20b-cloud).",
    )
    parser.add_argument("--ollama-host", default=None, help="Override Ollama host (e.g. http://127.0.0.1:11434).")
    parser.add_argument(
        "--refresh-labels",
        action="store_true",
        help="Force re-labeling with Ollama even if cached labels exist.",
    )
    parser.add_argument(
        "--no-cache-labels",
        action="store_true",
        help="Do not write/read label cache in SQLite (useful for one-off runs).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    if args.ollama_model:
        os.environ["SENTINEXT_OLLAMA_MODEL"] = args.ollama_model
    if args.ollama_host:
        os.environ["OLLAMA_HOST"] = args.ollama_host

    from backend.senti_next import build_reviews_dataframe, fetch_reviews, llm, storage
    from backend.senti_next.steam_api import fetch_app_details
    from backend.senti_next.insights import prepare_insights
    from backend.pdf_report import render_insights_pdf

    storage.init_db()

    filter_type = (args.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    app_id = int(args.app_id)
    review_count = max(1, int(args.review_count))

    persist = bool(args.persist) and not bool(args.no_persist)
    if not args.persist and not args.no_persist:
        persist = True

    game_context: dict = {}
    if not args.cache_only:
        try:
            game_context = fetch_app_details(app_id) or {}
        except Exception:
            game_context = {}

    game_name = (game_context.get("name") or "").strip() or _cached_game_name(app_id) or str(app_id)

    reviews = []
    if args.use_cache or args.cache_only:
        reviews = storage.load_reviews(app_id, limit=review_count)

    if args.cache_only and not reviews:
        raise SystemExit("No cached reviews found for this app id. Run an analysis first, or re-run without --cache-only.")

    if not reviews:
        reviews = fetch_reviews(
            app_id,
            count=review_count,
            language=args.language,
            filter_type=filter_type,
            day_range=args.day_range,
        )
        if persist and reviews:
            storage.upsert_reviews(app_id, reviews)

    metadata = {
        "app_id": app_id,
        "requested": review_count,
        "retrieved": len(reviews),
        "language": args.language,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }

    llm_labels = llm.ensure_review_labels(
        app_id=app_id,
        reviews=reviews,
        force_refresh=bool(args.refresh_labels),
        game_context=game_context or None,
        cache_enabled=not bool(args.no_cache_labels),
    )

    df = build_reviews_dataframe(reviews)
    df = llm.apply_review_labels(df, llm_labels)
    if df is None or df.empty:
        raise SystemExit("No reviews available to analyze.")

    insights = prepare_insights(df)
    pdf_bytes = render_insights_pdf(
        app_id=app_id,
        game_name=game_name,
        metadata=metadata,
        insights=insights or {},
        game_image_url=(
            (game_context or {}).get("header_image")
            or f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
        ),
    )

    if args.out:
        out_path = Path(args.out).expanduser()
    else:
        out_dir = _reports_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"sentinext-report-{app_id}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.pdf"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(pdf_bytes)
    print(str(out_path))


if __name__ == "__main__":
    main()
