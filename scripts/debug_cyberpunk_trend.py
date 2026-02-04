#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Iterable

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.senti_next.analysis import build_reviews_dataframe, recommended_share_over_time  # noqa: E402
from backend.senti_next.steam_api import fetch_reviews  # noqa: E402


def ascii_plot(rows: Iterable[dict], width: int = 40) -> str:
    lines = []
    for row in rows:
        period = row.get("period")
        if hasattr(period, "strftime"):
            period_str = period.strftime("%Y-%m-%d")
        else:
            period_str = str(period)[:10] if period is not None else "unknown"
        rate = float(row.get("recommendation_rate") or 0)
        pct = rate * 100.0
        bar_len = int(round((pct / 100.0) * width))
        bar = "#" * bar_len
        lines.append(f"{period_str} | {pct:6.2f}% | {bar}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch recent Steam reviews and plot recommendation rate by day.")
    parser.add_argument("--app-id", type=int, default=1091500, help="Steam app id (default: 1091500 Cyberpunk)")
    parser.add_argument("--count", type=int, default=200, help="Number of reviews to fetch (default: 200)")
    parser.add_argument("--language", type=str, default="all", help="Steam language (default: all)")
    parser.add_argument("--filter", type=str, default="recent", help="Steam filter (recent|all|updated)")
    parser.add_argument("--freq", type=str, default="W-SUN", help="Resample frequency (default: W-SUN)")
    parser.add_argument("--out", type=str, default="", help="Optional output CSV path")
    args = parser.parse_args()

    print(f"Fetching {args.count} reviews for app_id={args.app_id}...")
    reviews = fetch_reviews(
        args.app_id,
        count=args.count,
        language=args.language,
        filter_type=args.filter,
    )
    print(f"Fetched {len(reviews)} reviews.")
    if not reviews:
        print("No reviews returned.")
        return 1

    df = build_reviews_dataframe(reviews)
    if df.empty:
        print("DataFrame is empty after build_reviews_dataframe.")
        return 1

    min_dt = df["created_at"].min()
    max_dt = df["created_at"].max()
    print(f"Date range: {min_dt} → {max_dt}")
    print(f"Voted_up counts: true={int(df['voted_up'].sum())}, false={int((~df['voted_up']).sum())}")

    trend_df = recommended_share_over_time(df, freq=args.freq, fill_missing=True)
    if trend_df.empty:
        print("Trend DataFrame is empty.")
        return 1

    output_path = args.out.strip()
    if not output_path:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        output_path = str(Path("reports") / f"cyberpunk_trend_{args.app_id}_{stamp}.csv")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    trend_df.to_csv(output_path, index=False)
    print(f"Wrote CSV: {output_path}")

    # ASCII plot
    print("\nRecommendation rate by week (ASCII):")
    print(ascii_plot(trend_df.to_dict(orient="records")))

    # Optional matplotlib plot if available
    try:
        import matplotlib.pyplot as plt  # type: ignore

        plt.figure(figsize=(10, 4))
        plt.plot(trend_df["period"], trend_df["recommendation_rate"] * 100.0, marker="o")
        plt.title(f"Recommendation Rate by Day (app_id={args.app_id})")
        plt.ylabel("Recommendation Rate (%)")
        plt.xlabel("Date")
        plt.grid(True, alpha=0.2)
        plt.tight_layout()
        png_path = Path(output_path).with_suffix(".png")
        plt.savefig(png_path)
        print(f"Wrote plot: {png_path}")
    except Exception as exc:
        print(f"Matplotlib not available ({exc}); skipped PNG plot.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
