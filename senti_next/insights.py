"""High-level insight builders for Steam review analysis."""
from __future__ import annotations

import json
from typing import Any, Dict

import pandas as pd

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
)
from .analysis import core_fan_disappointment, refund_risk_index
from .analysis import churn_signal_rate
from .analysis import veteran_benchmarking


def _frame_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    return json.loads(
        df.to_json(orient="records", date_format="iso", date_unit="s")
    )


def prepare_insights(df: pd.DataFrame) -> Dict[str, Any]:
    """Build a JSON-serialisable insight payload for the given review frame."""
    if df is None or df.empty:
        metrics = summarize_sentiment(df)
        default_metrics = {
            **metrics,
            "pain_point_rate": 0.0,
            "feature_request_rate": 0.0,
            "avg_confidence": 0.0,
        }
        return {
            "metrics": default_metrics,
            "llm": {
                "pain_point_rate": 0.0,
                "feature_request_rate": 0.0,
                "avg_confidence": 0.0,
            },
            "playtime": summarize_playtime(df),
            "helpful": helpfulness_summary(df),
            "recommendation": recommendation_rate(df),
            "sentiment_counts": [],
            "trend": [],
            "confidence_trend": [],
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
            "topics": {
                "overall": [],
                "positive": [],
                "negative": [],
            },
            "topic_catalog": [],
            "theme": derive_theme(metrics),
        }

    metrics = summarize_sentiment(df)
    playtime = summarize_playtime(df)
    helpful = helpfulness_summary(df)
    recommendation = recommendation_rate(df)

    pain_point_rate = float(
        df["llm_pain_point"].fillna(False).astype(bool).mean()
    ) if "llm_pain_point" in df.columns else 0.0
    feature_request_rate = float(
        df["llm_feature_request"].fillna(False).astype(bool).mean()
    ) if "llm_feature_request" in df.columns else 0.0
    avg_confidence = float(
        df["llm_confidence"].fillna(0.0).astype(float).mean()
    ) if "llm_confidence" in df.columns else 0.0

    metrics.update(
        {
            "pain_point_rate": pain_point_rate,
            "feature_request_rate": feature_request_rate,
            "avg_confidence": avg_confidence,
        }
    )

    sentiment_counts = (
        df["sentiment_label"]
        .value_counts()
        .rename_axis("sentiment")
        .reset_index(name="count")
    )

    trend_df = recommended_share_over_time(df)

    confidence_trend_df = pd.DataFrame()
    if (
        "created_at" in df.columns
        and "llm_confidence" in df.columns
        and df["created_at"].notna().any()
    ):
        confidence_trend_df = (
            df.dropna(subset=["created_at"])  # type: ignore[arg-type]
            .set_index("created_at")
            .sort_index()
            .resample("7D")
            .agg(
                avg_confidence=("llm_confidence", "mean"),
                pain_point_rate=("llm_pain_point", "mean"),
                feature_request_rate=("llm_feature_request", "mean"),
                reviews=("llm_confidence", "count"),
            )
            .reset_index()
        )
        confidence_trend_df.rename(columns={"created_at": "period"}, inplace=True)
        for col in ["avg_confidence", "pain_point_rate", "feature_request_rate"]:
            confidence_trend_df[col] = confidence_trend_df[col].fillna(0.0)

    topics_overall = pd.DataFrame()
    topics_positive = pd.DataFrame()
    topics_negative = pd.DataFrame()
    topic_catalog: list[str] = []

    if "llm_topics" in df.columns:
        topic_source = df[[
            "llm_topics",
            "llm_sentiment",
            "llm_pain_point",
            "llm_feature_request",
            "llm_confidence",
        ]].copy()

        topic_source["llm_topics"] = topic_source["llm_topics"].apply(
            lambda value: value
            if isinstance(value, list)
            else ([value] if isinstance(value, str) and value else [])
        )

        exploded = topic_source.explode("llm_topics")
        if not exploded.empty:
            exploded = exploded.dropna(subset=["llm_topics"]).copy()
            exploded["topic"] = exploded["llm_topics"].astype(str)

            grouped = (
                exploded.groupby("topic", as_index=False)
                .agg(
                    count=("topic", "size"),
                    pain_point_rate=("llm_pain_point", "mean"),
                    feature_request_rate=("llm_feature_request", "mean"),
                    avg_confidence=("llm_confidence", "mean"),
                    positive=("llm_sentiment", lambda s: (s == "positive").sum()),
                    neutral=("llm_sentiment", lambda s: (s == "neutral").sum()),
                    negative=("llm_sentiment", lambda s: (s == "negative").sum()),
                )
            )

            if not grouped.empty:
                total_mentions = grouped["count"].sum() or 1
                grouped["share"] = grouped["count"] / total_mentions
                grouped["share_positive"] = grouped.apply(
                    lambda row: (row["positive"] / row["count"]) if row["count"] else 0.0,
                    axis=1,
                )
                grouped["share_negative"] = grouped.apply(
                    lambda row: (row["negative"] / row["count"]) if row["count"] else 0.0,
                    axis=1,
                )
                grouped["pain_point_rate"] = grouped["pain_point_rate"].fillna(0.0)
                grouped["feature_request_rate"] = grouped["feature_request_rate"].fillna(0.0)
                grouped["avg_confidence"] = grouped["avg_confidence"].fillna(0.0)

                topics_overall = grouped.sort_values(
                    by=["count", "share_positive"], ascending=[False, False]
                ).head(15)[
                    [
                        "topic",
                        "count",
                        "share",
                        "share_positive",
                        "share_negative",
                        "pain_point_rate",
                        "feature_request_rate",
                        "avg_confidence",
                    ]
                ]

                topics_positive = grouped[grouped["positive"] > 0].sort_values(
                    by=["share_positive", "count"], ascending=[False, False]
                ).head(10)[
                    [
                        "topic",
                        "count",
                        "share_positive",
                        "pain_point_rate",
                        "feature_request_rate",
                    ]
                ]

                topics_negative = grouped[grouped["negative"] > 0].sort_values(
                    by=["share_negative", "count"], ascending=[False, False]
                ).head(10)[
                    [
                        "topic",
                        "count",
                        "share_negative",
                        "pain_point_rate",
                        "feature_request_rate",
                    ]
                ]

                topic_catalog = grouped["topic"].sort_values().tolist()

    llm_summary = {
        "pain_point_rate": pain_point_rate,
        "feature_request_rate": feature_request_rate,
        "avg_confidence": avg_confidence,
    }

    insights = {
        "metrics": metrics,
        "llm": llm_summary,
        "playtime": playtime,
        "helpful": helpful,
        "recommendation": recommendation,
        "sentiment_counts": _frame_records(sentiment_counts),
        "trend": _frame_records(trend_df),
        "confidence_trend": _frame_records(confidence_trend_df),
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
        "topics": {
            "overall": _frame_records(topics_overall),
            "positive": _frame_records(topics_positive),
            "negative": _frame_records(topics_negative),
        },
        "topic_catalog": topic_catalog,
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
