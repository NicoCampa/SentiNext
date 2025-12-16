from __future__ import annotations

from datetime import datetime
import json
from io import BytesIO
from typing import Any, Dict, Iterable, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

import requests
from PIL import Image as PILImage

from .senti_next.insights import get_embedding_preview, embedding_model_name


def _fetch_steam_header_image(url: str) -> Optional[bytes]:
    if not url:
        return None

    allowed_prefixes = (
        "https://cdn.akamai.steamstatic.com/",
        "https://shared.akamai.steamstatic.com/",
        "https://steamcdn-a.akamaihd.net/",
    )
    if not url.startswith(allowed_prefixes):
        return None

    try:
        resp = requests.get(url, timeout=8)
        if resp.status_code != 200:
            return None
        content_type = (resp.headers.get("content-type") or "").lower()
        if "image" not in content_type:
            return None
        return resp.content
    except Exception:
        return None


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
    game_image_url: Optional[str] = None,
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

    def heading(text: str) -> None:
        story.append(Paragraph(f"<b>{_safe_text(text)}</b>", styles["Heading2"]))

    def subheading(text: str) -> None:
        story.append(Paragraph(f"<b>{_safe_text(text)}</b>", styles["Heading3"]))

    def paragraph(text: str) -> None:
        story.append(Paragraph(_safe_text(text), styles["BodyText"]))

    def kv_table(rows: list[list[Any]], *, col_widths: Optional[list[float]] = None) -> Table:
        table = Table(rows, colWidths=col_widths)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("BOX", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8.8),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        return table

    def records_table(
        *,
        title: str,
        records: list[dict],
        columns: list[str],
        max_rows: int = 20,
        col_widths: Optional[list[float]] = None,
    ) -> None:
        heading(title)
        if not records:
            paragraph("No data available.")
            story.append(Spacer(1, 10))
            return

        rows = [columns]
        for item in records[:max_rows]:
            rows.append([_safe_text(item.get(key, "")) for key in columns])
        story.append(kv_table(rows, col_widths=col_widths))
        if len(records) > max_rows:
            story.append(Spacer(1, 6))
            paragraph(f"Showing top {max_rows} rows out of {len(records)}.")
        story.append(Spacer(1, 14))

    def try_add_header_image() -> None:
        image_bytes = _fetch_steam_header_image(game_image_url or "")
        if not image_bytes:
            return

        try:
            with PILImage.open(BytesIO(image_bytes)) as img:
                width_px, height_px = img.size
        except Exception:
            return

        max_width = doc.width
        max_height = 46 * mm
        scaled_height = max_width * (height_px / width_px)
        if scaled_height > max_height:
            scaled_height = max_height
            scaled_width = scaled_height * (width_px / height_px)
        else:
            scaled_width = max_width

        story.append(Image(BytesIO(image_bytes), width=scaled_width, height=scaled_height))
        story.append(Spacer(1, 12))

    # Cover / headline
    try_add_header_image()

    metrics = insights.get("metrics", {}) if isinstance(insights, dict) else {}
    llm_metrics = insights.get("llm", {}) if isinstance(insights, dict) else {}

    theme = insights.get("theme") if isinstance(insights, dict) else None

    overview_rows = [
        ["Metric", "Value"],
        ["Requested reviews", _safe_text(metadata.get("requested", "—"))],
        ["Retrieved reviews", _safe_text(metadata.get("retrieved", "—"))],
        ["Language", _safe_text(metadata.get("language", "—"))],
        ["Fetched at", _safe_text(metadata.get("fetched_at", "—"))],
        ["Theme", _safe_text(theme or "—")],
        ["Recommendation rate", _fmt_pct(insights.get("recommendation"))],
        ["Avg compound", _safe_text(metrics.get("average_compound", "—"))],
        ["Feature request rate", _fmt_pct(llm_metrics.get("feature_request_rate"))],
        ["Critical issues", _safe_text(llm_metrics.get("critical_issues", "—"))],
        ["High priority", _safe_text(llm_metrics.get("high_priority", "—"))],
        ["LLM coverage", _fmt_pct(llm_metrics.get("coverage_rate"))],
    ]

    heading("Overview")
    story.append(kv_table(overview_rows, col_widths=[62 * mm, 98 * mm]))
    story.append(Spacer(1, 16))

    # Top standardized issues (aggregated)
    issues: Iterable[dict] = insights.get("standardized_issues") or []
    issue_records = list(issues) if issues else []
    records_table(
        title="Standardized Issues (Aggregated)",
        records=issue_records,
        columns=["category", "count", "critical_count", "high_count", "example"],
        max_rows=30,
        col_widths=[46 * mm, 16 * mm, 16 * mm, 16 * mm, 66 * mm],
    )

    # Feature requests
    requests = insights.get("standardized_feature_requests") or insights.get("feature_requests") or []
    req_records = list(requests) if requests else []
    records_table(
        title="Feature Requests (Aggregated)",
        records=req_records,
        columns=["category", "count", "high_demand_count", "medium_demand_count", "low_demand_count", "example"],
        max_rows=30,
        col_widths=[42 * mm, 14 * mm, 18 * mm, 18 * mm, 14 * mm, 54 * mm],
    )

    story.append(PageBreak())

    # Sentiment + engagement blocks
    heading("Sentiment & Engagement")
    playtime = insights.get("playtime") or {}
    helpful = insights.get("helpful") or {}

    metrics_rows = [
        ["Metric", "Value"],
        ["Recommendation rate", _fmt_pct(insights.get("recommendation"))],
        ["Avg compound", _safe_text(metrics.get("average_compound", "—"))],
        ["Median playtime (h)", _safe_text(playtime.get("median_playtime_hours", "—"))],
        ["Mean playtime (h)", _safe_text(playtime.get("mean_playtime_hours", "—"))],
        ["Median recent playtime (h)", _safe_text(playtime.get("median_recent_playtime_hours", "—"))],
        ["Avg helpful votes", _safe_text(helpful.get("avg_votes_up", "—"))],
        ["Avg funny votes", _safe_text(helpful.get("avg_votes_funny", "—"))],
    ]
    story.append(kv_table(metrics_rows, col_widths=[62 * mm, 98 * mm]))
    story.append(Spacer(1, 14))

    sentiment_counts = insights.get("sentiment_counts") or []
    records_table(
        title="Sentiment Counts",
        records=sentiment_counts if isinstance(sentiment_counts, list) else [],
        columns=["sentiment", "count"],
        max_rows=10,
        col_widths=[60 * mm, 100 * mm],
    )

    trend = insights.get("trend") or []
    if isinstance(trend, list) and trend:
        # Take the most recent periods
        records_table(
            title="Recommendation Trend",
            records=trend[-16:],
            columns=[k for k in (trend[0].keys() if isinstance(trend[0], dict) else [])][:3] or ["period", "recommendation_rate", "avg_compound"],
            max_rows=16,
        )

    story.append(PageBreak())

    # Category breakdown + segments
    heading("Categories & Segments")
    category_breakdown = insights.get("category_breakdown") or {}
    if isinstance(category_breakdown, dict) and category_breakdown:
        rows = [["main_category", "subcategories (count)"]]
        for main_cat, subcats in category_breakdown.items():
            if isinstance(subcats, dict):
                detail = ", ".join(f"{k}:{v}" for k, v in subcats.items())
            else:
                detail = _safe_text(subcats)
            rows.append([_safe_text(main_cat), detail])
        story.append(kv_table(rows, col_widths=[45 * mm, 115 * mm]))
        story.append(Spacer(1, 14))

    cat_rec = insights.get("category_recommendation_rates") or {}
    if isinstance(cat_rec, dict) and cat_rec:
        rows = [["main_category", "rate", "count", "recommended", "not_recommended"]]
        for main_cat, payload in cat_rec.items():
            if not isinstance(payload, dict):
                continue
            rows.append(
                [
                    _safe_text(main_cat),
                    _fmt_pct(payload.get("rate")),
                    _safe_text(payload.get("count", "")),
                    _safe_text(payload.get("recommended", "")),
                    _safe_text(payload.get("not_recommended", "")),
                ]
            )
        story.append(kv_table(rows, col_widths=[44 * mm, 20 * mm, 18 * mm, 30 * mm, 30 * mm]))
        story.append(Spacer(1, 14))

    segments = insights.get("segments") or {}
    if isinstance(segments, dict):
        for key, records in segments.items():
            if isinstance(records, list):
                columns = list(records[0].keys()) if records and isinstance(records[0], dict) else []
                if columns:
                    records_table(title=f"Segment: {key}", records=records, columns=columns, max_rows=12)

    story.append(PageBreak())

    # Risk + audience
    heading("Risk & Audience")
    risk = insights.get("risk") or {}
    if isinstance(risk, dict) and risk:
        rows = [["Metric", "Value"]] + [[k, _safe_text(v)] for k, v in risk.items()]
        story.append(kv_table(rows, col_widths=[62 * mm, 98 * mm]))
        story.append(Spacer(1, 14))

    audience = insights.get("audience") or {}
    if isinstance(audience, dict):
        for key, records in audience.items():
            if isinstance(records, list):
                columns = list(records[0].keys()) if records and isinstance(records[0], dict) else []
                if columns:
                    records_table(title=f"Audience: {key}", records=records, columns=columns, max_rows=12)

    story.append(PageBreak())

    # Version insights + player segments
    heading("Version & Player Segments")
    version_insights = insights.get("version_insights") or {}
    if isinstance(version_insights, dict) and version_insights:
        for version_key, payload in version_insights.items():
            if not isinstance(payload, dict):
                continue
            subheading(f"Version: {version_key}")
            rows = [["Metric", "Value"]]
            for k in ("total_reviews", "recommendation_rate"):
                if k in payload:
                    rows.append([k, _fmt_pct(payload[k]) if k.endswith("rate") else _safe_text(payload[k])])
            top_cats = payload.get("top_categories") or {}
            if isinstance(top_cats, dict) and top_cats:
                rows.append(["top_categories", ", ".join(f"{k}:{v}" for k, v in top_cats.items())])
            story.append(kv_table(rows, col_widths=[62 * mm, 98 * mm]))
            story.append(Spacer(1, 10))

            top_issues = payload.get("top_issues") or []
            if isinstance(top_issues, list) and top_issues:
                records_table(
                    title=f"Top issues ({version_key})",
                    records=top_issues,
                    columns=["category", "count", "critical_count", "high_count", "example"],
                    max_rows=10,
                    col_widths=[46 * mm, 16 * mm, 16 * mm, 16 * mm, 66 * mm],
                )

            top_requests = payload.get("top_feature_requests") or []
            if isinstance(top_requests, list) and top_requests:
                records_table(
                    title=f"Top feature requests ({version_key})",
                    records=top_requests,
                    columns=["category", "count", "high_demand_count", "medium_demand_count", "low_demand_count", "example"],
                    max_rows=10,
                )

    player_segments = insights.get("player_segments") or {}
    if isinstance(player_segments, dict) and player_segments:
        for seg_key, payload in player_segments.items():
            subheading(f"Player segment: {seg_key}")
            snippet = json.dumps(payload, indent=2, ensure_ascii=False)[:2200]
            story.append(Preformatted(snippet, styles["Code"]))
            story.append(Spacer(1, 10))

    story.append(PageBreak())

    # Embeddings section (debug + clusters)
    heading("Embeddings & Clusters")
    embeddings = insights.get("embeddings") or {}
    if isinstance(embeddings, dict) and embeddings:
        rows = [["Metric", "Value"]]
        rows.append(["embedding_model", _safe_text(embeddings.get("model", embedding_model_name()))])
        rows.append(["similarity_threshold", _safe_text(embeddings.get("threshold", "—"))])
        rows.append(["attempted", _safe_text(embeddings.get("attempted", "—"))])
        rows.append(["available", _safe_text(embeddings.get("available", "—"))])
        if embeddings.get("disabled"):
            rows.append(["clustering", "disabled"])
        story.append(kv_table(rows, col_widths=[62 * mm, 98 * mm]))
        story.append(Spacer(1, 14))

    clusters = insights.get("clustered_issues") or []
    if isinstance(clusters, list) and clusters:
        # Show all clusters (cap to avoid runaway PDFs)
        cluster_rows = [["issue", "count", "critical", "high", "variations"]]
        for item in clusters[:40]:
            variations = item.get("variations", [])
            var_text = ", ".join(variations[:4]) if isinstance(variations, list) else ""
            cluster_rows.append(
                [
                    _safe_text(item.get("issue", ""))[:70],
                    _safe_text(item.get("count", "")),
                    _safe_text(item.get("critical_count", "")),
                    _safe_text(item.get("high_count", "")),
                    _safe_text(var_text)[:80],
                ]
            )
        story.append(kv_table(cluster_rows, col_widths=[62 * mm, 14 * mm, 14 * mm, 14 * mm, 56 * mm]))
        story.append(Spacer(1, 12))

        subheading("Embedding previews (top clusters)")
        for item in clusters[:6]:
            text = _safe_text(item.get("issue", ""))
            preview = get_embedding_preview(text, dims=10)
            if not preview:
                continue
            paragraph(
                f"<font size=8><b>{_safe_text(text)[:80]}</b><br/>"
                f"dims={preview['dims']} preview={preview['preview']}</font>"
            )
            story.append(Spacer(1, 6))

    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            "Generated by SentiNext. This report summarizes public Steam review feedback and may contain noise.",
            styles["Italic"],
        )
    )

    doc.build(story)
    return buffer.getvalue()
