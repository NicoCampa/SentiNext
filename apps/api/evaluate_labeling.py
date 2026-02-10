from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


def _find_repo_root(start: Path) -> Path | None:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def _default_out_dir(app_id: int) -> Path:
    repo_root = _find_repo_root(Path.cwd()) or _find_repo_root(Path(__file__).resolve())
    base = (repo_root / "data" if repo_root else Path.cwd()) / "labeling_eval" / str(app_id)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return base / timestamp


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


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


def _review_id(review: dict) -> Optional[str]:
    value = review.get("recommendationid") or review.get("review_id")
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _word_count(text: str) -> int:
    import re

    return len(re.findall(r"\w+", text or "", flags=re.UNICODE))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")


def _canonical_primary(label: dict) -> str:
    main = str(label.get("main_category") or "other").strip().lower() or "other"
    sub = str(label.get("subcategory") or "general").strip().lower() or "general"
    return f"{main}/{sub}"


def _as_set(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {str(item).strip().lower() for item in value if isinstance(item, str) and item.strip()}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 1.0
    return len(a & b) / len(union)


def _agreement_report(
    *,
    reviews: list[dict],
    labels_llm: dict[str, dict],
    labels_hybrid: dict[str, dict],
) -> dict[str, Any]:
    ids: list[str] = []
    eligible_ids: list[str] = []
    for review in reviews:
        rid = _review_id(review)
        if not rid:
            continue
        ids.append(rid)
        text = (review.get("review") or "").strip()
        if text and _word_count(text) >= 2:
            eligible_ids.append(rid)

    def _compute(target_ids: list[str]) -> dict[str, Any]:
        n = 0
        main_matches = 0
        primary_matches = 0
        subcat_set_matches = 0
        subcat_jaccard = 0.0
        issue_presence_matches = 0
        request_presence_matches = 0

        for rid in target_ids:
            a = labels_llm.get(rid) or {}
            b = labels_hybrid.get(rid) or {}
            if not a or not b:
                continue
            n += 1
            main_a = str(a.get("main_category") or "other").strip().lower()
            main_b = str(b.get("main_category") or "other").strip().lower()
            if main_a == main_b:
                main_matches += 1
            if _canonical_primary(a) == _canonical_primary(b):
                primary_matches += 1

            sub_a = _as_set(a.get("subcategories"))
            sub_b = _as_set(b.get("subcategories"))
            if sub_a == sub_b:
                subcat_set_matches += 1
            subcat_jaccard += _jaccard(sub_a, sub_b)

            has_issue_a = bool(_as_set(a.get("issue_subcategories")))
            has_issue_b = bool(_as_set(b.get("issue_subcategories")))
            if has_issue_a == has_issue_b:
                issue_presence_matches += 1

            has_request_a = bool(_as_set(a.get("request_subcategories")))
            has_request_b = bool(_as_set(b.get("request_subcategories")))
            if has_request_a == has_request_b:
                request_presence_matches += 1

        if n == 0:
            return {
                "n": 0,
                "main_category_agreement": None,
                "primary_subcategory_agreement": None,
                "subcategories_set_agreement": None,
                "subcategories_jaccard_avg": None,
                "issue_presence_agreement": None,
                "request_presence_agreement": None,
            }

        return {
            "n": n,
            "main_category_agreement": main_matches / n,
            "primary_subcategory_agreement": primary_matches / n,
            "subcategories_set_agreement": subcat_set_matches / n,
            "subcategories_jaccard_avg": subcat_jaccard / n,
            "issue_presence_agreement": issue_presence_matches / n,
            "request_presence_agreement": request_presence_matches / n,
        }

    disagreements: list[dict[str, Any]] = []
    for review in reviews:
        rid = _review_id(review)
        if not rid:
            continue
        a = labels_llm.get(rid) or {}
        b = labels_hybrid.get(rid) or {}
        if not a or not b:
            continue
        if _canonical_primary(a) == _canonical_primary(b):
            continue
        text = (review.get("review") or "").strip().replace("\n", " ").replace("\r", " ")
        author = review.get("author") or {}
        disagreements.append(
            {
                "review_id": rid,
                "votes_up": int(review.get("votes_up", 0) or 0),
                "voted_up": bool(review.get("voted_up")),
                "playtime_forever": int(author.get("playtime_forever", 0) or 0),
                "text": text[:320],
                "llm_primary": _canonical_primary(a),
                "hybrid_primary": _canonical_primary(b),
                "hybrid_source": b.get("_label_source"),
            }
        )
    disagreements.sort(key=lambda item: int(item.get("votes_up", 0) or 0), reverse=True)

    hybrid_sources: dict[str, int] = {}
    llm_sources: dict[str, int] = {}
    for rid in ids:
        a = labels_llm.get(rid) or {}
        b = labels_hybrid.get(rid) or {}
        source_a = str(a.get("_label_source") or "unknown")
        source_b = str(b.get("_label_source") or "unknown")
        llm_sources[source_a] = llm_sources.get(source_a, 0) + 1
        hybrid_sources[source_b] = hybrid_sources.get(source_b, 0) + 1

    return {
        "overall": _compute(ids),
        "eligible": _compute(eligible_ids),
        "llm_only_sources": llm_sources,
        "hybrid_sources": hybrid_sources,
        "primary_disagreements": disagreements,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run LLM labeling on Steam reviews and compute agreement metrics."
    )
    parser.add_argument("--app-id", type=int, required=True, help="Steam app id (e.g. 1091500)")
    parser.add_argument("--review-count", type=int, default=200, help="Number of reviews to fetch/analyze (default: 200)")
    parser.add_argument("--language", default="english", help="Steam review language (default: english)")
    parser.add_argument("--filter", default="recent", help="Steam filter: recent|updated|all|recent_created|best")
    parser.add_argument("--day-range", type=int, default=None, help="Only include reviews from last N days")
    parser.add_argument("--use-cache", action="store_true", help="Load cached DB reviews first, then fetch if needed.")
    parser.add_argument("--cache-only", action="store_true", help="Only use cached DB reviews; fail if none cached.")
    parser.add_argument("--persist", action="store_true", help="Persist fetched reviews to the database (default).")
    parser.add_argument("--no-persist", action="store_true", help="Do not persist fetched reviews to the DB.")
    parser.add_argument("--model", default="gemini-flash-lite-latest", help="LLM model to use for LLM runs (default: gemini-flash-lite-latest).")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory for saved reviews/labels/metrics (default: data/labeling_eval/<app_id>/<timestamp>).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run labelers even if outputs already exist in --out-dir.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    repo_root = _find_repo_root(Path.cwd()) or _find_repo_root(Path(__file__).resolve())
    if repo_root:
        _load_dotenv(repo_root / ".env")
    _load_dotenv(Path.cwd() / ".env")

    if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        raise SystemExit(
            "GEMINI_API_KEY is not set. Export it in your shell or add it to .env as GEMINI_API_KEY=..."
        )

    from apps.api.senti_next import fetch_reviews, llm, storage
    from apps.api.senti_next.steam_api import fetch_app_details

    storage.init_db()

    filter_type = (args.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    app_id = int(args.app_id)
    review_count = max(1, int(args.review_count))

    persist = bool(args.persist) and not bool(args.no_persist)
    if not args.persist and not args.no_persist:
        persist = True

    out_dir = Path(args.out_dir).expanduser() if args.out_dir else _default_out_dir(app_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    game_context: dict = {}
    if not args.cache_only:
        try:
            game_context = fetch_app_details(app_id) or {}
        except Exception:
            game_context = {}
    game_name = (game_context.get("name") or "").strip() or str(app_id)

    reviews_path = out_dir / "reviews.jsonl"
    dataset_path = out_dir / "dataset.json"
    llm_labels_path = out_dir / "labels_llm_only.json"
    hybrid_labels_path = out_dir / "labels_hybrid.json"
    agreement_path = out_dir / "agreement.json"

    reviews: list[dict] = []
    if reviews_path.is_file() and dataset_path.is_file():
        print(f"Loading dataset from {out_dir}")
        with reviews_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                reviews.append(json.loads(line))
    else:
        if args.use_cache or args.cache_only:
            reviews = storage.load_reviews(app_id, limit=review_count)
            if reviews:
                print(f"Loaded {len(reviews)} reviews from cache.")

        if args.cache_only and not reviews:
            raise SystemExit("No cached reviews found for this app id. Run once without --cache-only to fetch them.")

        if not reviews:
            print("Fetching reviews from Steam...")
            reviews = fetch_reviews(
                app_id,
                count=review_count,
                language=args.language,
                filter_type=filter_type,
                day_range=args.day_range,
            )
            if persist and reviews:
                storage.upsert_reviews(app_id, reviews)
                storage.enforce_review_limit(app_id)
            print(f"Fetched {len(reviews)} reviews from Steam.")

        dataset_meta = {
            "app_id": app_id,
            "game_name": game_name,
            "requested": review_count,
            "retrieved": len(reviews),
            "language": args.language,
            "filter": filter_type,
            "day_range": args.day_range,
            "fetched_at": datetime.utcnow().isoformat() + "Z",
        }
        _write_json(dataset_path, dataset_meta)
        _write_jsonl(reviews_path, reviews)

    labels_llm: dict[str, dict] = {}
    if llm_labels_path.is_file() and not args.force:
        labels_llm = json.loads(llm_labels_path.read_text(encoding="utf-8"))
    else:
    print("Running LLM labeling (gpt-5-mini)...")
    labels_llm = llm.ensure_review_labels(
        app_id=app_id,
        reviews=reviews,
        force_refresh=True,
        cache_enabled=False,
        game_context=game_context or None,
        progress_callback=_progress_bar("LLM-only"),
    )
    _write_json(llm_labels_path, labels_llm)

    print(f"Saved evaluation to: {out_dir}")


if __name__ == "__main__":
    main()
