"""Review data preparation and aggregation helpers."""
from __future__ import annotations

from collections import Counter
import re
from typing import Dict, Iterable, List, Optional, Sequence

import pandas as pd

_TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9']+")


def tokenize(text: str) -> List[str]:
    return [token for token in _TOKEN_PATTERN.findall(text.lower()) if token]


def build_reviews_dataframe(reviews: Sequence[dict]) -> pd.DataFrame:
    """Convert raw API reviews into a tidy DataFrame."""
    rows = []
    for review in reviews:
        text = review.get("review", "") or ""

        author = review.get("author", {}) or {}
        playtime_forever = author.get("playtime_forever") or 0
        playtime_recent = author.get("playtime_last_two_weeks") or 0
        playtime_at_review = author.get("playtime_at_review") or 0

        rows.append(
            {
                "review_id": review.get("recommendationid"),
                "review": text,
                "language": review.get("language"),
                "timestamp_created": review.get("timestamp_created"),
                "timestamp_updated": review.get("timestamp_updated"),
                "voted_up": bool(review.get("voted_up")),
                "votes_up": review.get("votes_up", 0),
                "votes_funny": review.get("votes_funny", 0),
                "weighted_vote_score": review.get("weighted_vote_score"),
                "comment_count": review.get("comment_count", 0),
                "steam_purchase": bool(review.get("steam_purchase")),
                "received_for_free": bool(review.get("received_for_free")),
                "written_during_early_access": bool(review.get("written_during_early_access")),
                "author_steamid": author.get("steamid"),
                "author_num_games_owned": author.get("num_games_owned", 0),
                "author_num_reviews": author.get("num_reviews", 0),
                "author_playtime_forever": playtime_forever,
                "author_playtime_last_two_weeks": playtime_recent,
                "author_playtime_at_review": playtime_at_review,
                "author_last_played": author.get("last_played"),
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df["created_at"] = pd.to_datetime(df["timestamp_created"], unit="s", errors="coerce")
    df["updated_at"] = pd.to_datetime(df["timestamp_updated"], unit="s", errors="coerce")
    df["last_played_at"] = pd.to_datetime(df["author_last_played"], unit="s", errors="coerce")
    df["author_playtime_hours"] = df["author_playtime_forever"].fillna(0) / 60.0
    df["author_recent_playtime_hours"] = df["author_playtime_last_two_weeks"].fillna(0) / 60.0

    return df


def summarize_sentiment(df: pd.DataFrame) -> Dict[str, float]:
    """Return aggregate sentiment metrics based on LLM-derived labels."""
    if df.empty:
        return {
            "average_compound": 0.0,
            "share_positive": 0.0,
            "share_neutral": 0.0,
            "share_negative": 0.0,
        }

    if "sentiment_label" in df.columns:
        sentiments = df["sentiment_label"].fillna("neutral")
    elif "llm_sentiment" in df.columns:
        sentiments = df["llm_sentiment"].fillna("neutral")
    else:
        sentiments = pd.Series(["neutral"] * df.shape[0])

    counts = sentiments.value_counts()
    total = counts.sum() or 1

    if "sentiment_compound" in df.columns:
        average_score = float(df["sentiment_compound"].fillna(0.0).mean())
    elif "llm_sentiment" in df.columns:
        score_map = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}
        average_score = float(sentiments.map(score_map).fillna(0.0).mean())
    else:
        average_score = 0.0

    return {
        "average_compound": average_score,
        "share_positive": counts.get("positive", 0) / total,
        "share_neutral": counts.get("neutral", 0) / total,
        "share_negative": counts.get("negative", 0) / total,
    }


def summarize_playtime(df: pd.DataFrame) -> Dict[str, float]:
    """Compute playtime statistics in hours."""
    if df.empty:
        return {
            "median_playtime_hours": 0.0,
            "mean_playtime_hours": 0.0,
            "median_recent_playtime_hours": 0.0,
        }

    playtime_hours = df["author_playtime_forever"].fillna(0) / 60.0
    playtime_recent_hours = df["author_playtime_last_two_weeks"].fillna(0) / 60.0

    return {
        "median_playtime_hours": float(playtime_hours.median()),
        "mean_playtime_hours": float(playtime_hours.mean()),
        "median_recent_playtime_hours": float(playtime_recent_hours.median()),
    }


def top_keywords(
    texts: Iterable[str],
    top_n: int = 15,
    minimum_occurrences: int = 2,
) -> List[Dict[str, float]]:
    """Return the most frequent keywords across the provided texts."""
    counter: Counter[str] = Counter()
    for text in texts:
        tokens = tokenize(text or "")
        counter.update(tokens)

    most_common = [item for item in counter.most_common() if item[1] >= minimum_occurrences]
    return [
        {"keyword": token, "count": count}
        for token, count in most_common[:top_n]
    ]


def keyword_summary_by_label(df: pd.DataFrame, label: str, top_n: int = 10) -> List[Dict[str, float]]:
    """Shortcut to compute top keywords for reviews matching a sentiment label."""
    label_df = df[df["sentiment_label"] == label]
    return top_keywords(label_df["review"].tolist(), top_n=top_n)


def helpfulness_summary(df: pd.DataFrame) -> Dict[str, float]:
    if df.empty:
        return {"average_votes_up": 0.0, "average_votes_funny": 0.0}
    return {
        "average_votes_up": float(df["votes_up"].mean()),
        "average_votes_funny": float(df["votes_funny"].mean()),
    }


def recommendation_rate(df: pd.DataFrame) -> float:
    if df.empty:
        return 0.0
    return float(df["voted_up"].mean())


def recommended_share_over_time(df: pd.DataFrame, freq: str = "7D") -> pd.DataFrame:
    if df.empty or "created_at" not in df.columns:
        return pd.DataFrame(columns=["period", "recommendation_rate", "avg_compound", "reviews"])

    ts_df = df.dropna(subset=["created_at"]).copy()
    if ts_df.empty:
        return pd.DataFrame(columns=["period", "recommendation_rate", "avg_compound", "reviews"])

    resampled = (
        ts_df.set_index("created_at")
        .sort_index()
        .resample(freq)
        .agg(
            recommendation_rate=("voted_up", "mean"),
            avg_compound=("sentiment_compound", "mean"),
            reviews=("sentiment_compound", "count"),
        )
        .reset_index()
    )
    resampled.rename(columns={"created_at": "period"}, inplace=True)
    resampled[["recommendation_rate", "avg_compound"]].fillna(0.0, inplace=True)
    return resampled


def _segment_metrics(df: pd.DataFrame) -> Dict[str, float]:
    if df.empty:
        return {
            "reviews": 0,
            "avg_compound": 0.0,
            "recommendation_rate": 0.0,
            "share_positive": 0.0,
            "share_negative": 0.0,
        }

    sentiment = summarize_sentiment(df)
    return {
        "reviews": int(df.shape[0]),
        "avg_compound": sentiment["average_compound"],
        "recommendation_rate": float(df["voted_up"].mean()),
        "share_positive": sentiment["share_positive"],
        "share_negative": sentiment["share_negative"],
    }


def early_access_vs_release_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    segments = {
        "Early Access": df[df["written_during_early_access"] == True],  # noqa: E712
        "Release": df[df["written_during_early_access"] == False],  # noqa: E712
    }
    rows = []
    for label, segment in segments.items():
        metrics = _segment_metrics(segment)
        rows.append({"segment": label, **metrics})
    return pd.DataFrame(rows)


def free_vs_paid_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    segments = {
        "Steam Purchase": df[df["steam_purchase"] == True],  # noqa: E712
        "External/Free": df[df["steam_purchase"] == False],  # noqa: E712
        "Received For Free": df[df["received_for_free"] == True],  # noqa: E712
    }
    rows = []
    for label, segment in segments.items():
        metrics = _segment_metrics(segment)
        rows.append({"segment": label, **metrics})
    return pd.DataFrame(rows)


def playtime_segment_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["segment", "reviews", "avg_compound", "recommendation_rate", "share_positive", "share_negative"])

    minutes = df["author_playtime_forever"].fillna(0)
    segments = {
        "<2h": df[minutes < 120],
        "2–20h": df[(minutes >= 120) & (minutes < 1200)],
        "20h+": df[minutes >= 1200],
    }
    rows = []
    for label, segment in segments.items():
        metrics = _segment_metrics(segment)
        rows.append({"segment": label, **metrics})
    return pd.DataFrame(rows)


def refund_risk_index(df: pd.DataFrame) -> float:
    negatives = df[df["sentiment_label"] == "negative"]
    if negatives.empty:
        return 0.0
    return float((negatives["author_playtime_forever"].fillna(0) < 120).mean())


def core_fan_disappointment(df: pd.DataFrame) -> float:
    negatives = df[df["sentiment_label"] == "negative"]
    if negatives.empty:
        return 0.0
    return float((negatives["author_playtime_forever"].fillna(0) > 3000).mean())


def churn_signal_rate(df: pd.DataFrame, window_days: int = 7) -> float:
    negatives = df[df["sentiment_label"] == "negative"].dropna(subset=["created_at", "last_played_at"])
    if negatives.empty:
        return 0.0
    deltas = (negatives["created_at"] - negatives["last_played_at"]).dt.total_seconds() / 86400.0
    mask = deltas.abs() <= window_days
    return float(mask.mean()) if len(mask) else 0.0


def reviewer_influence_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "author_num_reviews" not in df.columns:
        return pd.DataFrame(columns=["segment", "threshold", "reviews", "avg_compound", "recommendation_rate", "share_positive", "share_negative"])

    counts = df["author_num_reviews"].fillna(0)
    quantile = counts.quantile(0.9)
    threshold = max(quantile, 10.0)
    heavy = df[counts >= threshold]
    if heavy.empty and counts.max() > 0:
        threshold = counts.max()
        heavy = df[counts >= threshold]

    rows = []
    rows.append({"segment": "Heavy reviewers", "threshold": threshold, **_segment_metrics(heavy)})
    rows.append({"segment": "Others", "threshold": threshold, **_segment_metrics(df[counts < threshold])})
    return pd.DataFrame(rows)


def veteran_benchmarking(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "author_num_games_owned" not in df.columns:
        return pd.DataFrame(columns=["segment", "threshold", "reviews", "avg_compound", "recommendation_rate", "share_positive", "share_negative"])

    counts = df["author_num_games_owned"].fillna(0)
    quantile = counts.quantile(0.9)
    threshold = max(quantile, 100.0)
    veterans = df[counts >= threshold]
    if veterans.empty and counts.max() > 0:
        threshold = counts.max()
        veterans = df[counts >= threshold]

    rows = []
    rows.append({"segment": "High-library owners", "threshold": threshold, **_segment_metrics(veterans)})
    rows.append({"segment": "Others", "threshold": threshold, **_segment_metrics(df[counts < threshold])})
    return pd.DataFrame(rows)


def patch_impact_index(
    df: pd.DataFrame,
    event_date: Optional[pd.Timestamp],
    window_days: int = 14,
) -> Optional[Dict[str, float]]:
    if event_date is None or df.empty or "created_at" not in df.columns:
        return None

    event_date = pd.Timestamp(event_date)
    window = pd.Timedelta(days=window_days)

    mask = df["created_at"].between(event_date - window, event_date + window)
    window_df = df[mask]
    if window_df.empty:
        return None

    before = window_df[window_df["created_at"] < event_date]
    after = window_df[window_df["created_at"] >= event_date]
    if before.empty or after.empty:
        return None

    before_metrics = _segment_metrics(before)
    after_metrics = _segment_metrics(after)

    return {
        "before_reviews": before_metrics["reviews"],
        "after_reviews": after_metrics["reviews"],
        "before_avg_compound": before_metrics["avg_compound"],
        "after_avg_compound": after_metrics["avg_compound"],
        "before_recommendation_rate": before_metrics["recommendation_rate"],
        "after_recommendation_rate": after_metrics["recommendation_rate"],
        "delta_avg_compound": after_metrics["avg_compound"] - before_metrics["avg_compound"],
        "delta_recommendation_rate": after_metrics["recommendation_rate"] - before_metrics["recommendation_rate"],
    }


def market_quality_signal(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["segment", "reviews", "avg_compound", "recommendation_rate", "share_positive", "share_negative"])

    segments = {
        "Steam purchase": df[df["steam_purchase"] == True],  # noqa: E712
        "External keys": df[df["steam_purchase"] == False],  # noqa: E712
        "Received for free": df[df["received_for_free"] == True],  # noqa: E712
    }
    rows = []
    for label, segment in segments.items():
        metrics = _segment_metrics(segment)
        rows.append({"segment": label, **metrics})
    return pd.DataFrame(rows)
