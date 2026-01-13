from __future__ import annotations

import base64
from datetime import datetime
import html
import json
from io import BytesIO
import math
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import requests
from PIL import Image as PILImage

try:
    from weasyprint import HTML
except Exception as exc:  # pragma: no cover - import error path
    HTML = None
    _WEASYPRINT_ERROR = exc
else:
    _WEASYPRINT_ERROR = None

COL_BG = "#0b1120"
COL_TEXT = "#f8fafc"
COL_MUTED = "#cbd5f5"
COL_MUTED_2 = "#94a3b8"
COL_BORDER = "rgba(129,140,248,0.25)"
COL_CARD = "rgba(15,23,42,0.78)"
COL_ACCENT = "#6366f1"
COL_ACCENT_2 = "#22d3ee"
COL_ACCENT_3 = "#ef4444"
CATEGORY_ACCENTS = {
    "gameplay": COL_ACCENT,
    "technical": COL_ACCENT_3,
    "content": COL_ACCENT_2,
    "interface": COL_ACCENT,
    "social": COL_ACCENT_2,
    "monetization": COL_ACCENT_3,
    "other": COL_ACCENT,
}

MAIN_CATEGORY_LABELS = {
    "gameplay": "Gameplay",
    "technical": "Technical",
    "content": "Content",
    "interface": "Interface",
    "social": "Social",
    "monetization": "Monetization",
    "other": "Other",
}


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _h(value: Any) -> str:
    return html.escape(_safe_text(value))


def _fmt_pct(value: Optional[float]) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value) * 100:.0f}%"
    except Exception:
        return "-"


def _fmt_float(value: Any, *, digits: int = 2) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.{digits}f}"
    except Exception:
        return _safe_text(value) or "-"


def _shorten(text: str, max_len: int = 44) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _try_register_ttf(font_name: str, ttf_path: Path) -> bool:
    return ttf_path.exists()


def _resolve_font_sources() -> tuple[str, str, str]:
    candidates: list[Path] = []
    env_dir = os.getenv("SENTINEXT_PDF_FONT_DIR")
    if env_dir:
        candidates.append(Path(env_dir).expanduser())
    candidates.append(Path(__file__).resolve().parent / "assets" / "fonts")
    candidates.append(Path.cwd() / "backend" / "assets" / "fonts")

    space = ""
    inter_regular = ""
    inter_bold = ""

    for font_dir in candidates:
        sg_variable = font_dir / "SpaceGrotesk-Variable.ttf"
        if _try_register_ttf("SpaceGrotesk", sg_variable):
            space = sg_variable.as_uri()
            break

    for font_dir in candidates:
        inter_regular_path = font_dir / "Inter-Regular.ttf"
        inter_bold_path = font_dir / "Inter-SemiBold.ttf"
        if _try_register_ttf("Inter", inter_regular_path) and _try_register_ttf("Inter-Bold", inter_bold_path):
            inter_regular = inter_regular_path.as_uri()
            inter_bold = inter_bold_path.as_uri()
            break

    return space, inter_regular, inter_bold


def _font_css() -> tuple[str, str]:
    space_uri, inter_regular_uri, inter_bold_uri = _resolve_font_sources()
    css_parts = []
    font_stack = []

    if space_uri:
        css_parts.append(
            "@font-face {"
            "font-family: 'Space Grotesk';"
            f"src: url('{space_uri}') format('truetype');"
            "font-weight: 300 700;"
            "font-style: normal;"
            "}"
        )
        font_stack.append("'Space Grotesk'")

    if inter_regular_uri and inter_bold_uri:
        css_parts.append(
            "@font-face {"
            "font-family: 'Inter';"
            f"src: url('{inter_regular_uri}') format('truetype');"
            "font-weight: 400;"
            "font-style: normal;"
            "}"
        )
        css_parts.append(
            "@font-face {"
            "font-family: 'Inter';"
            f"src: url('{inter_bold_uri}') format('truetype');"
            "font-weight: 600;"
            "font-style: normal;"
            "}"
        )
        font_stack.append("'Inter'")

    font_stack.extend(["Helvetica", "sans-serif"])
    return "\n".join(css_parts), ", ".join(font_stack)


def _fetch_steam_header_image(url: str) -> Optional[tuple[bytes, str]]:
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
        return resp.content, content_type.split(";")[0]
    except Exception:
        return None


def _image_data_uri(image_bytes: bytes, mime: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _render_donut_svg(pos: int, neg: int) -> str:
    total = max(1, int(pos) + int(neg))
    radius = 42
    circumference = 2 * math.pi * radius
    pos_len = circumference * (pos / total)
    neg_len = circumference * (neg / total)
    return (
        "<svg class='donut' viewBox='0 0 120 120' width='120' height='120'>"
        f"<circle cx='60' cy='60' r='{radius}' fill='none' stroke='rgba(148,163,184,0.2)' stroke-width='14' />"
        f"<circle cx='60' cy='60' r='{radius}' fill='none' stroke='{COL_ACCENT_2}' stroke-width='14' "
        f"stroke-dasharray='{pos_len:.2f} {circumference:.2f}' stroke-linecap='round' "
        "transform='rotate(-90 60 60)' />"
        f"<circle cx='60' cy='60' r='{radius}' fill='none' stroke='{COL_ACCENT_3}' stroke-width='14' "
        f"stroke-dasharray='{neg_len:.2f} {circumference:.2f}' stroke-dashoffset='-{pos_len:.2f}' "
        "stroke-linecap='round' transform='rotate(-90 60 60)' />"
        f"<circle cx='60' cy='60' r='22' fill='{COL_CARD}' />"
        "</svg>"
    )


def _render_sparkline_svg(values: list[float]) -> str:
    if len(values) < 2:
        values = [0.0, 0.0]

    width = 240
    height = 60
    min_v = min(values)
    max_v = max(values)
    span = (max_v - min_v) or 1.0

    points = []
    for i, v in enumerate(values):
        x = 4 + (width - 8) * (i / (len(values) - 1))
        y = height - 6 - (height - 12) * ((v - min_v) / span)
        points.append((x, y))

    polyline = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    area = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    area = f"4,{height - 6:.1f} {area} {width - 4:.1f},{height - 6:.1f}"

    return (
        f"<svg class='sparkline' viewBox='0 0 {width} {height}' width='{width}' height='{height}'>"
        f"<polygon points='{area}' fill='{COL_ACCENT}' opacity='0.18' />"
        f"<polyline points='{polyline}' fill='none' stroke='{COL_ACCENT}' stroke-width='2' />"
        f"<circle cx='{points[-1][0]:.1f}' cy='{points[-1][1]:.1f}' r='3' fill='{COL_ACCENT}' />"
        "</svg>"
    )


def _bar_list(items: list[dict], *, value_key: str, label_key: str, max_items: int, bar_color: str) -> str:
    if not items:
        return "<div class='empty'>No data available.</div>"

    trimmed = items[:max_items]
    max_value = 1
    for item in trimmed:
        try:
            max_value = max(max_value, int(item.get(value_key, 0) or 0))
        except Exception:
            continue

    rows = []
    for item in trimmed:
        raw_label = _safe_text(item.get(label_key, "")).replace("_", " ").strip() or "-"
        label = _shorten(raw_label, 40)
        try:
            value = int(item.get(value_key, 0) or 0)
        except Exception:
            value = 0
        width = int((value / max_value) * 100) if max_value else 0
        rows.append(
            "<div class='bar-row'>"
            f"<div class='bar-row-head'><span class='bar-label'>{_h(label)}</span>"
            f"<span class='bar-value'>{value}</span></div>"
            "<div class='bar-track'>"
            f"<div class='bar-fill' style='width:{width}%; background:{bar_color};'></div>"
            "</div>"
            "</div>"
        )
    return "<div class='bar-list'>" + "".join(rows) + "</div>"


def _cards_grid(cards: list[str], *, columns: int = 2) -> str:
    rows = []
    for idx in range(0, len(cards), columns):
        row_cards = cards[idx : idx + columns]
        if len(row_cards) < columns:
            row_cards.extend([""] * (columns - len(row_cards)))
        tds = "".join(f"<td class='grid-cell'>{card}</td>" for card in row_cards)
        rows.append(f"<tr>{tds}</tr>")
    return "<table class='grid'><tbody>" + "".join(rows) + "</tbody></table>"


def _html_table(headers: list[str], rows: list[list[Any]]) -> str:
    head = "".join(f"<th>{_h(header)}</th>" for header in headers)
    body_rows = []
    for row in rows:
        cells = "".join(f"<td>{_h(cell)}</td>" for cell in row)
        body_rows.append(f"<tr>{cells}</tr>")
    return "<table class='table'><thead><tr>" + head + "</tr></thead><tbody>" + "".join(body_rows) + "</tbody></table>"


def _records_table(records: list[dict], columns: list[str], max_rows: int = 20) -> str:
    if not records:
        return "<div class='muted'>No data available.</div>"
    rows = []
    for item in records[:max_rows]:
        rows.append([item.get(key, "") for key in columns])
    return _html_table(columns, rows)


def _dict_to_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    items = []
    for key, value in payload.items():
        try:
            count = int(value)
        except Exception:
            count = 0
        items.append({"category": str(key), "count": count})
    items.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
    return items


def _build_css(font_css: str, font_stack: str) -> str:
    return (
        font_css
        + f"""
@page {{
  size: A4;
  margin: 16mm 18mm 18mm;
  background: {COL_BG};
  @top-left {{
    content: string(report-title);
    font-size: 9px;
    color: {COL_MUTED_2};
  }}
  @top-right {{
    content: "SentiNext";
    font-size: 9px;
    color: {COL_MUTED_2};
  }}
  @bottom-right {{
    content: counter(page) " / " counter(pages);
    font-size: 9px;
    color: {COL_MUTED_2};
  }}
}}

@page:first {{
  background: {COL_BG};
  @top-left {{ content: ""; }}
  @top-right {{ content: ""; }}
  @bottom-right {{ content: ""; }}
}}

* {{
  box-sizing: border-box;
}}

html {{
  background: {COL_BG};
}}

body {{
  margin: 0;
  font-family: {font_stack};
  font-size: 11px;
  line-height: 1.5;
  color: {COL_TEXT};
  background:
    radial-gradient(900px circle at 12% 10%, rgba(99, 102, 241, 0.35), transparent 60%),
    radial-gradient(900px circle at 88% 0%, rgba(34, 211, 238, 0.25), transparent 58%),
    {COL_BG};
  widows: 2;
  orphans: 2;
}}

h1 {{
  font-size: 28px;
  margin: 0 0 8px;
  letter-spacing: -0.4px;
  string-set: report-title content(text);
}}

h2 {{
  font-size: 16px;
  margin: 0 0 8px;
}}

h3 {{
  font-size: 12px;
  margin: 0 0 6px;
}}

.muted {{
  color: {COL_MUTED_2};
}}

.empty {{
  color: {COL_MUTED_2};
  font-size: 9px;
}}

.kicker {{
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-size: 9px;
  color: {COL_MUTED_2};
}}

.cover {{
  border-radius: 16px;
  border: 1px solid {COL_BORDER};
  background: linear-gradient(120deg, rgba(99, 102, 241, 0.28), rgba(34, 211, 238, 0.18));
  padding: 16px;
  overflow: hidden;
}}

.meta {{
  margin-top: 6px;
  font-size: 9.5px;
  color: {COL_MUTED};
}}

.hero-image {{
  width: 100%;
  max-height: 130px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid {COL_BORDER};
  margin-bottom: 12px;
}}

.pill-row {{
  margin-top: 10px;
}}

.pill {{
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid {COL_BORDER};
  background: rgba(15, 23, 42, 0.55);
  font-size: 9px;
  font-weight: 600;
  color: {COL_MUTED};
  margin-right: 6px;
  margin-bottom: 6px;
}}

.cover,
.stat-card,
.card,
.bar-row {{
  break-inside: avoid;
}}

.card ol {{
  margin: 8px 0 0 18px;
  padding: 0;
}}

.card li {{
  margin-bottom: 6px;
}}

.stat-grid {{
  width: 100%;
  border-collapse: separate;
  border-spacing: 10px;
  margin-top: 10px;
}}

.stat-card {{
  background: {COL_CARD};
  border: 1px solid {COL_BORDER};
  border-radius: 12px;
  padding: 10px;
  overflow: hidden;
}}

.stat-number {{
  font-size: 16px;
  font-weight: 700;
}}

.stat-label {{
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: {COL_MUTED_2};
}}

.card {{
  background: {COL_CARD};
  border: 1px solid {COL_BORDER};
  border-radius: 12px;
  padding: 12px;
  overflow: hidden;
}}

.accent-bar {{
  height: 3px;
  border-radius: 999px;
  margin-bottom: 8px;
}}

.card-title {{
  font-weight: 700;
  margin-bottom: 4px;
}}

.card-meta {{
  font-size: 10px;
  color: {COL_MUTED};
  margin-bottom: 4px;
}}

.card-note {{
  font-size: 9px;
  color: {COL_MUTED_2};
}}

.card-quote {{
  margin-top: 8px;
  font-size: 9px;
  color: {COL_MUTED_2};
  padding-left: 8px;
  border-left: 2px solid {COL_BORDER};
}}

.grid {{
  width: 100%;
  border-collapse: separate;
  border-spacing: 12px;
}}

.grid-cell {{
  vertical-align: top;
}}

.section {{
  margin-top: 16px;
}}

.section-title {{
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}}

.section-title::after {{
  content: "";
  height: 1px;
  flex: 1;
  background: {COL_BORDER};
}}

.subsection-title {{
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 4px;
}}

.subsection-note {{
  font-size: 9px;
  color: {COL_MUTED_2};
  margin-bottom: 8px;
}}

.page-break {{
  page-break-before: always;
}}

.bar-list {{
  margin-top: 4px;
}}

.bar-row {{
  margin-bottom: 8px;
}}

.bar-row-head {{
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: {COL_MUTED};
  margin-bottom: 4px;
}}

.bar-label {{
  max-width: 70%;
}}

.bar-track {{
  width: 100%;
  height: 8px;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid {COL_BORDER};
  border-radius: 999px;
  overflow: hidden;
}}

.bar-fill {{
  height: 100%;
  border-radius: 999px;
}}

.progress-track {{
  width: 100%;
  height: 10px;
  border-radius: 999px;
  border: 1px solid {COL_BORDER};
  background: rgba(148, 163, 184, 0.12);
  overflow: hidden;
}}

.progress-fill {{
  height: 100%;
  border-radius: 999px;
}}

.table {{
  width: 100%;
  border-collapse: collapse;
  font-size: 9px;
}}

table {{
  page-break-inside: avoid;
}}

.table th {{
  text-align: left;
  padding: 6px;
  background: rgba(99, 102, 241, 0.25);
  color: {COL_TEXT};
  font-weight: 600;
}}

.table td {{
  padding: 6px;
  border: 1px solid {COL_BORDER};
  vertical-align: top;
}}

.donut {{
  width: 110px;
  height: 110px;
}}

.sparkline {{
  width: 100%;
  height: 60px;
}}

.code {{
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid {COL_BORDER};
  border-radius: 10px;
  padding: 10px;
  font-size: 8.5px;
  line-height: 1.4;
  white-space: pre-wrap;
}}

.footer-note {{
  margin-top: 18px;
  font-size: 9px;
  color: {COL_MUTED_2};
}}
"""
    )


def _render_html(
    *,
    app_id: int,
    game_name: str,
    metadata: Dict[str, Any],
    insights: Dict[str, Any],
    game_image_url: Optional[str] = None,
) -> str:
    font_css, font_stack = _font_css()
    css = _build_css(font_css, font_stack)

    image_html = ""
    image_payload = _fetch_steam_header_image(game_image_url or "")
    if image_payload:
        image_bytes, mime = image_payload
        try:
            with PILImage.open(BytesIO(image_bytes)) as img:
                img.verify()
            image_html = f"<img class='hero-image' src='{_image_data_uri(image_bytes, mime)}' alt='Steam header' />"
        except Exception:
            image_html = ""

    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    metrics = insights.get("metrics", {}) if isinstance(insights, dict) else {}
    llm_metrics = insights.get("llm", {}) if isinstance(insights, dict) else {}
    theme = insights.get("theme") if isinstance(insights, dict) else None
    theme_name = ""
    if isinstance(theme, dict):
        theme_name = _safe_text(theme.get("name") or "").strip()
    elif isinstance(theme, str):
        theme_name = theme.strip()
    if not theme_name:
        theme_name = "-"

    sentiment_counts = insights.get("sentiment_counts") or []
    sentiment_map = {}
    if isinstance(sentiment_counts, list):
        for row in sentiment_counts:
            if isinstance(row, dict) and row.get("sentiment"):
                sentiment_map[str(row["sentiment"]).lower()] = int(row.get("count", 0) or 0)
    pos = sentiment_map.get("positive") or sentiment_map.get("recommended") or sentiment_map.get("thumbs_up") or 0
    neg = sentiment_map.get("negative") or sentiment_map.get("not_recommended") or sentiment_map.get("thumbs_down") or 0
    rec_rate = float(insights.get("recommendation") or 0.0)

    trend = insights.get("trend") or []
    trend_series: list[float] = []
    try:
        if isinstance(trend, list):
            for row in trend[-18:]:
                if not isinstance(row, dict):
                    continue
                if int(row.get("reviews", 0) or 0) <= 0:
                    continue
                v = row.get("recommendation_rate")
                if v is None:
                    continue
                trend_series.append(float(v))
    except Exception:
        trend_series = []

    subcategory_insights = insights.get("subcategory_insights") or []
    subcat_records = list(subcategory_insights) if isinstance(subcategory_insights, list) else []
    subcategory_by_main: dict[str, list[dict]] = {}
    for entry in subcat_records:
        if not isinstance(entry, dict):
            continue
        main = _safe_text(entry.get("main_category") or "").strip().lower()
        if not main:
            raw = _safe_text(entry.get("subcategory") or "")
            if "/" in raw:
                main = raw.split("/", 1)[0].strip().lower()
            else:
                main = "other"
        subcategory_by_main.setdefault(main, []).append(entry)
    for entries in subcategory_by_main.values():
        entries.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)

    requested_count = 0
    retrieved_count = 0
    try:
        requested_count = int(metadata.get("requested") or 0)
    except Exception:
        requested_count = 0
    try:
        retrieved_count = int(metadata.get("retrieved") or 0)
    except Exception:
        retrieved_count = 0
    retrieval_rate = (retrieved_count / requested_count) if requested_count else 0.0
    fetched_at = _safe_text(metadata.get("fetched_at", "")).strip()
    language = _safe_text(metadata.get("language", "-")).strip() or "-"
    if requested_count:
        reviews_meta = f"{retrieved_count}/{requested_count} reviews"
    else:
        reviews_meta = f"{retrieved_count} reviews"
    meta_bits = [reviews_meta, f"Lang {language}"]
    if fetched_at:
        meta_bits.append(f"Fetched {fetched_at}")
    meta_line = " · ".join(meta_bits)

    takeaways = []
    if theme_name and theme_name != "-":
        takeaways.append(f"Theme: {theme_name}")
    if subcat_records:
        top_issue_entry = max(
            (entry for entry in subcat_records if int(entry.get("issue_count", 0) or 0) > 0),
            key=lambda item: int(item.get("issue_count", 0) or 0),
            default=None,
        )
        if top_issue_entry:
            top_issue = _safe_text(top_issue_entry.get("sub_category") or top_issue_entry.get("subcategory", "-")).replace("_", " ").strip()
            takeaways.append(f"Top issue subcategory: {top_issue or '-'}")
        top_req_entry = max(
            (entry for entry in subcat_records if int(entry.get("request_count", 0) or 0) > 0),
            key=lambda item: int(item.get("request_count", 0) or 0),
            default=None,
        )
        if top_req_entry:
            top_req = _safe_text(top_req_entry.get("sub_category") or top_req_entry.get("subcategory", "-")).replace("_", " ").strip()
            takeaways.append(f"Top request subcategory: {top_req or '-'}")
    if insights.get("recommendation") is not None:
        takeaways.append(f"Recommendation rate: {_fmt_pct(insights.get('recommendation'))}")
    if llm_metrics.get("issue_rate") is not None:
        takeaways.append(f"Issue rate: {_fmt_pct(llm_metrics.get('issue_rate'))}")
    if llm_metrics.get("feature_request_rate") is not None:
        takeaways.append(f"Feature request rate: {_fmt_pct(llm_metrics.get('feature_request_rate'))}")
    if requested_count > 0:
        takeaways.append(f"Coverage: {_fmt_pct(retrieval_rate)} of requested reviews")
    if not takeaways:
        takeaways.append("Highlights unavailable yet.")

    donut = _render_donut_svg(pos, neg)
    sparkline = _render_sparkline_svg(trend_series or [rec_rate, rec_rate])

    category_rates = insights.get("category_recommendation_rates") or {}
    category_items: list[dict] = []
    if subcategory_by_main:
        for key, entries in subcategory_by_main.items():
            total = 0
            try:
                total = sum(int(item.get("count", 0) or 0) for item in entries)
            except Exception:
                total = 0
            category_items.append({"category": key, "count": total})
        category_items.sort(key=lambda x: x.get("count", 0), reverse=True)
    elif isinstance(category_rates, dict):
        for k, payload in category_rates.items():
            if not isinstance(payload, dict):
                continue
            category_items.append({"category": str(k), "count": int(payload.get("count", 0) or 0)})
        category_items.sort(key=lambda x: x.get("count", 0), reverse=True)

    risk = insights.get("risk") or {}
    refund_risk = float(risk.get("refund_risk") or 0.0) if isinstance(risk, dict) else 0.0
    churn_rate = float(risk.get("churn_rate") or 0.0) if isinstance(risk, dict) else 0.0
    core_fan = float(risk.get("core_fan_disappointment") or 0.0) if isinstance(risk, dict) else 0.0

    playtime = insights.get("playtime") or {}
    helpful = insights.get("helpful") or {}
    helpful_up = _fmt_float(helpful.get("average_votes_up"), digits=1)
    helpful_funny = _fmt_float(helpful.get("average_votes_funny"), digits=1)
    category_breakdown = insights.get("category_breakdown") or {}
    if not isinstance(category_breakdown, dict):
        category_breakdown = {}
    segments = insights.get("segments") or {}
    audience = insights.get("audience") or {}
    version_insights = insights.get("version_insights") or {}
    player_segments = insights.get("player_segments") or {}
    chip_items = [
        f"<span class='pill'>{_h(metadata.get('retrieved', '-'))} analyzed</span>",
        f"<span class='pill'>LLM coverage {_h(_fmt_pct(llm_metrics.get('coverage_rate')))}</span>",
    ]

    stat_cards = [
        ("Recommendation rate", _fmt_pct(insights.get("recommendation"))),
        ("Avg sentiment (compound)", _fmt_float(metrics.get("average_compound", "-"))),
        ("Issue rate", _fmt_pct(llm_metrics.get("issue_rate"))),
        ("Request rate", _fmt_pct(llm_metrics.get("feature_request_rate"))),
    ]

    stat_cells = "".join(
        "<td><div class='stat-card'>"
        f"<div class='stat-number'>{_h(value)}</div>"
        f"<div class='stat-label'>{_h(label)}</div>"
        "</div></td>"
        for label, value in stat_cards
    )

    takeaways_list = "<ol>" + "".join(f"<li>{_h(item)}</li>" for item in takeaways) + "</ol>"

    summary_row = (
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
        "<div class='card-title'>Highlights</div>"
        f"{takeaways_list}"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT};'></div>"
        "<div class='card-title'>Trend</div>"
        f"<div class='card-meta'><strong>{_fmt_pct(trend_series[-1] if trend_series else rec_rate)}</strong> latest period</div>"
        f"{sparkline}"
        "</div>"
        "</td>"
        "</tr></table>"
    )

    sentiment_row = (
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_3};'></div>"
        "<div class='card-title'>Sentiment</div>"
        "<table style='width:100%;'><tr>"
        f"<td style='width:120px; vertical-align:top;'>{donut}</td>"
        "<td style='vertical-align:top;'>"
        f"<div class='stat-number'>{_fmt_pct(rec_rate)}</div>"
        f"<div class='muted'>Recommendation rate</div>"
        f"<div class='card-note'>Positive {pos} / Negative {neg}</div>"
        "</td></tr></table>"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT};'></div>"
        "<div class='card-title'>Risk & engagement</div>"
        f"<div class='card-note'><strong>{_fmt_pct(refund_risk)}</strong> refund risk</div>"
        "<div class='progress-track'><div class='progress-fill' "
        f"style='width:{refund_risk * 100:.0f}%; background:{COL_ACCENT_3};'></div></div>"
        f"<div class='card-note' style='margin-top:8px;'><strong>{_fmt_pct(churn_rate)}</strong> churn rate</div>"
        "<div class='progress-track'><div class='progress-fill' "
        f"style='width:{churn_rate * 100:.0f}%; background:{COL_ACCENT};'></div></div>"
        f"<div class='card-note' style='margin-top:8px;'><strong>{_fmt_pct(core_fan)}</strong> core fan disappointment</div>"
        "<div class='progress-track'><div class='progress-fill' "
        f"style='width:{core_fan * 100:.0f}%; background:{COL_ACCENT_2};'></div></div>"
        f"<div class='card-note' style='margin-top:10px;'><strong>{_h(_fmt_float(playtime.get('median_playtime_hours'), digits=1))}</strong> median hours</div>"
        f"<div class='card-note'>mean {_h(_fmt_float(playtime.get('mean_playtime_hours'), digits=1))} · recent median {_h(_fmt_float(playtime.get('median_recent_playtime_hours'), digits=1))}</div>"
        f"<div class='card-note'>avg helpful {_h(helpful_up)} · avg funny {_h(helpful_funny)}</div>"
        "</div>"
        "</td>"
        "</tr></table>"
    )

    category_scores = {}
    category_has_data = {}
    base_order = {key: idx for idx, key in enumerate(MAIN_CATEGORY_LABELS)}
    for main_key in MAIN_CATEGORY_LABELS:
        score = 0
        has_data = False
        entries = subcategory_by_main.get(main_key, [])
        if entries:
            has_data = True
            try:
                score = sum(int(item.get("count", 0) or 0) for item in entries)
            except Exception:
                score = 0
        elif isinstance(category_rates, dict):
            rate_payload = category_rates.get(main_key) or {}
            if isinstance(rate_payload, dict) and rate_payload:
                has_data = True
                try:
                    score = int(rate_payload.get("count", 0) or 0)
                except Exception:
                    score = 0
        category_scores[main_key] = score
        category_has_data[main_key] = has_data

    category_keys_ordered = [key for key in MAIN_CATEGORY_LABELS if category_has_data.get(key)]
    category_keys_ordered.sort(key=lambda key: (-category_scores.get(key, 0), base_order.get(key, 999)))

    category_rate_lines = []
    if isinstance(category_rates, dict):
        keys = category_keys_ordered or list(MAIN_CATEGORY_LABELS)
        for key in keys:
            label = MAIN_CATEGORY_LABELS.get(key, key.title())
            payload = category_rates.get(key)
            if not isinstance(payload, dict):
                continue
            rate = _fmt_pct(payload.get("rate"))
            count = _safe_text(payload.get("count", 0))
            recommended = _safe_text(payload.get("recommended", 0))
            not_recommended = _safe_text(payload.get("not_recommended", 0))
            category_rate_lines.append(
                f"<div class='card-note'><strong>{_h(label)}</strong>: {_h(rate)} · {_h(count)} reviews · "
                f"{_h(recommended)} up / {_h(not_recommended)} down</div>"
            )
    category_rate_html = "".join(category_rate_lines) if category_rate_lines else "<div class='muted'>No data available.</div>"

    category_overview_row = (
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
        "<div class='card-title'>Category coverage</div>"
        f"{_bar_list(category_items, value_key='count', label_key='category', max_items=7, bar_color=COL_ACCENT_2)}"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT};'></div>"
        "<div class='card-title'>Recommendation by category</div>"
        f"{category_rate_html}"
        "</div>"
        "</td>"
        "</tr></table>"
    )

    category_sections = []
    for main_key in category_keys_ordered or MAIN_CATEGORY_LABELS:
        label = MAIN_CATEGORY_LABELS.get(main_key, str(main_key).title())
        entries = subcategory_by_main.get(main_key, [])
        subcats = [
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": int(item.get("count", 0) or 0)}
            for item in entries
        ]
        subcats = [item for item in subcats if item.get("category")]
        subcats.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
        issue_items = [
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": int(item.get("issue_count", 0) or 0)}
            for item in entries
        ]
        issue_items = [item for item in issue_items if item.get("count", 0)]
        issue_items.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
        req_items = [
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": int(item.get("request_count", 0) or 0)}
            for item in entries
        ]
        req_items = [item for item in req_items if item.get("count", 0)]
        req_items.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
        rate_payload = category_rates.get(main_key) if isinstance(category_rates, dict) else {}
        if not isinstance(rate_payload, dict):
            rate_payload = {}
        has_data = bool(subcats) or bool(issue_items) or bool(req_items) or bool(rate_payload)
        if not has_data:
            continue

        accent = CATEGORY_ACCENTS.get(main_key, COL_ACCENT)
        cat_total = 0
        try:
            cat_total = int(rate_payload.get("count", 0) or 0)
        except Exception:
            cat_total = 0
        if not cat_total:
            try:
                cat_total = sum(int(item.get("count", 0) or 0) for item in subcats)
            except Exception:
                cat_total = 0
        issue_total = 0
        request_total = 0
        try:
            issue_total = sum(int(item.get("count", 0) or 0) for item in issue_items)
            request_total = sum(int(item.get("count", 0) or 0) for item in req_items)
        except Exception:
            issue_total = 0
            request_total = 0

        cat_note = "Structured reviews tagged to this category."
        if cat_total:
            cat_note = f"{cat_total} tagged reviews in this category"

        snapshot_lines = []
        if cat_total:
            snapshot_lines.append(f"{cat_total} tagged reviews")
        if rate_payload:
            if rate_payload.get("rate") is not None:
                snapshot_lines.append(f"Recommendation rate {_fmt_pct(rate_payload.get('rate'))}")
            if rate_payload.get("recommended") is not None or rate_payload.get("not_recommended") is not None:
                snapshot_lines.append(
                    f"{_safe_text(rate_payload.get('recommended', 0))} up / {_safe_text(rate_payload.get('not_recommended', 0))} down"
                )
        if issue_items:
            top_issue = issue_items[0]
            issue_label = _safe_text(top_issue.get("category", "")).replace("_", " ").strip() or "-"
            snapshot_lines.append(f"Top issue subcategory: {issue_label} ({_safe_text(top_issue.get('count', 0))})")
        if req_items:
            top_req = req_items[0]
            req_label = _safe_text(top_req.get("category", "")).replace("_", " ").strip() or "-"
            snapshot_lines.append(f"Top request subcategory: {req_label} ({_safe_text(top_req.get('count', 0))})")
        if issue_total:
            snapshot_lines.append(f"Issue mentions: {issue_total}")
        if request_total:
            snapshot_lines.append(f"Request mentions: {request_total}")
        if not snapshot_lines:
            snapshot_lines.append("No structured insights yet.")

        snapshot_html = "".join(f"<div class='card-note'>{_h(line)}</div>" for line in snapshot_lines)
        issue_evidence_lines = []
        request_evidence_lines = []
        for entry in entries:
            sub_label = _safe_text(entry.get("sub_category") or entry.get("subcategory", "")).replace("_", " ").strip()
            for snippet in entry.get("issue_snippets", []) or []:
                if sub_label:
                    issue_evidence_lines.append(f"{sub_label}: {snippet}")
                else:
                    issue_evidence_lines.append(str(snippet))
                if len(issue_evidence_lines) >= 2:
                    break
            if len(issue_evidence_lines) >= 2:
                continue
        for entry in entries:
            sub_label = _safe_text(entry.get("sub_category") or entry.get("subcategory", "")).replace("_", " ").strip()
            for snippet in entry.get("request_snippets", []) or []:
                if sub_label:
                    request_evidence_lines.append(f"{sub_label}: {snippet}")
                else:
                    request_evidence_lines.append(str(snippet))
                if len(request_evidence_lines) >= 2:
                    break
            if len(request_evidence_lines) >= 2:
                continue
        evidence_html = ""
        for line in issue_evidence_lines:
            evidence_html += f"<div class='card-quote'>Issue: {_h(line)}</div>"
        for line in request_evidence_lines:
            evidence_html += f"<div class='card-quote'>Request: {_h(line)}</div>"
        subcat_bar = _bar_list(subcats, value_key="count", label_key="category", max_items=6, bar_color=accent)
        issues_bar = _bar_list(issue_items, value_key="count", label_key="category", max_items=6, bar_color=COL_ACCENT)
        req_bar = _bar_list(req_items, value_key="count", label_key="category", max_items=6, bar_color=COL_ACCENT_2)

        category_cards = [
            "<div class='card'>"
            f"<div class='accent-bar' style='background:{accent};'></div>"
            "<div class='card-title'>Snapshot</div>"
            f"{snapshot_html}{evidence_html}"
            "</div>",
            "<div class='card'>"
            f"<div class='accent-bar' style='background:{accent};'></div>"
            "<div class='card-title'>Subcategories</div>"
            f"{subcat_bar}"
            "</div>",
            "<div class='card'>"
            f"<div class='accent-bar' style='background:{COL_ACCENT};'></div>"
            "<div class='card-title'>Top issues</div>"
            f"{issues_bar}"
            "</div>",
            "<div class='card'>"
            f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
            "<div class='card-title'>Top requests</div>"
            f"{req_bar}"
            "</div>",
        ]
        category_sections.append(
            "<div class='section'>"
            f"<div class='subsection-title'>{_h(label)}</div>"
            f"<div class='subsection-note'>{_h(cat_note)}</div>"
            f"{_cards_grid(category_cards, columns=2)}"
            "</div>"
        )

    if category_sections:
        category_sections_html = "".join(category_sections)
    else:
        category_sections_html = "<div class='card'><div class='muted'>No category insights available yet.</div></div>"

    purchase_type = {}
    if isinstance(player_segments, dict):
        purchase_type = player_segments.get("purchase_type") or {}
    purchase_lines = []
    if isinstance(purchase_type, dict):
        mapping = [
            ("Steam buyers", purchase_type.get("steam_buyers") or {}),
            ("Key users", purchase_type.get("key_users") or {}),
            ("Free users", purchase_type.get("free_users") or {}),
        ]
        for label, payload in mapping:
            if not isinstance(payload, dict):
                continue
            count = _safe_text(payload.get("count", 0))
            rec = _fmt_pct(payload.get("recommendation_rate"))
            req = _fmt_pct(payload.get("feature_request_rate"))
            purchase_lines.append(
                f"<div class='card-note'><strong>{_h(label)}</strong>: {_h(count)} reviews · rec {_h(rec)} · requests {_h(req)}</div>"
            )

    experience_level = {}
    if isinstance(player_segments, dict):
        experience_level = player_segments.get("experience_level") or {}
    experience_lines = []
    if isinstance(experience_level, dict):
        exp_map = [
            ("Newcomers", experience_level.get("newcomers") or {}),
            ("Casual", experience_level.get("casual") or {}),
            ("Experienced", experience_level.get("experienced") or {}),
            ("Veterans", experience_level.get("veterans") or {}),
        ]
        for label, payload in exp_map:
            if not isinstance(payload, dict):
                continue
            count = _safe_text(payload.get("count", 0))
            issue_count = _safe_text(payload.get("issue_count", 0))
            top_issue = ""
            top_issues = payload.get("top_issues") or []
            if isinstance(top_issues, list) and top_issues:
                top_issue = _safe_text(top_issues[0].get("category", "")).replace("_", " ").strip()
            extra = f" · top {top_issue}" if top_issue else ""
            experience_lines.append(
                f"<div class='card-note'><strong>{_h(label)}</strong>: {_h(count)} reviews · {_h(issue_count)} with issues{_h(extra)}</div>"
            )

    engagement_topics = {}
    activity_status = {}
    if isinstance(player_segments, dict):
        engagement_topics = player_segments.get("engagement_topics") or {}
        activity_status = player_segments.get("activity_status") or {}

    engagement_lines = []
    if isinstance(engagement_topics, dict):
        engagement_map = [
            ("Highly engaged", "highly_engaged"),
            ("Moderately engaged", "moderately_engaged"),
            ("Low engagement", "low_engagement"),
        ]
        for label, key in engagement_map:
            payload = engagement_topics.get(key) or {}
            if not isinstance(payload, dict):
                continue
            count = _safe_text(payload.get("count", 0))
            topics = payload.get("top_topics") or []
            topics_text = ""
            if isinstance(topics, list) and topics:
                topics_text = ", ".join(
                    _safe_text(item.get("topic", "")).replace("_", " ").strip()
                    for item in topics[:3]
                    if isinstance(item, dict)
                ).strip()
            extra = f" · topics {topics_text}" if topics_text else ""
            engagement_lines.append(
                f"<div class='card-note'><strong>{_h(label)}</strong>: {_h(count)} reviews{_h(extra)}</div>"
            )

    activity_lines = []
    if isinstance(activity_status, dict):
        activity_map = [
            ("Currently active", "currently_active"),
            ("Recently stopped", "recently_stopped"),
            ("Inactive", "inactive"),
        ]
        for label, key in activity_map:
            payload = activity_status.get(key) or {}
            if not isinstance(payload, dict):
                continue
            count = _safe_text(payload.get("count", 0))
            rec = _fmt_pct(payload.get("recommendation_rate"))
            issue_count = _safe_text(payload.get("issue_count", 0))
            activity_lines.append(
                f"<div class='card-note'><strong>{_h(label)}</strong>: {_h(count)} reviews · rec {_h(rec)} · issues {_h(issue_count)}</div>"
            )

    purchase_html = "".join(purchase_lines) if purchase_lines else "<div class='muted'>No data available.</div>"
    experience_html = "".join(experience_lines) if experience_lines else "<div class='muted'>No data available.</div>"
    engagement_html = "".join(engagement_lines) if engagement_lines else "<div class='muted'>No data available.</div>"
    activity_html = "".join(activity_lines) if activity_lines else "<div class='muted'>No data available.</div>"

    segments_row_1 = (
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT};'></div>"
        "<div class='card-title'>Purchase pathways</div>"
        f"{purchase_html}"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
        "<div class='card-title'>Experience cohorts</div>"
        f"{experience_html}"
        "</div>"
        "</td>"
        "</tr></table>"
    )

    segments_row_2 = (
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
        "<div class='card-title'>Engagement topics</div>"
        f"{engagement_html}"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_3};'></div>"
        "<div class='card-title'>Activity status</div>"
        f"{activity_html}"
        "</div>"
        "</td>"
        "</tr></table>"
    )

    appendix_blocks = []
    show_appendix = os.getenv("SENTINEXT_PDF_APPENDIX", "false").lower() in {"1", "true", "yes"}
    show_tables = os.getenv("SENTINEXT_PDF_APPENDIX_TABLES", "false").lower() in {"1", "true", "yes"}
    if show_appendix:
        appendix_blocks.append("<div class='page-break'></div>")
        appendix_blocks.append("<div class='section'>")
        appendix_blocks.append("<div class='section-title'>Appendix (details)</div>")
        appendix_blocks.append("<div class='muted'>Raw tables for debugging and deep dives.</div>")
        appendix_blocks.append("</div>")

        appendix_blocks.append("<div class='section'><h3>Sentiment & engagement</h3>")
        appendix_blocks.append(
            _html_table(
                ["Metric", "Value"],
                [
                    ["Recommendation rate", _fmt_pct(insights.get("recommendation"))],
                    ["Avg compound", _fmt_float(metrics.get("average_compound", "-"))],
                    ["Median playtime (h)", _safe_text(playtime.get("median_playtime_hours", "-"))],
                    ["Mean playtime (h)", _safe_text(playtime.get("mean_playtime_hours", "-"))],
                    ["Median recent playtime (h)", _safe_text(playtime.get("median_recent_playtime_hours", "-"))],
                    ["Avg helpful votes", _fmt_float(helpful.get("average_votes_up"), digits=1)],
                    ["Avg funny votes", _fmt_float(helpful.get("average_votes_funny"), digits=1)],
                ],
            )
        )
        if isinstance(sentiment_counts, list) and sentiment_counts:
            appendix_blocks.append("<div class='section'><h3>Sentiment counts</h3>")
            appendix_blocks.append(_records_table(sentiment_counts, ["sentiment", "count"], max_rows=10))
            appendix_blocks.append("</div>")
        if isinstance(trend, list) and trend:
            columns = list(trend[0].keys()) if isinstance(trend[0], dict) else []
            columns = columns[:3] if columns else []
            if columns:
                appendix_blocks.append("<div class='section'><h3>Recommendation trend</h3>")
                appendix_blocks.append(_records_table(trend[-16:], columns, max_rows=16))
                appendix_blocks.append("</div>")
        appendix_blocks.append("</div>")

        appendix_blocks.append("<div class='section'><h3>Categories & segments</h3>")
        if isinstance(category_breakdown, dict) and category_breakdown:
            rows = []
            for main_cat, subcats in category_breakdown.items():
                if isinstance(subcats, dict):
                    detail = ", ".join(f"{k}:{v}" for k, v in subcats.items())
                else:
                    detail = _safe_text(subcats)
                rows.append([_safe_text(main_cat), detail])
            appendix_blocks.append(_html_table(["main_category", "subcategories (count)"], rows))

        if isinstance(category_rates, dict) and category_rates:
            rows = []
            for main_cat, payload in category_rates.items():
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
            if rows:
                appendix_blocks.append(_html_table(["main_category", "rate", "count", "recommended", "not_recommended"], rows))

        if isinstance(segments, dict):
            for key, records in segments.items():
                if isinstance(records, list) and records:
                    columns = list(records[0].keys()) if isinstance(records[0], dict) else []
                    if columns:
                        appendix_blocks.append(f"<div class='section'><h3>Segment: {_h(key)}</h3>")
                        appendix_blocks.append(_records_table(records, columns, max_rows=12))
                        appendix_blocks.append("</div>")
        appendix_blocks.append("</div>")

        appendix_blocks.append("<div class='section'><h3>Risk & audience</h3>")
        if isinstance(risk, dict) and risk:
            rows = [[k, _safe_text(v)] for k, v in risk.items()]
            appendix_blocks.append(_html_table(["Metric", "Value"], rows))

        if isinstance(audience, dict):
            for key, records in audience.items():
                if isinstance(records, list) and records:
                    columns = list(records[0].keys()) if isinstance(records[0], dict) else []
                    if columns:
                        appendix_blocks.append(f"<div class='section'><h3>Audience: {_h(key)}</h3>")
                        appendix_blocks.append(_records_table(records, columns, max_rows=12))
                        appendix_blocks.append("</div>")
        appendix_blocks.append("</div>")

        appendix_blocks.append("<div class='section'><h3>Version & player segments</h3>")
        if isinstance(version_insights, dict) and version_insights:
            for version_key, payload in version_insights.items():
                if not isinstance(payload, dict):
                    continue
                rows = []
                for k in ("total_reviews", "recommendation_rate"):
                    if k in payload:
                        value = _fmt_pct(payload[k]) if k.endswith("rate") else _safe_text(payload[k])
                        rows.append([k, value])
                top_cats = payload.get("top_categories") or {}
                if isinstance(top_cats, dict) and top_cats:
                    rows.append(["top_categories", ", ".join(f"{k}:{v}" for k, v in top_cats.items())])
                if rows:
                    appendix_blocks.append(f"<div class='section'><h3>Version: {_h(version_key)}</h3>")
                    appendix_blocks.append(_html_table(["Metric", "Value"], rows))
                    appendix_blocks.append("</div>")

                top_issues = payload.get("top_issue_subcategories") or []
                if isinstance(top_issues, list) and top_issues:
                    appendix_blocks.append(f"<div class='section'><h3>Top issue subcategories ({_h(version_key)})</h3>")
                    appendix_blocks.append(_records_table(top_issues, ["subcategory", "count"], max_rows=10))
                    appendix_blocks.append("</div>")

                top_requests = payload.get("top_request_subcategories") or []
                if isinstance(top_requests, list) and top_requests:
                    appendix_blocks.append(f"<div class='section'><h3>Top request subcategories ({_h(version_key)})</h3>")
                    appendix_blocks.append(_records_table(top_requests, ["subcategory", "count"], max_rows=10))
                    appendix_blocks.append("</div>")

        if isinstance(player_segments, dict) and player_segments:
            for seg_key, payload in player_segments.items():
                snippet = json.dumps(payload, indent=2, ensure_ascii=True)[:2200]
                appendix_blocks.append(f"<div class='section'><h3>Player segment: {_h(seg_key)}</h3>")
                appendix_blocks.append(f"<pre class='code'>{_h(snippet)}</pre>")
                appendix_blocks.append("</div>")
        appendix_blocks.append("</div>")

        if show_tables:
            if isinstance(subcat_records, list) and subcat_records:
                appendix_blocks.append("<div class='section'><h3>Subcategory table</h3>")
                appendix_blocks.append(
                    _records_table(
                        subcat_records,
                        ["subcategory", "count", "issue_count", "request_count"],
                        max_rows=30,
                    )
                )
                appendix_blocks.append("</div>")

    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>{css}</style>
</head>
<body>
  <div class="cover">
    {image_html}
    <div class="kicker">Insights report</div>
    <h1>SentiNext report for {_h(game_name)}</h1>
    <div class="muted">App id {_h(app_id)} &middot; Generated {generated_at}</div>
    <div class="meta">{_h(meta_line)}</div>
    <div class="pill-row">{''.join(chip_items)}</div>
  </div>

  <table class="stat-grid"><tr>{stat_cells}</tr></table>

  <div class="section">
    <div class="section-title">Overview</div>
    {summary_row}
    {sentiment_row}
  </div>

  <div class="page-break"></div>
  <div class="section">
    <div class="section-title">Category insights</div>
    {category_overview_row}
    {category_sections_html}
  </div>

  <div class="page-break"></div>
  <div class="section">
    <div class="section-title">User segmentation</div>
    {segments_row_1}
    {segments_row_2}
  </div>

  {''.join(appendix_blocks)}

  <div class="footer-note">
    Generated by SentiNext.
  </div>
</body>
</html>
"""
    return html_doc


def render_insights_pdf(
    *,
    app_id: int,
    game_name: str,
    metadata: Dict[str, Any],
    insights: Dict[str, Any],
    game_image_url: Optional[str] = None,
) -> bytes:
    if HTML is None:
        error = _WEASYPRINT_ERROR
        raise RuntimeError(
            "WeasyPrint is required for HTML-to-PDF rendering. "
            "Install it and its system dependencies, then retry."
        ) from error

    html_doc = _render_html(
        app_id=app_id,
        game_name=game_name,
        metadata=metadata,
        insights=insights,
        game_image_url=game_image_url,
    )
    base_url = str(Path(__file__).resolve().parent)
    return HTML(string=html_doc, base_url=base_url).write_pdf()
