"""Generate executive summary reports for Steam review analysis."""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, Dict, List

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .analysis import summarize_playtime, summarize_sentiment

logger = logging.getLogger(__name__)


def get_available_months(app_id: int, user_id: str) -> List[Dict[str, Any]]:
    """Get list of months with review data for a game.

    Returns list of dicts with keys: year, month, label, review_count
    Ordered by most recent first, limited to last 24 months.
    """
    from . import db as db_module
    from sqlalchemy import text

    with db_module.get_connection() as conn:
        result = conn.execute(
            text("""
                SELECT
                    EXTRACT(YEAR FROM created_at)::int as year,
                    EXTRACT(MONTH FROM created_at)::int as month,
                    COUNT(*) as review_count
                FROM reviews
                WHERE app_id = :app_id
                    AND created_at IS NOT NULL
                GROUP BY year, month
                ORDER BY year DESC, month DESC
                LIMIT 24
            """),
            {"app_id": app_id},
        )

        rows = result.fetchall()

        months = []
        for row in rows:
            year, month, count = row
            # Format label like "January 2024"
            dt = datetime(int(year), int(month), 1)
            label = dt.strftime("%B %Y")
            months.append({
                "year": int(year),
                "month": int(month),
                "label": label,
                "review_count": int(count),
            })

        return months


def filter_reviews_by_month(reviews_df: pd.DataFrame, year: int, month: int) -> pd.DataFrame:
    """Filter reviews DataFrame to specific month using created_at field."""
    if reviews_df.empty or "created_at" not in reviews_df.columns:
        return pd.DataFrame()

    # Filter by year and month
    mask = (reviews_df["created_at"].dt.year == year) & (reviews_df["created_at"].dt.month == month)
    return reviews_df[mask].copy()


def calculate_monthly_insights(reviews_df: pd.DataFrame) -> Dict[str, Any]:
    """Calculate insights for filtered reviews.

    Returns subset of InsightsResponse with:
    - Core metrics: recommendation_rate, share_positive/negative, average_compound
    - Risk metrics: refund_risk, core_fan_disappointment
    - Top issues (top 5 by count with evidence snippets)
    - Top requests (top 5 by count with evidence snippets)
    - Player segments: experience_level breakdown
    - Trend: weekly recommendation_rate within month
    """
    if reviews_df.empty:
        return {
            "total_reviews": 0,
            "recommendation_rate": 0.0,
            "sentiment": {
                "average_compound": 0.0,
                "share_positive": 0.0,
                "share_negative": 0.0,
            },
            "playtime": {
                "median_playtime_hours": 0.0,
                "mean_playtime_hours": 0.0,
            },
            "top_issues": [],
            "top_requests": [],
            "player_segments": [],
            "weekly_trend": [],
            "refund_risk": 0.0,
            "core_fan_disappointment": 0.0,
        }

    # Core metrics
    total_reviews = len(reviews_df)
    recommendation_rate = float(reviews_df["voted_up"].mean()) if "voted_up" in reviews_df.columns else 0.0

    # Sentiment
    sentiment = summarize_sentiment(reviews_df)

    # Playtime
    playtime = summarize_playtime(reviews_df)

    # Top issues
    top_issues = []
    if "llm_issue_subcategories" in reviews_df.columns and "llm_subcategory_evidence" in reviews_df.columns:
        issue_data = {}
        for _, row in reviews_df.iterrows():
            issue_subcats = row.get("llm_issue_subcategories")
            if not isinstance(issue_subcats, list) or not issue_subcats:
                continue

            evidence = row.get("llm_subcategory_evidence") or {}
            if not isinstance(evidence, dict):
                evidence = {}

            voted_up = row.get("voted_up", True)

            for subcat in issue_subcats:
                if subcat not in issue_data:
                    issue_data[subcat] = {
                        "subcategory": subcat,
                        "count": 0,
                        "recommended": 0,
                        "snippets": [],
                    }

                issue_data[subcat]["count"] += 1
                if voted_up:
                    issue_data[subcat]["recommended"] += 1

                # Collect evidence snippets
                snippets = evidence.get(subcat)
                if isinstance(snippets, list):
                    for snippet in snippets:
                        text = str(snippet).replace("\n", " ").strip()[:120]
                        if text and text not in issue_data[subcat]["snippets"]:
                            issue_data[subcat]["snippets"].append(text)

        # Sort by count and get top 5
        issues_list = list(issue_data.values())
        issues_list.sort(key=lambda x: x["count"], reverse=True)
        top_issues = issues_list[:5]

        # Add recommendation rate
        for issue in top_issues:
            count = issue["count"]
            recommended = issue["recommended"]
            issue["recommendation_rate"] = float(recommended / count) if count > 0 else 0.0
            # Limit snippets to 2
            issue["snippets"] = issue["snippets"][:2]

    # Top requests
    top_requests = []
    if "llm_request_subcategories" in reviews_df.columns and "llm_subcategory_evidence" in reviews_df.columns:
        request_data = {}
        for _, row in reviews_df.iterrows():
            request_subcats = row.get("llm_request_subcategories")
            if not isinstance(request_subcats, list) or not request_subcats:
                continue

            evidence = row.get("llm_subcategory_evidence") or {}
            if not isinstance(evidence, dict):
                evidence = {}

            voted_up = row.get("voted_up", True)

            for subcat in request_subcats:
                if subcat not in request_data:
                    request_data[subcat] = {
                        "subcategory": subcat,
                        "count": 0,
                        "recommended": 0,
                        "snippets": [],
                    }

                request_data[subcat]["count"] += 1
                if voted_up:
                    request_data[subcat]["recommended"] += 1

                # Collect evidence snippets
                snippets = evidence.get(subcat)
                if isinstance(snippets, list):
                    for snippet in snippets:
                        text = str(snippet).replace("\n", " ").strip()[:120]
                        if text and text not in request_data[subcat]["snippets"]:
                            request_data[subcat]["snippets"].append(text)

        # Sort by count and get top 5
        requests_list = list(request_data.values())
        requests_list.sort(key=lambda x: x["count"], reverse=True)
        top_requests = requests_list[:5]

        # Add recommendation rate
        for request in top_requests:
            count = request["count"]
            recommended = request["recommended"]
            request["recommendation_rate"] = float(recommended / count) if count > 0 else 0.0
            # Limit snippets to 2
            request["snippets"] = request["snippets"][:2]

    # Player segments by experience level
    player_segments = []
    if "llm_experience_level" in reviews_df.columns:
        segments_data = reviews_df.groupby("llm_experience_level").agg({
            "voted_up": ["count", "sum"]
        }).reset_index()

        for _, row in segments_data.iterrows():
            segment = row["llm_experience_level"]
            count = int(row["voted_up"]["count"])
            recommended = int(row["voted_up"]["sum"])
            rec_rate = float(recommended / count) if count > 0 else 0.0

            player_segments.append({
                "segment": segment,
                "count": count,
                "recommendation_rate": rec_rate,
            })

    # Weekly trend
    weekly_trend = []
    if "created_at" in reviews_df.columns and "voted_up" in reviews_df.columns:
        try:
            weekly = reviews_df.set_index("created_at").resample("W")["voted_up"].agg(["mean", "count"])
            for date, row in weekly.iterrows():
                if row["count"] > 0:
                    weekly_trend.append({
                        "week": date.strftime("%Y-%m-%d"),
                        "recommendation_rate": float(row["mean"]),
                        "count": int(row["count"]),
                    })
        except Exception as e:
            logger.warning(f"Failed to calculate weekly trend: {e}")

    # Risk metrics (reuse logic from insights.py)
    from .analysis import refund_risk_index, core_fan_disappointment

    refund_risk = refund_risk_index(reviews_df)
    core_fan_disappointment_score = core_fan_disappointment(reviews_df)

    return {
        "total_reviews": total_reviews,
        "recommendation_rate": recommendation_rate,
        "sentiment": sentiment,
        "playtime": playtime,
        "top_issues": top_issues,
        "top_requests": top_requests,
        "player_segments": player_segments,
        "weekly_trend": weekly_trend,
        "refund_risk": refund_risk,
        "core_fan_disappointment": core_fan_disappointment_score,
    }


def create_pdf_report(data: Dict[str, Any], game_name: str, period: str) -> bytes:
    """Generate PDF executive summary report using ReportLab.

    PDF Structure:
    - Page 1: Cover & Overview
    - Page 2: Sentiment Analysis
    - Page 3: Top Issues
    - Page 4: Top Feature Requests
    - Page 5: Player Segments
    - Page 6: Executive Recommendations
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=inch,
        rightMargin=inch,
    )

    styles = getSampleStyleSheet()
    story = []

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontSize=24,
        textColor=colors.HexColor("#0EA5E9"),
        spaceAfter=12,
    )

    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#38bdf8"),
        spaceAfter=10,
    )

    body_style = ParagraphStyle(
        "CustomBody",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#E2E8F0"),
    )

    # Page 1: Cover & Overview
    title = Paragraph(f"Executive Summary: {game_name}", title_style)
    story.append(title)

    subtitle = Paragraph(f"Report Period: {period}", styles["Heading2"])
    story.append(subtitle)
    story.append(Spacer(1, 0.5 * inch))

    # Key metrics summary
    sentiment = data.get("sentiment", {})
    playtime = data.get("playtime", {})

    metrics_data = [
        ["Metric", "Value"],
        ["Total Reviews", str(data.get("total_reviews", 0))],
        ["Recommendation Rate", f"{data.get('recommendation_rate', 0):.1%}"],
        ["Average Sentiment", f"{sentiment.get('average_compound', 0):.2f}"],
        ["Median Playtime", f"{playtime.get('median_playtime_hours', 0):.1f} hours"],
    ]

    metrics_table = Table(metrics_data, colWidths=[3 * inch, 3 * inch])
    metrics_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 12),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
            ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
            ("TOPPADDING", (0, 1), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ])
    )

    story.append(metrics_table)
    story.append(PageBreak())

    # Page 2: Sentiment Analysis
    story.append(Paragraph("Overall Sentiment Trends", heading_style))
    story.append(Spacer(1, 0.2 * inch))

    sentiment_data = [
        ["Metric", "Value"],
        ["Positive Share", f"{sentiment.get('share_positive', 0):.1%}"],
        ["Negative Share", f"{sentiment.get('share_negative', 0):.1%}"],
        ["Refund Risk Index", f"{data.get('refund_risk', 0):.2f}"],
        ["Core Fan Disappointment", f"{data.get('core_fan_disappointment', 0):.2f}"],
    ]

    sentiment_table = Table(sentiment_data, colWidths=[3 * inch, 3 * inch])
    sentiment_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 12),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
            ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
            ("TOPPADDING", (0, 1), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ])
    )

    story.append(sentiment_table)
    story.append(Spacer(1, 0.3 * inch))

    # Weekly trend table
    weekly_trend = data.get("weekly_trend", [])
    if weekly_trend:
        story.append(Paragraph("Weekly Recommendation Rates", body_style))
        story.append(Spacer(1, 0.1 * inch))

        trend_data = [["Week", "Recommendation Rate", "Reviews"]]
        for week in weekly_trend[:4]:  # Show first 4 weeks
            trend_data.append([
                week["week"],
                f"{week['recommendation_rate']:.1%}",
                str(week["count"]),
            ])

        trend_table = Table(trend_data, colWidths=[2 * inch, 2 * inch, 2 * inch])
        trend_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
                ("TOPPADDING", (0, 1), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ])
        )
        story.append(trend_table)

    story.append(PageBreak())

    # Page 3: Top Issues
    story.append(Paragraph("Critical Issues Identified", heading_style))
    story.append(Spacer(1, 0.2 * inch))

    top_issues = data.get("top_issues", [])
    if top_issues:
        issues_data = [["Category", "Mentions", "Rec. Rate"]]
        for issue in top_issues:
            issues_data.append([
                issue["subcategory"],
                str(issue["count"]),
                f"{issue['recommendation_rate']:.1%}",
            ])

        issues_table = Table(issues_data, colWidths=[3 * inch, 1.5 * inch, 1.5 * inch])
        issues_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
                ("TOPPADDING", (0, 1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
            ])
        )
        story.append(issues_table)
        story.append(Spacer(1, 0.3 * inch))

        # Evidence snippets for top 3 issues
        story.append(Paragraph("Evidence Samples", body_style))
        story.append(Spacer(1, 0.1 * inch))

        for issue in top_issues[:3]:
            story.append(Paragraph(f"<b>{issue['subcategory']}</b>", body_style))
            for snippet in issue.get("snippets", [])[:2]:
                story.append(Paragraph(f"• \"{snippet}\"", body_style))
            story.append(Spacer(1, 0.1 * inch))
    else:
        story.append(Paragraph("No critical issues identified in this period.", body_style))

    story.append(PageBreak())

    # Page 4: Top Feature Requests
    story.append(Paragraph("Most Requested Features", heading_style))
    story.append(Spacer(1, 0.2 * inch))

    top_requests = data.get("top_requests", [])
    if top_requests:
        requests_data = [["Feature Request", "Mentions", "Rec. Rate"]]
        for request in top_requests:
            requests_data.append([
                request["subcategory"],
                str(request["count"]),
                f"{request['recommendation_rate']:.1%}",
            ])

        requests_table = Table(requests_data, colWidths=[3 * inch, 1.5 * inch, 1.5 * inch])
        requests_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
                ("TOPPADDING", (0, 1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
            ])
        )
        story.append(requests_table)
        story.append(Spacer(1, 0.3 * inch))

        # Evidence snippets for top 3 requests
        story.append(Paragraph("Evidence Samples", body_style))
        story.append(Spacer(1, 0.1 * inch))

        for request in top_requests[:3]:
            story.append(Paragraph(f"<b>{request['subcategory']}</b>", body_style))
            for snippet in request.get("snippets", [])[:2]:
                story.append(Paragraph(f"• \"{snippet}\"", body_style))
            story.append(Spacer(1, 0.1 * inch))
    else:
        story.append(Paragraph("No feature requests identified in this period.", body_style))

    story.append(PageBreak())

    # Page 5: Player Segments
    story.append(Paragraph("Player Feedback by Experience", heading_style))
    story.append(Spacer(1, 0.2 * inch))

    player_segments = data.get("player_segments", [])
    if player_segments:
        segments_data = [["Segment", "Reviews", "Rec. Rate"]]
        for segment in player_segments:
            segments_data.append([
                segment["segment"],
                str(segment["count"]),
                f"{segment['recommendation_rate']:.1%}",
            ])

        segments_table = Table(segments_data, colWidths=[2.5 * inch, 2 * inch, 2 * inch])
        segments_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 11),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#E2E8F0")),
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#475569")),
                ("TOPPADDING", (0, 1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
            ])
        )
        story.append(segments_table)
    else:
        story.append(Paragraph("No player segment data available for this period.", body_style))

    story.append(PageBreak())

    # Page 6: Executive Recommendations
    story.append(Paragraph("Key Takeaways", heading_style))
    story.append(Spacer(1, 0.2 * inch))

    recommendations = []

    # Highest priority issue
    if top_issues:
        top_issue = top_issues[0]
        recommendations.append(
            f"<b>Priority Issue:</b> {top_issue['subcategory']} mentioned in {top_issue['count']} reviews "
            f"({top_issue['recommendation_rate']:.1%} recommendation rate)"
        )

    # Most requested feature
    if top_requests:
        top_request = top_requests[0]
        recommendations.append(
            f"<b>Top Feature Request:</b> {top_request['subcategory']} requested in {top_request['count']} reviews"
        )

    # At-risk player segment
    if player_segments:
        # Find segment with lowest recommendation rate
        at_risk_segment = min(player_segments, key=lambda s: s["recommendation_rate"])
        if at_risk_segment["recommendation_rate"] < 0.7:
            recommendations.append(
                f"<b>At-Risk Segment:</b> {at_risk_segment['segment']} players show lower satisfaction "
                f"({at_risk_segment['recommendation_rate']:.1%} recommendation rate)"
            )

    # Positive highlight
    if data.get("recommendation_rate", 0) >= 0.8:
        recommendations.append(
            f"<b>Positive Trend:</b> Strong overall recommendation rate of {data['recommendation_rate']:.1%}"
        )
    elif sentiment.get("share_positive", 0) >= 0.7:
        recommendations.append(
            f"<b>Positive Sentiment:</b> {sentiment['share_positive']:.1%} of reviews are positive"
        )

    for rec in recommendations:
        story.append(Paragraph(f"• {rec}", body_style))
        story.append(Spacer(1, 0.15 * inch))

    # Build PDF
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes
