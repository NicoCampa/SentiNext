"""Review data preparation and aggregation helpers."""
from __future__ import annotations

from collections import Counter
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pandas as pd

_TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9']+")
_TRUE_STRINGS = {
    "true",
    "1",
    "yes",
    "y",
    "positive",
    "recommended",
    "recommend",
    "thumbs_up",
    "thumbsup",
    "up",
}
_FALSE_STRINGS = {
    "false",
    "0",
    "no",
    "n",
    "negative",
    "not recommended",
    "not_recommended",
    "thumbs_down",
    "thumbsdown",
    "down",
}


def tokenize(text: str) -> List[str]:
    return [token for token in _TOKEN_PATTERN.findall(text.lower()) if token]


def _coerce_optional_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in _TRUE_STRINGS:
            return True
        if normalized in _FALSE_STRINGS:
            return False
    return None


def _coerce_bool(value: Any, default: bool = False) -> bool:
    parsed = _coerce_optional_bool(value)
    return parsed if parsed is not None else default


def _coerce_voted_up(review: dict) -> bool:
    for key in ("voted_up", "reviewer_voted_up", "recommendation", "sentiment"):
        parsed = _coerce_optional_bool(review.get(key))
        if parsed is not None:
            return parsed
    return False


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
                "voted_up": _coerce_voted_up(review),
                "votes_up": review.get("votes_up", 0),
                "votes_funny": review.get("votes_funny", 0),
                "weighted_vote_score": review.get("weighted_vote_score"),
                "comment_count": review.get("comment_count", 0),
                "steam_purchase": _coerce_bool(review.get("steam_purchase")),
                "received_for_free": _coerce_bool(review.get("received_for_free")),
                "written_during_early_access": _coerce_bool(review.get("written_during_early_access")),
                "primarily_steam_deck": _coerce_bool(review.get("primarily_steam_deck")),
                "author_steamid": author.get("steamid"),
                "author_num_games_owned": author.get("num_games_owned", 0),
                "author_num_reviews": author.get("num_reviews", 0),
                "author_playtime_forever": playtime_forever,
                "author_playtime_last_two_weeks": playtime_recent,
                "author_playtime_at_review": playtime_at_review,
                "author_deck_playtime_at_review": author.get("deck_playtime_at_review") or 0,
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
    """Return aggregate sentiment metrics based on Steam's voted_up (thumbs up/down)."""
    if df.empty:
        return {
            "average_compound": 0.0,
            "share_positive": 0.0,
            "share_neutral": 0.0,
            "share_negative": 0.0,
        }

    # Use Steam's voted_up (thumbs up/down) as the sentiment source
    if "voted_up" not in df.columns:
        return {
            "average_compound": 0.0,
            "share_positive": 0.0,
            "share_neutral": 0.0,
            "share_negative": 0.0,
        }

    positive_count = int(df["voted_up"].sum())
    negative_count = int((~df["voted_up"]).sum())
    total = len(df)

    # Average compound: positive reviews as 1.0, negative as -1.0
    average_score = float((positive_count - negative_count) / total) if total > 0 else 0.0

    return {
        "average_compound": average_score,
        "share_positive": float(positive_count / total) if total > 0 else 0.0,
        "share_neutral": 0.0,  # Steam has no neutral, only thumbs up/down
        "share_negative": float(negative_count / total) if total > 0 else 0.0,
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
    """Shortcut to compute top keywords for reviews matching voted_up (positive/negative)."""
    if label == "positive":
        label_df = df[df["voted_up"] == True]  # noqa: E712
    elif label == "negative":
        label_df = df[df["voted_up"] == False]  # noqa: E712
    else:
        label_df = df
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


def recommended_share_over_time(
    df: pd.DataFrame,
    freq: str = "auto",
    *,
    fill_missing: bool = False,
) -> pd.DataFrame:
    if df.empty or "created_at" not in df.columns:
        return pd.DataFrame(columns=["period", "recommendation_rate", "avg_compound", "reviews"])

    ts_df = df.dropna(subset=["created_at"]).copy()
    if ts_df.empty:
        return pd.DataFrame(columns=["period", "recommendation_rate", "avg_compound", "reviews"])

    # Get date range from first to last review
    min_date = ts_df["created_at"].min()
    max_date = ts_df["created_at"].max()

    # Auto-select frequency based on date range
    if freq == "auto":
        date_span = (max_date - min_date).days
        if date_span <= 14:
            # 2 weeks or less: daily
            freq = "D"
        elif date_span <= 60:
            # 2 months or less: weekly
            freq = "7D"
        elif date_span <= 365:
            # 1 year or less: bi-weekly
            freq = "14D"
        else:
            # More than 1 year: monthly
            freq = "30D"

    resampled = (
        ts_df.set_index("created_at")
        .sort_index()
        .resample(freq)
        .agg(
            recommendation_rate=("voted_up", "mean"),
            avg_compound=("voted_up", lambda s: (s.sum() - (~s).sum()) / len(s) if len(s) > 0 else 0.0),
            reviews=("voted_up", "count"),
        )
    )
    resampled.index.name = "period"

    if fill_missing:
        # Align to resample index to avoid off-by-one gaps for weekly buckets.
        start = resampled.index.min()
        end = resampled.index.max()
        full_range = pd.date_range(start=start, end=end, freq=freq)
        resampled = resampled.reindex(full_range)
        resampled.index.name = "period"
        resampled["reviews"] = resampled["reviews"].fillna(0)
        resampled["recommendation_rate"] = resampled["recommendation_rate"].fillna(0.0)
        resampled["avg_compound"] = resampled["avg_compound"].fillna(0.0)
    else:
        # Only keep periods that have actual reviews (don't interpolate empty periods)
        resampled = resampled[resampled["reviews"] > 0].copy()
        # Fill any NaN values in rate columns (shouldn't happen, but defensive)
        resampled.loc[:, ["recommendation_rate", "avg_compound"]] = resampled[["recommendation_rate", "avg_compound"]].fillna(0.0)

    resampled = resampled.reset_index()

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
    negatives = df[df["voted_up"] == False]  # noqa: E712
    if negatives.empty:
        return 0.0
    return float((negatives["author_playtime_forever"].fillna(0) < 120).mean())


def core_fan_disappointment(df: pd.DataFrame) -> float:
    negatives = df[df["voted_up"] == False]  # noqa: E712
    if negatives.empty:
        return 0.0
    return float((negatives["author_playtime_forever"].fillna(0) > 3000).mean())


def churn_signal_rate(df: pd.DataFrame, window_days: int = 7) -> float:
    negatives = df[df["voted_up"] == False].dropna(subset=["created_at", "last_played_at"])  # noqa: E712
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


def experience_level_issues(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze recommendation rate by gaming experience (number of games owned).

    EXPERIENCE = how many games the reviewer owns overall (their general gaming experience).
    Segments:
    - New: < 50 games owned
    - Casual: 50-200 games owned
    - Regular: 200-500 games owned
    - Veteran: 500+ games owned
    """
    def get_recommendation_rate(segment_df):
        if segment_df.empty or "voted_up" not in segment_df.columns:
            return 0.0
        return float(segment_df["voted_up"].mean())

    if df.empty or "author_num_games_owned" not in df.columns:
        return {
            "newcomers": {"count": 0, "recommendation_rate": 0.0},
            "casual": {"count": 0, "recommendation_rate": 0.0},
            "experienced": {"count": 0, "recommendation_rate": 0.0},
            "veterans": {"count": 0, "recommendation_rate": 0.0},
        }

    games_owned = df["author_num_games_owned"].fillna(0)

    # Segment by number of games owned (gaming experience)
    newcomers = df[games_owned < 50]  # < 50 games
    casual = df[(games_owned >= 50) & (games_owned < 200)]  # 50-200 games
    experienced = df[(games_owned >= 200) & (games_owned < 500)]  # 200-500 games
    veterans = df[games_owned >= 500]  # 500+ games

    return {
        "newcomers": {
            "count": len(newcomers),
            "recommendation_rate": get_recommendation_rate(newcomers),
        },
        "casual": {
            "count": len(casual),
            "recommendation_rate": get_recommendation_rate(casual),
        },
        "experienced": {
            "count": len(experienced),
            "recommendation_rate": get_recommendation_rate(experienced),
        },
        "veterans": {
            "count": len(veterans),
            "recommendation_rate": get_recommendation_rate(veterans),
        },
    }


def purchase_type_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze differences between Steam purchasers and key/free users."""
    if df.empty:
        return {
            "steam_buyers": {"count": 0, "pain_point_rate": 0.0, "feature_request_rate": 0.0},
            "key_users": {"count": 0, "pain_point_rate": 0.0, "feature_request_rate": 0.0},
            "free_users": {"count": 0, "pain_point_rate": 0.0, "feature_request_rate": 0.0},
        }

    steam_buyers = df[df["steam_purchase"] == True]  # noqa: E712
    key_users = df[(df["steam_purchase"] == False) & (df["received_for_free"] == False)]  # noqa: E712
    free_users = df[df["received_for_free"] == True]  # noqa: E712

    def analyze_purchase_segment(segment_df):
        if segment_df.empty:
            return {"count": 0, "feature_request_rate": 0.0, "recommendation_rate": 0.0}

        feature_request_rate = 0.0
        if "llm_request_subcategories" in segment_df.columns:
            feature_request_rate = float(
                segment_df["llm_request_subcategories"].apply(lambda v: isinstance(v, list) and len(v) > 0).mean()
            )

        recommendation_rate = float(segment_df["voted_up"].mean()) if "voted_up" in segment_df.columns else 0.0

        return {
            "count": len(segment_df),
            "feature_request_rate": feature_request_rate,
            "recommendation_rate": recommendation_rate,
        }

    return {
        "steam_buyers": analyze_purchase_segment(steam_buyers),
        "key_users": analyze_purchase_segment(key_users),
        "free_users": analyze_purchase_segment(free_users),
    }


def engagement_based_topics(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze recommendation rate by game playtime (engagement with THIS game).

    ENGAGEMENT = how much time they played this specific game.
    Uses same playtime buckets as dashboard filter:
    - Low: < 2 hours (< 120 minutes)
    - Medium: 2-20 hours (120-1200 minutes)
    - High: 20+ hours (>= 1200 minutes)
    """
    def get_recommendation_rate(segment_df):
        if segment_df.empty or "voted_up" not in segment_df.columns:
            return 0.0
        return float(segment_df["voted_up"].mean())

    if df.empty:
        return {
            "highly_engaged": {"count": 0, "recommendation_rate": 0.0},
            "moderately_engaged": {"count": 0, "recommendation_rate": 0.0},
            "low_engagement": {"count": 0, "recommendation_rate": 0.0},
        }

    minutes = df["author_playtime_forever"].fillna(0)

    # Match dashboard filter categories
    highly_engaged = df[minutes >= 1200]  # 20+ hours
    moderately_engaged = df[(minutes >= 120) & (minutes < 1200)]  # 2-20 hours
    low_engagement = df[minutes < 120]  # <2 hours

    return {
        "highly_engaged": {
            "count": len(highly_engaged),
            "recommendation_rate": get_recommendation_rate(highly_engaged),
        },
        "moderately_engaged": {
            "count": len(moderately_engaged),
            "recommendation_rate": get_recommendation_rate(moderately_engaged),
        },
        "low_engagement": {
            "count": len(low_engagement),
            "recommendation_rate": get_recommendation_rate(low_engagement),
        },
    }


def activity_based_feedback(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze feedback from currently active vs inactive players."""
    if df.empty:
        return {
            "currently_active": {"count": 0, "pain_point_rate": 0.0, "recommendation_rate": 0.0},
            "recently_stopped": {"count": 0, "pain_point_rate": 0.0, "recommendation_rate": 0.0},
            "inactive": {"count": 0, "pain_point_rate": 0.0, "recommendation_rate": 0.0},
        }

    recent_playtime = df["author_playtime_last_two_weeks"].fillna(0)

    currently_active = df[recent_playtime > 0]  # Played in last 2 weeks
    recently_stopped = df[(recent_playtime == 0) & (df["author_playtime_forever"] > 0)]  # Have playtime but not recent
    inactive = df[df["author_playtime_forever"].fillna(0) == 0]  # No playtime recorded

    def analyze_activity_segment(segment_df):
        if segment_df.empty:
            return {"count": 0, "recommendation_rate": 0.0, "issue_count": 0}

        recommendation_rate = float(segment_df["voted_up"].mean()) if "voted_up" in segment_df.columns else 0.0

        issue_count = 0
        if "llm_issue_subcategories" in segment_df.columns:
            issue_count = int(segment_df["llm_issue_subcategories"].apply(lambda v: isinstance(v, list) and len(v) > 0).sum())

        return {
            "count": len(segment_df),
            "recommendation_rate": recommendation_rate,
            "issue_count": issue_count,
        }

    return {
        "currently_active": analyze_activity_segment(currently_active),
        "recently_stopped": analyze_activity_segment(recently_stopped),
        "inactive": analyze_activity_segment(inactive),
    }


def platform_segment_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Segment reviews by platform: Steam Deck vs Desktop.

    Uses the primarily_steam_deck flag to identify Steam Deck players.
    Returns metrics comparing both platforms including recommendation rates,
    top issues, and control/performance-related feedback.
    """
    if df.empty:
        return {
            "steam_deck": {"count": 0, "recommendation_rate": 0.0, "top_issues": [], "issue_count": 0},
            "desktop": {"count": 0, "recommendation_rate": 0.0, "top_issues": [], "issue_count": 0},
        }

    # Check if column exists
    if "primarily_steam_deck" not in df.columns:
        # Treat all as desktop if column missing
        return {
            "steam_deck": {"count": 0, "recommendation_rate": 0.0, "top_issues": [], "issue_count": 0},
            "desktop": _analyze_platform_segment(df),
        }

    deck_reviews = df[df["primarily_steam_deck"] == True]  # noqa: E712
    desktop_reviews = df[df["primarily_steam_deck"] == False]  # noqa: E712

    return {
        "steam_deck": _analyze_platform_segment(deck_reviews),
        "desktop": _analyze_platform_segment(desktop_reviews),
    }


def _analyze_platform_segment(segment_df: pd.DataFrame) -> Dict[str, Any]:
    """Helper to analyze a platform segment."""
    if segment_df.empty:
        return {"count": 0, "recommendation_rate": 0.0, "top_issues": [], "issue_count": 0}

    recommendation_rate = float(segment_df["voted_up"].mean()) if "voted_up" in segment_df.columns else 0.0

    top_issues = []
    if "llm_issue_subcategories" in segment_df.columns:
        exploded = segment_df["llm_issue_subcategories"].explode()
        if not exploded.empty:
            counts = exploded.dropna().value_counts().head(5)
            top_issues = [{"category": cat, "count": int(count)} for cat, count in counts.items()]

    issue_count = 0
    if "llm_issue_subcategories" in segment_df.columns:
        issue_count = int(segment_df["llm_issue_subcategories"].apply(lambda v: isinstance(v, list) and len(v) > 0).sum())

    return {
        "count": len(segment_df),
        "recommendation_rate": recommendation_rate,
        "top_issues": top_issues,
        "issue_count": issue_count,
    }


def language_segment_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Segment reviews by language/region.

    Groups reviews by language and calculates per-language metrics.
    Useful for identifying regional pain points and localization issues.
    """
    if df.empty or "language" not in df.columns:
        return {"languages": [], "total_languages": 0}

    language_stats = []
    for lang in df["language"].unique():
        if pd.isna(lang):
            continue
        lang_df = df[df["language"] == lang]
        if lang_df.empty:
            continue

        recommendation_rate = float(lang_df["voted_up"].mean()) if "voted_up" in lang_df.columns else 0.0

        top_issues = []
        if "llm_issue_subcategories" in lang_df.columns:
            exploded = lang_df["llm_issue_subcategories"].explode()
            if not exploded.empty:
                counts = exploded.dropna().value_counts().head(5)
                top_issues = [{"category": cat, "count": int(count)} for cat, count in counts.items()]

        issue_count = 0
        if "llm_issue_subcategories" in lang_df.columns:
            issue_count = int(lang_df["llm_issue_subcategories"].apply(lambda v: isinstance(v, list) and len(v) > 0).sum())

        language_stats.append({
            "language": str(lang),
            "count": len(lang_df),
            "recommendation_rate": recommendation_rate,
            "top_issues": top_issues,
            "issue_count": issue_count,
        })

    # Sort by count descending
    language_stats.sort(key=lambda x: x["count"], reverse=True)

    return {
        "languages": language_stats[:15],  # Top 15 languages
        "total_languages": len(language_stats),
    }


def quality_weighted_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Weight insights by review helpfulness (votes_up).

    Highly-voted reviews likely represent common pain points.
    Returns top issues weighted by helpfulness votes.
    """
    if df.empty or "votes_up" not in df.columns:
        return {
            "high_quality_reviews": 0,
            "avg_helpfulness": 0.0,
            "weighted_top_issues": [],
            "weighted_recommendation_rate": 0.0,
        }

    # Filter to reviews with significant helpfulness (votes_up >= 5)
    high_quality = df[df["votes_up"] >= 5]
    if high_quality.empty:
        high_quality = df[df["votes_up"] >= 1]  # Fallback to at least 1 vote

    if high_quality.empty:
        return {
            "high_quality_reviews": 0,
            "avg_helpfulness": float(df["votes_up"].mean()),
            "weighted_top_issues": [],
            "weighted_recommendation_rate": float(df["voted_up"].mean()) if "voted_up" in df.columns else 0.0,
        }

    # Calculate weighted recommendation rate (by helpfulness)
    if "voted_up" in high_quality.columns:
        weights = high_quality["votes_up"].fillna(1)
        weighted_sum = (high_quality["voted_up"].astype(float) * weights).sum()
        total_weight = weights.sum()
        weighted_recommendation_rate = float(weighted_sum / total_weight) if total_weight > 0 else 0.0
    else:
        weighted_recommendation_rate = 0.0

    # Get weighted top issues
    weighted_issues: Dict[str, float] = {}
    if "llm_issue_subcategories" in high_quality.columns:
        for _, row in high_quality.iterrows():
            issues = row.get("llm_issue_subcategories")
            if not isinstance(issues, list):
                continue
            weight = float(row.get("votes_up", 1) or 1)
            for issue in issues:
                if isinstance(issue, str):
                    weighted_issues[issue] = weighted_issues.get(issue, 0) + weight

    # Sort by weighted count
    sorted_issues = sorted(weighted_issues.items(), key=lambda x: x[1], reverse=True)[:10]
    weighted_top_issues = [{"category": cat, "weighted_count": round(count, 1)} for cat, count in sorted_issues]

    return {
        "high_quality_reviews": len(high_quality),
        "avg_helpfulness": float(df["votes_up"].mean()),
        "weighted_top_issues": weighted_top_issues,
        "weighted_recommendation_rate": weighted_recommendation_rate,
    }


def cross_segment_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze segments for notable patterns in recommendation rates.

    Finds segments with significantly different recommendation rates from average.
    E.g., "Veterans" or "Steam Deck players" with notably higher/lower satisfaction.
    """
    if df.empty:
        return {"cross_segments": [], "notable_findings": []}

    cross_segments = []
    notable_findings = []

    minutes = df["author_playtime_forever"].fillna(0)

    # Define single-segment analyses (NOT combined with positive/negative)
    # These segments can have varying recommendation rates
    segment_analyses = [
        ("Newcomers", minutes < 120, "info"),
        ("Casual Players", (minutes >= 120) & (minutes < 1200), "info"),
        ("Experienced Players", (minutes >= 1200) & (minutes < 6000), "info"),
        ("Veterans", minutes >= 6000, "info"),
        ("Steam Deck Players", df.get("primarily_steam_deck", pd.Series([False] * len(df))).fillna(False) == True, "info"),  # noqa: E712
        ("Key Redeemers", (df.get("steam_purchase", pd.Series([True] * len(df))).fillna(True) == False) & (df.get("received_for_free", pd.Series([False] * len(df))).fillna(False) == False), "info"),  # noqa: E712
        ("Early Access Reviewers", df.get("written_during_early_access", pd.Series([False] * len(df))).fillna(False) == True, "info"),  # noqa: E712
        ("Post-Release Reviewers", df.get("written_during_early_access", pd.Series([True] * len(df))).fillna(True) == False, "info"),  # noqa: E712
        ("Influential Reviewers", df.get("votes_up", pd.Series([0] * len(df))).fillna(0) >= 10, "info"),
        ("Steam Purchasers", df.get("steam_purchase", pd.Series([True] * len(df))).fillna(True) == True, "info"),  # noqa: E712
    ]

    overall_rec_rate = float(df["voted_up"].mean()) if "voted_up" in df.columns else 0.5
    total_reviews = len(df)

    for label, mask, base_severity in segment_analyses:
        try:
            segment_df = df[mask]
        except Exception:
            continue

        if len(segment_df) < 5:  # Need minimum sample
            continue

        top_issues = []
        if "llm_issue_subcategories" in segment_df.columns:
            exploded = segment_df["llm_issue_subcategories"].explode()
            if not exploded.empty:
                counts = exploded.dropna().value_counts().head(3)
                top_issues = [{"category": cat, "count": int(count)} for cat, count in counts.items()]

        recommendation_rate = float(segment_df["voted_up"].mean()) if "voted_up" in segment_df.columns else 0.0
        share_of_total = len(segment_df) / total_reviews if total_reviews > 0 else 0

        # Determine severity based on difference from average
        diff = recommendation_rate - overall_rec_rate
        if diff <= -0.15:
            severity = "critical" if diff <= -0.25 else "warning"
        elif diff >= 0.15:
            severity = "success"
        else:
            severity = base_severity

        segment_data = {
            "label": label,
            "segments": [label.lower().replace(" ", "_")],
            "count": len(segment_df),
            "recommendation_rate": recommendation_rate,
            "top_issues": top_issues,
            "severity": severity,
        }
        cross_segments.append(segment_data)

        # Check for notable findings (significantly different from average)
        if len(segment_df) >= 5:
            diff = recommendation_rate - overall_rec_rate
            if abs(diff) >= 0.10:  # 10%+ difference is notable (lowered from 15%)
                direction = "lower" if diff < 0 else "higher"
                # Generate more descriptive findings
                if diff < 0:
                    if abs(diff) >= 0.30:
                        insight = f"Critical: {label} are significantly less satisfied ({abs(diff)*100:.0f}% below average)"
                    else:
                        insight = f"{label} show {abs(diff)*100:.0f}% lower satisfaction than overall"
                else:
                    if abs(diff) >= 0.30:
                        insight = f"Highlight: {label} are highly satisfied ({abs(diff)*100:.0f}% above average)"
                    else:
                        insight = f"{label} show {abs(diff)*100:.0f}% higher satisfaction than overall"

                notable_findings.append({
                    "segment": label,
                    "finding": insight,
                    "count": len(segment_df),
                    "recommendation_rate": recommendation_rate,
                    "overall_rate": overall_rec_rate,
                    "diff": diff,
                    "severity": severity,
                    "top_issues": top_issues[:3],
                    "share_of_total": share_of_total,
                })

    # Sort notable findings by absolute difference (most significant first)
    notable_findings.sort(key=lambda x: abs(x.get("diff", 0)), reverse=True)

    return {
        "cross_segments": cross_segments,
        "notable_findings": notable_findings[:8],  # Limit to top 8 most notable
    }
