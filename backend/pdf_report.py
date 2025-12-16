from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any, Dict, Iterable, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_pct(value: Optional[float]) -> str:
    if value is None:
        return "—"
    try:
        return f"{float(value) * 100:.0f}%"
    except Exception:
        return "—"


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def render_insights_pdf(
    *,
    app_id: int,
    game_name: str,
    metadata: Dict[str, Any],
    insights: Dict[str, Any],
) -> bytes:
    """Render a readable PDF report from the aggregated insights dict."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"SentiNext Report - {app_id}",
    )

    styles = getSampleStyleSheet()
    story = []

    generated_at = datetime.utcnow().isoformat() + "Z"
    story.append(Paragraph(f"<b>SentiNext Insights Report</b>", styles["Title"]))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            f"<b>Game</b>: {_safe_text(game_name)} (app {app_id})<br/>"
            f"<b>Generated</b>: {generated_at}",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 12))

    metrics = insights.get("metrics", {}) if isinstance(insights, dict) else {}
    llm_metrics = insights.get("llm", {}) if isinstance(insights, dict) else {}

    overview_rows = [
        ["Requested reviews", _safe_text(metadata.get("requested", "—"))],
        ["Retrieved reviews", _safe_text(metadata.get("retrieved", "—"))],
        ["Language", _safe_text(metadata.get("language", "—"))],
        ["Fetched at", _safe_text(metadata.get("fetched_at", "—"))],
        ["Recommendation rate", _fmt_pct(insights.get("recommendation"))],
        ["Avg compound", _safe_text(metrics.get("average_compound", "—"))],
        ["Feature request rate", _fmt_pct(llm_metrics.get("feature_request_rate"))],
        ["Critical issues", _safe_text(llm_metrics.get("critical_issues", "—"))],
        ["LLM coverage", _fmt_pct(llm_metrics.get("coverage_rate"))],
    ]

    story.append(Paragraph("<b>Overview</b>", styles["Heading2"]))
    table = Table(overview_rows, colWidths=[65 * mm, 95 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                ("BOX", (0, 0), (-1, -1), 0.25, colors.grey),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 14))

    # Top standardized issues (aggregated)
    issues: Iterable[dict] = insights.get("standardized_issues") or []
    story.append(Paragraph("<b>Top Issues</b>", styles["Heading2"]))
    if not issues:
        story.append(Paragraph("No issues extracted.", styles["BodyText"]))
    else:
        issue_rows = [["Category", "Mentions", "Critical", "High", "Example"]]
        for item in list(issues)[:12]:
            issue_rows.append(
                [
                    _safe_text(item.get("category", "")),
                    _safe_text(item.get("count", 0)),
                    _safe_text(item.get("critical_count", 0)),
                    _safe_text(item.get("high_count", 0)),
                    _safe_text(item.get("example", ""))[:140],
                ]
            )
        issue_table = Table(issue_rows, colWidths=[38 * mm, 18 * mm, 16 * mm, 14 * mm, 74 * mm])
        issue_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("BOX", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(issue_table)
    story.append(Spacer(1, 14))

    # Feature requests
    requests = insights.get("standardized_feature_requests") or insights.get("feature_requests") or []
    story.append(Paragraph("<b>Top Feature Requests</b>", styles["Heading2"]))
    if not requests:
        story.append(Paragraph("No feature requests extracted.", styles["BodyText"]))
    else:
        req_rows = [["Category", "Mentions", "High demand", "Example"]]
        for item in list(requests)[:12]:
            req_rows.append(
                [
                    _safe_text(item.get("category", "")),
                    _safe_text(item.get("count", 0)),
                    _safe_text(item.get("high_count", item.get("high_demand_count", 0))),
                    _safe_text(item.get("example", ""))[:160],
                ]
            )
        req_table = Table(req_rows, colWidths=[48 * mm, 18 * mm, 22 * mm, 72 * mm])
        req_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("BOX", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(req_table)

    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            "Generated by SentiNext. This report summarizes public Steam review feedback and may contain noise.",
            styles["Italic"],
        )
    )

    doc.build(story)
    return buffer.getvalue()

