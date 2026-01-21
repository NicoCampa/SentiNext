from __future__ import annotations

import argparse
import os
import sys
import time
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


def _safe_report_dir_name(name: str, app_id: int) -> str:
    raw = (name or "").strip()
    if not raw:
        return str(app_id)
    allowed = set(" -_().[]")
    cleaned = []
    for char in raw:
        if ord(char) >= 128:
            cleaned.append("-")
            continue
        if char.isalnum() or char in allowed:
            cleaned.append(char)
        elif char.isspace():
            cleaned.append(" ")
        else:
            cleaned.append("-")
    compact = " ".join("".join(cleaned).split())
    compact = compact.strip(" .-_")
    return compact or str(app_id)


def _print_step(message: str) -> None:
    print(message, flush=True)


def _progress_bar(prefix: str, *, width: int = 24):
    state = {"last_pct": -1, "last_time": 0.0}

    def _callback(done: int, total: int) -> None:
        if total <= 0:
            return
        pct = int((done / total) * 100)
        now = time.monotonic()
        if pct == state["last_pct"] and done < total and (now - state["last_time"]) < 0.2:
            return
        state["last_pct"] = pct
        state["last_time"] = now
        filled = int(width * done / total) if total else 0
        bar = "#" * filled + "-" * (width - filled)
        line = f"{prefix} [{bar}] {done}/{total} ({pct}%)"
        end = "\n" if done >= total else "\r"
        sys.stdout.write(line + end)
        sys.stdout.flush()

    return _callback


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a SentiNext report for one or more Steam app ids.")
    parser.add_argument(
        "--app-id",
        type=int,
        required=False,
        help="Steam app id (e.g. 1091500). Required unless --compare is used.",
    )
    parser.add_argument(
        "--compare",
        default=None,
        help="Comma-separated Steam app ids to compare (2 or 3 ids). Overrides --app-id.",
    )
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
    parser.add_argument(
        "--format",
        choices=["pdf", "html"],
        default="pdf",
        help="Output format: pdf or html (default: pdf).",
    )
    return parser.parse_args()


def _parse_app_ids(args: argparse.Namespace) -> list[int]:
    if args.compare:
        raw_parts = [part.strip() for part in str(args.compare).split(",") if part.strip()]
        if not raw_parts:
            raise SystemExit("Provide comma-separated app ids to --compare.")
        app_ids: list[int] = []
        for part in raw_parts:
            try:
                app_ids.append(int(part))
            except ValueError as exc:
                raise SystemExit(f"Invalid app id in --compare: {part!r}") from exc
        if len(app_ids) not in {2, 3}:
            raise SystemExit("Comparison requires 2 or 3 app ids.")
        return app_ids

    if args.app_id is None:
        raise SystemExit("Provide --app-id or --compare.")
    return [int(args.app_id)]


def main() -> None:
    args = _parse_args()

    if args.ollama_model:
        os.environ["SENTINEXT_OLLAMA_MODEL"] = args.ollama_model
    if args.ollama_host:
        os.environ["OLLAMA_HOST"] = args.ollama_host

    from backend.senti_next import build_reviews_dataframe, fetch_reviews, llm, storage
    from backend.senti_next.steam_api import fetch_app_details
    from backend.senti_next.insights import prepare_insights
    from backend.html_pdf import (
        render_insights_comparison_html,
        render_insights_comparison_pdf,
        render_insights_html,
        render_insights_pdf,
    )

    storage.init_db()

    filter_type = (args.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    app_ids = _parse_app_ids(args)
    compare_mode = len(app_ids) > 1
    review_count = max(1, int(args.review_count))

    persist = bool(args.persist) and not bool(args.no_persist)
    if not args.persist and not args.no_persist:
        persist = True

    def _build_report_payload(app_id: int, *, idx: int, total: int) -> dict:
        prefix = f"[{idx}/{total} {app_id}]"

        _print_step(f"{prefix} Step 1/5: loading game metadata")
        game_context: dict = {}
        if not args.cache_only:
            try:
                game_context = fetch_app_details(app_id) or {}
            except Exception:
                game_context = {}

        game_name = (game_context.get("name") or "").strip() or _cached_game_name(app_id) or str(app_id)
        label = f"{game_name} ({app_id})"

        _print_step(f"{label} Step 2/5: loading reviews")
        reviews = []
        if args.use_cache or args.cache_only:
            reviews = storage.load_reviews(app_id, limit=review_count)
            if reviews:
                _print_step(f"{label} Loaded {len(reviews)} reviews from cache.")

        if args.cache_only and not reviews:
            raise SystemExit(
                "No cached reviews found for this app id. Run an analysis first, or re-run without --cache-only."
            )

        if not reviews:
            _print_step(f"{label} Fetching reviews from Steam...")
            reviews = fetch_reviews(
                app_id,
                count=review_count,
                language=args.language,
                filter_type=filter_type,
                day_range=args.day_range,
            )
            if persist and reviews:
                storage.upsert_reviews(app_id, reviews)
            _print_step(f"{label} Fetched {len(reviews)} reviews from Steam.")

        metadata = {
            "app_id": app_id,
            "requested": review_count,
            "retrieved": len(reviews),
            "language": args.language,
            "fetched_at": datetime.utcnow().isoformat() + "Z",
        }

        _print_step(f"{label} Step 3/5: labeling reviews")
        llm_labels = llm.ensure_review_labels(
            app_id=app_id,
            reviews=reviews,
            force_refresh=bool(args.refresh_labels),
            game_context=game_context or None,
            cache_enabled=not bool(args.no_cache_labels),
            progress_callback=_progress_bar(f"LLM {idx}/{total}"),
        )

        _print_step(f"{label} Step 4/5: building insights")
        df = build_reviews_dataframe(reviews)
        df = llm.apply_review_labels(df, llm_labels)
        if df is None or df.empty:
            raise SystemExit("No reviews available to analyze.")

        insights = prepare_insights(df)
        return dict(
            app_id=app_id,
            game_name=game_name,
            metadata=metadata,
            insights=insights or {},
            reviews=reviews,
            llm_labels=llm_labels,
            game_image_url=(
                (game_context or {}).get("header_image")
                or f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            ),
        )

    reports = []
    total = len(app_ids)
    for idx, app_id in enumerate(app_ids, start=1):
        reports.append(_build_report_payload(app_id, idx=idx, total=total))

    _print_step("Step 5/5: rendering report")
    if args.out:
        out_path = Path(args.out).expanduser()
    else:
        out_root = _reports_dir()
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        ext = "html" if args.format == "html" else "pdf"

        if compare_mode:
            game_names = [str(report.get("game_name") or "-") for report in reports]
            comparison_title = "Comparison - " + " vs ".join(game_names)
            game_dir = out_root / _safe_report_dir_name(comparison_title, app_ids[0])
            pdf_dir = game_dir / "PDF report"
            html_dir = game_dir / "HTML report"
            pdf_dir.mkdir(parents=True, exist_ok=True)
            html_dir.mkdir(parents=True, exist_ok=True)
            target_dir = html_dir if args.format == "html" else pdf_dir
            app_id_slug = "-".join(str(app_id) for app_id in app_ids)
            out_path = target_dir / f"sentinext-compare-{app_id_slug}-{timestamp}.{ext}"
        else:
            report_payload = reports[0]
            game_name = str(report_payload.get("game_name") or "-")
            app_id = int(report_payload.get("app_id", 0) or 0)
            game_dir = out_root / _safe_report_dir_name(game_name, app_id)
            pdf_dir = game_dir / "PDF report"
            html_dir = game_dir / "HTML report"
            pdf_dir.mkdir(parents=True, exist_ok=True)
            html_dir.mkdir(parents=True, exist_ok=True)
            target_dir = html_dir if args.format == "html" else pdf_dir
            out_path = target_dir / f"sentinext-report-{app_id}-{timestamp}.{ext}"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if args.format == "html":
        if compare_mode:
            html_doc = render_insights_comparison_html(reports=reports)
        else:
            html_doc = render_insights_html(**reports[0])
        out_path.write_text(html_doc, encoding="utf-8")
    else:
        if compare_mode:
            pdf_bytes = render_insights_comparison_pdf(reports=reports)
        else:
            pdf_bytes = render_insights_pdf(**reports[0])
        out_path.write_bytes(pdf_bytes)
    print(str(out_path))


if __name__ == "__main__":
    main()
