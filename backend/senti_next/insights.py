"""High-level insight builders for Steam review analysis."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional, List

import numpy as np
import pandas as pd
import ollama

from .analysis import (
    early_access_vs_release_sentiment,
    free_vs_paid_sentiment,
    helpfulness_summary,
    market_quality_signal,
    playtime_segment_sentiment,
    recommended_share_over_time,
    recommendation_rate,
    reviewer_influence_sentiment,
    summarize_playtime,
    summarize_sentiment,
    core_fan_disappointment,
    refund_risk_index,
    churn_signal_rate,
    veteran_benchmarking,
    experience_level_issues,
    purchase_type_insights,
    engagement_based_topics,
    activity_based_feedback,
)
from . import storage
import hashlib

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("SENTINEXT_EMBEDDING_MODEL", "embeddinggemma")
_EMBEDDING_CACHE: dict[tuple[str, str], np.ndarray] = {}


def _frame_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    return json.loads(
        df.to_json(orient="records", date_format="iso", date_unit="s")
    )


def _get_embedding(text: str, model: Optional[str] = None) -> np.ndarray:
    """Get embedding vector for text using Ollama."""
    model_name = model or EMBEDDING_MODEL
    key = hashlib.sha256(f"{model_name}:{text}".encode("utf-8")).hexdigest()

    persisted = storage.load_embedding(key, model_name)
    if persisted is not None:
        return np.array(persisted)

    cache_key = (model_name, text)
    cached = _EMBEDDING_CACHE.get(cache_key)
    if cached is not None:
        return cached
    try:
        response = ollama.embeddings(model=model_name, prompt=text)
        vector = np.array(response["embedding"])
        storage.upsert_embedding(key, model_name, response["embedding"])
        # Basic LRU behaviour: clear cache if it grows unbounded
        if len(_EMBEDDING_CACHE) >= 512:
            _EMBEDDING_CACHE.clear()
        _EMBEDDING_CACHE[cache_key] = vector
        return vector
    except Exception as e:
        logger.warning(f"Failed to get embedding for '{text}': {e}")
        return None


def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    if vec1 is None or vec2 is None:
        return 0.0
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot_product / (norm1 * norm2)


def _cluster_similar_issues(issues: list[dict[str, Any]], similarity_threshold: float = 0.75) -> list[dict[str, Any]]:
    """Cluster similar issues using embeddings and merge them.

    Args:
        issues: List of issue dicts with 'issue', 'count', 'critical_count', 'high_count'
        similarity_threshold: Cosine similarity threshold for clustering (0.75 = moderate, 0.85 = very similar)

    Returns:
        Clustered list where similar issues are merged with combined counts
    """
    if not issues or len(issues) <= 1:
        logger.debug("Skipping clustering: only %d issue(s)", len(issues))
        return issues

    logger.debug("Starting clustering of %d issues with threshold %.2f", len(issues), similarity_threshold)

    # Get embeddings for all issues
    issue_texts = [item["issue"] for item in issues]
    embeddings = []

    for text in issue_texts:
        emb = _get_embedding(text)
        embeddings.append(emb)

    if not any(emb is not None for emb in embeddings):
        logger.debug("Skipping clustering: no embeddings available")
        return issues

    # Cluster similar issues
    clusters = []
    used_indices = set()

    for i, emb_i in enumerate(embeddings):
        if i in used_indices or emb_i is None:
            continue

        # Start new cluster with this issue
        cluster = {
            "representative": issues[i]["issue"],
            "count": issues[i]["count"],
            "critical_count": issues[i]["critical_count"],
            "high_count": issues[i]["high_count"],
            "variations": [issues[i]["issue"]],
            "examples": list(issues[i].get("examples", []))[:5],
            "review_ids": list(issues[i].get("review_ids", []))[:5],
        }

        # Copy over category fields if present
        if "llm_main_category" in issues[i]:
            cluster["llm_main_category"] = issues[i]["llm_main_category"]
        if "llm_subcategory" in issues[i]:
            cluster["llm_subcategory"] = issues[i]["llm_subcategory"]

        used_indices.add(i)

        # Find similar issues
        for j, emb_j in enumerate(embeddings):
            if j in used_indices or j <= i or emb_j is None:
                continue

            similarity = _cosine_similarity(emb_i, emb_j)

            if similarity >= similarity_threshold:
                # Merge into this cluster
                cluster["count"] += issues[j]["count"]
                cluster["critical_count"] += issues[j]["critical_count"]
                cluster["high_count"] += issues[j]["high_count"]
                cluster["variations"].append(issues[j]["issue"])
                # Keep a small sample of examples and review ids for drilldown
                cluster["examples"].extend(issues[j].get("examples", [])[:3])
                cluster["review_ids"].extend(issues[j].get("review_ids", [])[:3])
                used_indices.add(j)
                logger.debug("Clustered '%s' with '%s' (similarity: %.3f)", issues[j]['issue'], issues[i]['issue'], similarity)

        clusters.append(cluster)

    # Sort by count descending
    clusters.sort(key=lambda x: x["count"], reverse=True)

    # Convert back to original format (keeping representative as 'issue')
    result = []
    for cluster in clusters:
        item = {
            "issue": cluster["representative"],
            "count": cluster["count"],
            "critical_count": cluster["critical_count"],
            "high_count": cluster["high_count"],
        }

        # Add category fields if present
        if "llm_main_category" in cluster:
            item["llm_main_category"] = cluster["llm_main_category"]
        if "llm_subcategory" in cluster:
            item["llm_subcategory"] = cluster["llm_subcategory"]

        # Add variations for debugging (optional)
        if len(cluster["variations"]) > 1:
            item["variations"] = cluster["variations"]
        if cluster.get("examples"):
            item["examples"] = cluster["examples"][:5]
        if cluster.get("review_ids"):
            item["review_ids"] = cluster["review_ids"][:8]

        result.append(item)

    logger.debug("Clustered %d issues into %d clusters", len(issues), len(result))
    return result


def aggregate_standardized_issues(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Aggregate standardized issues (v8) by category.

    Returns aggregated issues with counts, severity distribution, and example.
    """
    if df is None or df.empty or "llm_issues" not in df.columns:
        return []

    # Explode issues lists into individual rows
    issues_df = df[["llm_issues", "llm_urgency"]].copy()
    issues_df["llm_issues"] = issues_df["llm_issues"].apply(
        lambda value: value if isinstance(value, list) else []
    )

    exploded = issues_df.explode("llm_issues")
    exploded = exploded[exploded["llm_issues"].notna()].copy()

    if exploded.empty:
        return []

    # Parse issue objects
    def parse_issue(issue_obj):
        if isinstance(issue_obj, dict):
            return issue_obj
        return None

    exploded["parsed"] = exploded["llm_issues"].apply(parse_issue)
    exploded = exploded[exploded["parsed"].notna()].copy()

    if exploded.empty:
        return []

    # Extract fields
    exploded["category"] = exploded["parsed"].apply(lambda x: x.get("category", ""))
    exploded["severity"] = exploded["parsed"].apply(lambda x: x.get("severity", "medium"))
    exploded["example"] = exploded["parsed"].apply(lambda x: x.get("example", ""))

    # Filter out empty categories
    exploded = exploded[exploded["category"] != ""].copy()

    if exploded.empty:
        return []

    # Group by category
    grouped = exploded.groupby("category", as_index=False).agg(
        count=("category", "size"),
        critical_count=("severity", lambda s: (s == "critical").sum()),
        high_count=("severity", lambda s: (s == "high").sum()),
        medium_count=("severity", lambda s: (s == "medium").sum()),
        low_count=("severity", lambda s: (s == "low").sum()),
        example=("example", lambda s: next((x for x in s if x), "")),  # First non-empty example
    )

    # Sort by count descending
    grouped = grouped.sort_values("count", ascending=False)

    # Convert to list of dicts
    issues_list = json.loads(grouped.to_json(orient="records"))

    return issues_list


def aggregate_standardized_feature_requests(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Aggregate standardized feature requests (v8) by category.

    Returns aggregated feature requests with counts, demand distribution, and example.
    """
    if df is None or df.empty or "llm_feature_requests" not in df.columns:
        return []

    # Explode feature_requests lists into individual rows
    requests_df = df[["llm_feature_requests"]].copy()
    requests_df["llm_feature_requests"] = requests_df["llm_feature_requests"].apply(
        lambda value: value if isinstance(value, list) else []
    )

    exploded = requests_df.explode("llm_feature_requests")
    exploded = exploded[exploded["llm_feature_requests"].notna()].copy()

    if exploded.empty:
        return []

    # Parse request objects
    def parse_request(request_obj):
        if isinstance(request_obj, dict):
            return request_obj
        return None

    exploded["parsed"] = exploded["llm_feature_requests"].apply(parse_request)
    exploded = exploded[exploded["parsed"].notna()].copy()

    if exploded.empty:
        return []

    # Extract fields
    exploded["category"] = exploded["parsed"].apply(lambda x: x.get("category", ""))
    exploded["demand"] = exploded["parsed"].apply(lambda x: x.get("demand", "medium"))
    exploded["example"] = exploded["parsed"].apply(lambda x: x.get("example", ""))

    # Filter out empty categories
    exploded = exploded[exploded["category"] != ""].copy()

    if exploded.empty:
        return []

    # Group by category
    grouped = exploded.groupby("category", as_index=False).agg(
        count=("category", "size"),
        high_demand_count=("demand", lambda s: (s == "high").sum()),
        medium_demand_count=("demand", lambda s: (s == "medium").sum()),
        low_demand_count=("demand", lambda s: (s == "low").sum()),
        example=("example", lambda s: next((x for x in s if x), "")),  # First non-empty example
    )

    # Sort by count descending
    grouped = grouped.sort_values("count", ascending=False)

    # Convert to list of dicts
    requests_list = json.loads(grouped.to_json(orient="records"))

    return requests_list


def build_issue_clusters(df: pd.DataFrame, similarity_threshold: float = 0.8) -> list[dict[str, Any]]:
    """Cluster issues with embeddings and attach representative examples + review ids."""
    if df is None or df.empty or "llm_issues" not in df.columns:
        return []

    issues_df = df[["review_id", "llm_issues", "llm_urgency", "llm_main_category", "llm_subcategory"]].copy()
    issues_df["llm_issues"] = issues_df["llm_issues"].apply(lambda value: value if isinstance(value, list) else [])

    exploded = issues_df.explode("llm_issues")
    exploded = exploded[exploded["llm_issues"].notna()].copy()
    if exploded.empty:
        return []

    parsed_rows: list[dict[str, Any]] = []
    for _, row in exploded.iterrows():
        issue_obj = row["llm_issues"]
        if isinstance(issue_obj, dict):
            issue_text = issue_obj.get("example") or issue_obj.get("category") or ""
            category = issue_obj.get("category", "")
            if not issue_text:
                continue
            parsed_rows.append(
                {
                    "issue": issue_text,
                    "count": 1,
                    "critical_count": 1 if row.get("llm_urgency") == "critical" else 0,
                    "high_count": 1 if row.get("llm_urgency") == "high" else 0,
                    "examples": [issue_text],
                    "review_ids": [row.get("review_id")],
                    "llm_main_category": row.get("llm_main_category") or "other",
                    "llm_subcategory": row.get("llm_subcategory") or "general",
                    "category": category,
                }
            )
    if not parsed_rows:
        return []

    # Aggregate identical issues first
    aggregate: dict[str, dict[str, Any]] = {}
    for item in parsed_rows:
        key = item["issue"].strip().lower()
        if key not in aggregate:
            aggregate[key] = item
        else:
            agg = aggregate[key]
            agg["count"] += 1
            agg["critical_count"] += item["critical_count"]
            agg["high_count"] += item["high_count"]
            agg["examples"].extend(item["examples"])
            agg["review_ids"].extend(item["review_ids"])

    base_list = list(aggregate.values())
    clustered = _cluster_similar_issues(base_list, similarity_threshold=similarity_threshold)

    # Post-process samples
    for cluster in clustered:
        cluster["examples"] = cluster.get("examples", [])[:3]
        cluster["review_ids"] = cluster.get("review_ids", [])[:5]

    return clustered


def version_based_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze issues and features by game version (Early Access vs Release).

    Returns insights split by written_during_early_access flag.
    """
    if df is None or df.empty or "written_during_early_access" not in df.columns:
        return {}

    results = {}

    # Split by early access status
    ea_reviews = df[df["written_during_early_access"] == True].copy()  # noqa: E712
    release_reviews = df[df["written_during_early_access"] == False].copy()  # noqa: E712

    for status, reviews_df in [("early_access", ea_reviews), ("release", release_reviews)]:
        if reviews_df.empty:
            continue

        # Basic metrics
        total_reviews = len(reviews_df)
        recommendation_rate = float(reviews_df["voted_up"].mean()) if "voted_up" in reviews_df.columns else 0.0

        # Top 5 issues (standardized)
        top_issues = []
        if "llm_issues" in reviews_df.columns:
            issues_data = aggregate_standardized_issues(reviews_df)
            top_issues = issues_data[:5] if issues_data else []

        # Top 5 feature requests
        top_requests = []
        if "llm_feature_requests" in reviews_df.columns:
            requests_data = aggregate_standardized_feature_requests(reviews_df)
            top_requests = requests_data[:5] if requests_data else []

        # Top categories
        category_counts = {}
        if "llm_main_category" in reviews_df.columns:
            category_counts = reviews_df["llm_main_category"].value_counts().head(3).to_dict()

        results[status] = {
            "total_reviews": total_reviews,
            "recommendation_rate": recommendation_rate,
            "top_issues": top_issues,
            "top_feature_requests": top_requests,
            "top_categories": category_counts,
        }

    return results


def category_trend_over_time(df: pd.DataFrame, freq: str = "W") -> Dict[str, list]:
    """Calculate time series of issue counts by main category.

    Returns dict with category names as keys and list of {period, count} dicts as values.
    """
    if df is None or df.empty or "created_at" not in df.columns or "llm_main_category" not in df.columns:
        return {}

    if "llm_issues" not in df.columns:
        return {}

    # Filter to reviews with issues
    df_with_issues = df[df["llm_issues"].apply(
        lambda x: isinstance(x, list) and len(x) > 0
    )].copy()

    if df_with_issues.empty:
        return {}

    ts_df = df_with_issues.dropna(subset=["created_at", "llm_main_category"]).copy()
    if ts_df.empty:
        return {}

    # Get date range from first to last review
    min_date = ts_df["created_at"].min()
    max_date = ts_df["created_at"].max()

    # Create complete date range
    date_range = pd.date_range(start=min_date, end=max_date, freq=freq)

    category_trends = {}
    for category in ts_df["llm_main_category"].unique():
        cat_df = ts_df[ts_df["llm_main_category"] == category]

        # Group by period and count
        trend = cat_df.set_index("created_at").resample(freq).size()

        # Reindex to include all periods in date range
        trend = trend.reindex(date_range, fill_value=0).reset_index()
        trend.columns = ["period", "count"]
        trend["period"] = trend["period"].dt.strftime("%Y-%m-%d")

        category_trends[category] = json.loads(trend.to_json(orient="records"))

    return category_trends


def prepare_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Build a JSON-serialisable insight payload for the given review frame."""
    if df is None or df.empty:
        metrics = summarize_sentiment(df)
        default_metrics = {
            **metrics,
            "feature_request_rate": 0.0,
            "critical_issues": 0,
            "high_priority": 0,
            "coverage_rate": 0.0,
        }
        return {
            "metrics": default_metrics,
            "llm": {
                "feature_request_rate": 0.0,
                "critical_issues": 0,
                "high_priority": 0,
                "coverage_rate": 0.0,
            },
            "category_breakdown": {},
            "playtime": summarize_playtime(df),
            "helpful": helpfulness_summary(df),
            "recommendation": recommendation_rate(df),
            "sentiment_counts": [],
            "trend": [],
            "segments": {
                "early_access_vs_release": [],
                "free_vs_paid": [],
                "playtime_buckets": [],
            },
            "audience": {
                "reviewer_influence": [],
                "veteran_benchmarking": [],
                "market_quality": [],
            },
            "risk": {
                "refund_risk": 0.0,
                "core_fan_disappointment": 0.0,
                "churn_window_default": 0,
                "churn_rate": 0.0,
            },
            "theme": derive_theme(metrics),
            "clustered_issues": [],
        }

    metrics = summarize_sentiment(df)
    playtime = summarize_playtime(df)
    helpful = helpfulness_summary(df)
    recommendation = recommendation_rate(df)

    # LLM-derived actionable metrics
    feature_request_rate = float(
        df["llm_feature_request"].fillna(False).astype(bool).mean()
    ) if "llm_feature_request" in df.columns else 0.0

    labeled_mask = df["llm_main_category"].notna() if "llm_main_category" in df.columns else pd.Series([False] * len(df))
    coverage_rate = float(labeled_mask.mean()) if len(labeled_mask) else 0.0

    # Urgency metrics
    critical_issues = 0
    high_priority = 0
    if "llm_urgency" in df.columns:
        critical_issues = int((df["llm_urgency"] == "critical").sum())
        high_priority = int((df["llm_urgency"] == "high").sum())

    # Hierarchical category breakdown (only reviews WITH structured issues)
    category_breakdown = {}
    category_recommendation_rates = {}
    if "llm_main_category" in df.columns and "llm_subcategory" in df.columns and "llm_issues" in df.columns:
        # Filter to only reviews that have structured issues
        df_with_issues = df[df["llm_issues"].apply(
            lambda x: isinstance(x, list) and len(x) > 0
        )].copy()

        if not df_with_issues.empty:
            for main_cat in df_with_issues["llm_main_category"].dropna().unique():
                main_df = df_with_issues[df_with_issues["llm_main_category"] == main_cat]
                if not main_df.empty:
                    subcats = {}
                    for subcat in main_df["llm_subcategory"].dropna().unique():
                        count = int((main_df["llm_subcategory"] == subcat).sum())
                        if count > 0:
                            subcats[subcat] = count
                    if subcats:
                        category_breakdown[main_cat] = subcats

                    # Calculate recommendation rate for this category
                    recommendation_rate_cat = float(main_df["voted_up"].mean()) if "voted_up" in main_df.columns else 0.0
                    category_recommendation_rates[main_cat] = {
                        "rate": recommendation_rate_cat,
                        "count": len(main_df),
                        "recommended": int(main_df["voted_up"].sum()) if "voted_up" in main_df.columns else 0,
                        "not_recommended": int((~main_df["voted_up"]).sum()) if "voted_up" in main_df.columns else 0,
                    }

    metrics.update(
        {
            "feature_request_rate": feature_request_rate,
            "critical_issues": critical_issues,
            "high_priority": high_priority,
        }
    )

    # Derive sentiment counts from voted_up (thumbs up/down)
    sentiment_counts = pd.DataFrame([
        {"sentiment": "positive", "count": int(df["voted_up"].sum())},
        {"sentiment": "negative", "count": int((~df["voted_up"]).sum())},
    ])

    trend_df = recommended_share_over_time(df)


    llm_summary = {
        "feature_request_rate": feature_request_rate,
        "critical_issues": critical_issues,
        "high_priority": high_priority,
        "coverage_rate": coverage_rate,
    }

    insights = {
        "metrics": metrics,
        "llm": llm_summary,
        "category_breakdown": category_breakdown,
        "category_recommendation_rates": category_recommendation_rates,
        "category_trend": category_trend_over_time(df),
        "version_insights": version_based_insights(df),
        "playtime": playtime,
        "helpful": helpful,
        "recommendation": recommendation,
        "sentiment_counts": _frame_records(sentiment_counts),
        "trend": _frame_records(trend_df),
        "segments": {
            "early_access_vs_release": _frame_records(early_access_vs_release_sentiment(df)),
            "free_vs_paid": _frame_records(free_vs_paid_sentiment(df)),
            "playtime_buckets": _frame_records(playtime_segment_sentiment(df)),
        },
        "audience": {
            "reviewer_influence": _frame_records(reviewer_influence_sentiment(df)),
            "veteran_benchmarking": _frame_records(veteran_benchmarking(df)),
            "market_quality": _frame_records(market_quality_signal(df)),
        },
        "risk": {
            "refund_risk": refund_risk_index(df),
            "core_fan_disappointment": core_fan_disappointment(df),
            "churn_window_default": 7,
            "churn_rate": churn_signal_rate(df, window_days=7),
        },
        "standardized_issues": aggregate_standardized_issues(df) if "llm_issues" in df.columns else [],
        "feature_requests": aggregate_standardized_feature_requests(df) if "llm_feature_requests" in df.columns else [],
        "clustered_issues": build_issue_clusters(df),
        "player_segments": {
            "experience_level": experience_level_issues(df),
            "purchase_type": purchase_type_insights(df),
            "engagement_topics": engagement_based_topics(df),
            "activity_status": activity_based_feedback(df),
        },
        "theme": derive_theme(metrics),
    }

    return insights


def derive_theme(metrics: Dict[str, float]) -> Dict[str, Any]:
    """Create a color palette derived from sentiment distribution."""
    positive_share = metrics.get("share_positive", 0.0)
    negative_share = metrics.get("share_negative", 0.0)

    if positive_share >= 0.6 and positive_share - negative_share >= 0.25:
        theme_name = "Aurora"
        gradient = ["#0ea5e9", "#6366f1", "#03111f"]
        palette = {
            "accent": "#38bdf8",
            "secondary": "#6366f1",
            "positive": "#6366f1",
            "neutral": "#cbd5f5",
            "negative": "#fa8072",
            "surface": "#082f49",
            "surface_alt": "#0f172a",
            "border": "rgba(148,163,184,0.25)",
        }
    elif negative_share >= 0.45:
        theme_name = "Inferno"
        gradient = ["#f97316", "#fa8072", "#111827"]
        palette = {
            "accent": "#f97316",
            "secondary": "#fa8072",
            "positive": "#6366f1",
            "neutral": "#fca5a5",
            "negative": "#fa8072",
            "surface": "#1f1b2e",
            "surface_alt": "#111827",
            "border": "rgba(248,113,113,0.25)",
        }
    else:
        theme_name = "Twilight"
        gradient = ["#6366f1", "#22d3ee", "#0b1120"]
        palette = {
            "accent": "#6366f1",
            "secondary": "#22d3ee",
            "positive": "#6366f1",
            "neutral": "#cbd5f5",
            "negative": "#fa8072",
            "surface": "#151635",
            "surface_alt": "#0f172a",
            "border": "rgba(129,140,248,0.25)",
        }

    return {
        "name": theme_name,
        "gradient": gradient,
        "palette": palette,
    }
