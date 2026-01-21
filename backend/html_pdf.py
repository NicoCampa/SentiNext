from __future__ import annotations

import base64
from datetime import datetime, timezone
import html
import json
from io import BytesIO
import math
import os
from pathlib import Path
from textwrap import dedent
from typing import Any, Dict, Iterable, Optional

import requests
import yaml
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
COL_BORDER = "rgba(255,255,255,0.12)"
COL_CARD = "rgba(15,23,42,0.45)"
COL_ACCENT = "#6366f1"
COL_ACCENT_2 = "#22d3ee"
COL_ACCENT_3 = "#ef4444"
COL_REC_HIGH = "#7dd3fc"
COL_REC_MID = "#f59e0b"
COL_REC_LOW = "#ef4444"
CATEGORY_ACCENTS = {
    "gameplay": COL_ACCENT,
    "technical": COL_ACCENT_3,
    "content_design": COL_ACCENT_2,
    "ui_ux_accessibility": COL_ACCENT,
    "onboarding": COL_ACCENT_2,
    "presentation": COL_ACCENT,
    "online_community": COL_ACCENT_2,
    "developer_updates": COL_ACCENT_3,
    "monetization_value": COL_ACCENT_3,
    "other": COL_ACCENT,
}

MAIN_CATEGORY_LABELS = {
    "gameplay": "Gameplay",
    "technical": "Technical",
    "content_design": "Content & Design",
    "ui_ux_accessibility": "UI/UX & Accessibility",
    "onboarding": "Onboarding",
    "presentation": "Presentation",
    "online_community": "Online & Community",
    "developer_updates": "Developer & Updates",
    "monetization_value": "Monetization & Value",
    "other": "Other / Meta",
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


def _rec_color(value: Optional[float]) -> str:
    if value is None:
        return COL_MUTED_2
    try:
        rate = float(value)
    except Exception:
        return COL_MUTED_2
    if rate < 0.55:
        return COL_REC_LOW
    if rate < 0.75:
        return COL_REC_MID
    return COL_REC_HIGH


def _fmt_float(value: Any, *, digits: int = 2) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.{digits}f}"
    except Exception:
        return _safe_text(value) or "-"


def _json_script(payload: Any) -> str:
    try:
        return json.dumps(payload, ensure_ascii=True).replace("</", "<\\/")
    except Exception:
        return "[]"


def _shorten(text: str, max_len: int = 44) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _truncate(text: str, max_len: int = 160) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _evidence_snippets(value: Any, *, max_len: int = 160) -> list[str]:
    if isinstance(value, list):
        items = value
    elif value is None:
        return []
    else:
        items = [value]
    cleaned = []
    for item in items:
        text = _truncate(_safe_text(item).replace("\n", " ").replace("\r", " ").strip(), max_len)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _review_weight(review: dict) -> int:
    try:
        votes = int(review.get("votes_up", 0) or 0)
    except Exception:
        return 1
    return votes if votes > 0 else 1


def _parse_review_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.utcfromtimestamp(float(value))
        except Exception:
            return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.isdigit():
            return datetime.utcfromtimestamp(int(text))
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _label_payload(label: Any) -> dict[str, Any]:
    if isinstance(label, dict) and isinstance(label.get("payload"), dict):
        return label["payload"]
    if isinstance(label, dict):
        return label
    return {}


def _weighted_subcategory_counts(
    reviews: Iterable[dict], labels: Optional[dict]
) -> dict[str, dict[str, int]]:
    if not reviews or not isinstance(labels, dict):
        return {}

    counts: dict[str, dict[str, int]] = {}
    for review in reviews:
        review_id = review.get("recommendationid") or review.get("review_id")
        if review_id is None:
            continue
        payload = _label_payload(labels.get(str(review_id)))
        if not payload:
            continue
        subcats = payload.get("subcategories") or []
        if not isinstance(subcats, list):
            continue
        issue_subcats = set(payload.get("issue_subcategories") or [])
        request_subcats = set(payload.get("request_subcategories") or [])
        weight = _review_weight(review)
        for subcat in {str(item) for item in subcats if isinstance(item, str) and item}:
            entry = counts.setdefault(subcat, {"count": 0, "issue_count": 0, "request_count": 0})
            entry["count"] += weight
            if subcat in issue_subcats:
                entry["issue_count"] += weight
            if subcat in request_subcats:
                entry["request_count"] += weight
    return counts


def _apply_weighted_counts(records: list[dict], weighted: dict[str, dict[str, int]]) -> None:
    if not weighted:
        return
    for entry in records:
        if not isinstance(entry, dict):
            continue
        raw = entry.get("subcategory") or entry.get("sub_category")
        if not raw:
            continue
        key = str(raw)
        counts = weighted.get(key)
        if not counts and "/" not in key:
            main = _safe_text(entry.get("main_category") or "").strip()
            if main:
                counts = weighted.get(f"{main}/{key}")
        if not counts:
            continue
        entry["weighted_count"] = int(counts.get("count", 0) or 0)
        entry["weighted_issue_count"] = int(counts.get("issue_count", 0) or 0)
        entry["weighted_request_count"] = int(counts.get("request_count", 0) or 0)


def _weighted_value(entry: dict, key: str) -> int:
    if not isinstance(entry, dict):
        return 0
    value = entry.get(f"weighted_{key}")
    if value is None:
        value = entry.get(key, 0)
    try:
        return int(value or 0)
    except Exception:
        return 0


def _summary_prompt(kind: str, items: list[dict]) -> str:
    def _format_items(values: list[dict]) -> str:
        if not values:
            return "  - none"
        lines: list[str] = []
        for item in values:
            lines.append(f"- key: {item.get('key')}")
            lines.append(f"  label: {item.get('label')}")
            lines.append(f"  volume: {item.get('count')}")
            snippets = item.get("snippets") or []
            if snippets:
                lines.append("  evidence:")
                for snippet in snippets[:3]:
                    lines.append(f"    - {_truncate(_safe_text(snippet), 160)}")
        return "\n".join(lines)

    items_block = _format_items(items)
    kind_label = "issues" if kind == "issues" else "feature requests"
    return dedent(
        f"""
        You are summarizing Steam review feedback for a report.
        For each item, write a short paragraph (2-3 sentences, max 60 words) describing what players need or complain about.
        Use the evidence snippets; paraphrase them and avoid filler. Do not mention "reviews" or "users".

        Return STRICT JSON only (no prose, no code fences) with this schema:
        {{
          "{kind}": [
            {{
              "key": "<subcategory key>",
              "summary": "<paragraph>"
            }}
          ]
        }}

        Only include items provided. No extra text.

        {kind_label.upper()}:
        {items_block}
        """
    ).strip()


def _summarize_issue_requests(issues: list[dict], requests: list[dict]) -> dict[str, str]:
    if not issues and not requests:
        return {}
    try:
        from backend.senti_next import llm as llm_module
    except Exception:
        return {}

    summaries: dict[str, str] = {}
    for kind, items in (("issues", issues), ("requests", requests)):
        if not items:
            continue
        prompt = _summary_prompt(kind, items)
        try:
            raw, _ = llm_module._run_llm(prompt)
        except Exception:
            continue

        cleaned = raw
        cleaner = getattr(llm_module, "_strip_code_fences", None)
        if callable(cleaner):
            try:
                cleaned = cleaner(raw)
            except Exception:
                cleaned = raw

        try:
            payload = json.loads(cleaned) if cleaned else {}
        except Exception:
            try:
                payload = yaml.safe_load(cleaned) or {}
            except Exception:
                continue

        if not isinstance(payload, dict):
            continue
        entries = payload.get(kind) or payload.get("items")
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            key = entry.get("key") or entry.get("subcategory")
            summary = entry.get("summary")
            if key and summary:
                summaries[str(key)] = str(summary).strip()
    return summaries


def _fallback_summary(item: dict) -> str:
    snippets = item.get("snippets") or []
    if not isinstance(snippets, list):
        snippets = []
    cleaned = [
        _truncate(_safe_text(snippet).replace("\n", " ").replace("\r", " ").strip(), 220)
        for snippet in snippets
        if snippet
    ]
    if not cleaned:
        return "No detailed feedback yet."
    if len(cleaned) == 1:
        return cleaned[0]
    return f"{cleaned[0]} {cleaned[1]}"


def _main_category(value: str) -> str:
    text = str(value or "").strip()
    if "/" in text:
        return text.split("/", 1)[0]
    return text or "other"


def _playtime_bucket(minutes: int) -> str:
    if minutes < 120:
        return "<2h"
    if minutes < 1200:
        return "2–20h"
    return "20h+"


def _fmt_pp(delta: Optional[float]) -> str:
    if delta is None:
        return "-"
    try:
        value = float(delta) * 100
    except Exception:
        return "-"
    sign = "+" if value >= 0 else "-"
    return f"{sign}{abs(value):.0f}pp"


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

@media screen {{
  .screen-wrap {{
    max-width: 1120px;
    margin: 0 auto;
    padding: 24px 18px 48px;
  }}
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

.category-board {{
  width: 100%;
}}

.category-card {{
  background: {COL_CARD};
  border: 1px solid {COL_BORDER};
  border-radius: 12px;
  padding: 12px;
  break-inside: avoid;
}}

.category-head {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}}

.category-name {{
  font-size: 11px;
  font-weight: 700;
}}

.category-rate {{
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.2px;
}}

.category-meta {{
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: {COL_MUTED_2};
  margin-top: 2px;
}}

.sub-list {{
  margin-top: 10px;
  border-top: 1px solid {COL_BORDER};
  padding-top: 6px;
}}

.sub-row {{
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 9px;
  color: {COL_MUTED};
  margin-top: 6px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 8px;
}}

.sub-rate {{
  font-weight: 700;
  color: {COL_TEXT};
}}

.sub-row.more {{
  justify-content: center;
  color: {COL_MUTED_2};
  border-style: dashed;
  background: transparent;
}}

.sub-row-button {{
  width: 100%;
  text-align: left;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  cursor: pointer;
}}

.sub-row-button:hover {{
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}}

.sub-toggle-row {{
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 8px;
  color: {COL_MUTED_2};
}}

.sub-toggle {{
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: {COL_TEXT};
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 700;
  cursor: pointer;
}}

.sub-toggle:hover {{
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.12);
}}

.modal-open {{
  overflow: hidden;
}}

.modal-overlay {{
  display: none;
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(2, 6, 23, 0.75);
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(4px);
}}

.modal-overlay.open {{
  display: flex;
}}

.modal-card {{
  width: 100%;
  max-width: 960px;
  border-radius: 16px;
  border: 1px solid {COL_BORDER};
  background: rgba(15, 23, 42, 0.96);
  padding: 16px;
  box-shadow: 0 24px 48px rgba(2, 6, 23, 0.5);
}}

.modal-head {{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}}

.modal-title {{
  font-size: 16px;
  font-weight: 700;
}}

.modal-meta {{
  margin-top: 4px;
  font-size: 9px;
  color: {COL_MUTED_2};
}}

.modal-close {{
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: {COL_TEXT};
  border-radius: 10px;
  padding: 6px 12px;
  cursor: pointer;
}}

.modal-close:hover {{
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
}}

.modal-list {{
  margin-top: 12px;
  max-height: 440px;
  overflow: auto;
  padding-right: 4px;
}}

.modal-empty {{
  margin-top: 12px;
  font-size: 9px;
  color: {COL_MUTED_2};
}}

.review-card {{
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}}

.review-meta {{
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 9px;
  color: {COL_MUTED_2};
}}

.review-text {{
  margin-top: 6px;
  font-size: 10px;
  color: {COL_TEXT};
  white-space: pre-wrap;
}}

.review-footer {{
  margin-top: 8px;
}}

.pill-pos {{
  border: 1px solid rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.16);
  color: #6ee7b7;
}}

.pill-neg {{
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.16);
  color: #fca5a5;
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
    reviews: Optional[list[dict]] = None,
    llm_labels: Optional[dict] = None,
    interactive: bool = False,
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
    weighted_counts = _weighted_subcategory_counts(reviews or [], llm_labels)
    _apply_weighted_counts(subcat_records, weighted_counts)
    volume_label = "weighted mentions" if weighted_counts else "mentions"
    min_summary_count = 10
    segment_min_summary_count = 1
    summary_review_cap = 100
    threshold_note = f"Only items with >{min_summary_count} {volume_label} are included."
    segmentation_weight_note = "weighted by helpful votes" if weighted_counts else "raw mentions"
    summary_cap_note = f"Summaries use top {summary_review_cap} helpful reviews."
    volume_note = (
        f"Top 5 by weighted volume (helpful votes). {threshold_note} {summary_cap_note}"
        if weighted_counts
        else f"Top 5 by volume. {threshold_note} {summary_cap_note}"
    )
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
        entries.sort(key=lambda item: _weighted_value(item, "count"), reverse=True)

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
            (entry for entry in subcat_records if _weighted_value(entry, "issue_count") > 0),
            key=lambda item: _weighted_value(item, "issue_count"),
            default=None,
        )
        if top_issue_entry:
            top_issue = _safe_text(top_issue_entry.get("sub_category") or top_issue_entry.get("subcategory", "-")).replace("_", " ").strip()
            takeaways.append(f"Top issue subcategory: {top_issue or '-'}")
        top_req_entry = max(
            (entry for entry in subcat_records if _weighted_value(entry, "request_count") > 0),
            key=lambda item: _weighted_value(item, "request_count"),
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
                total = sum(_weighted_value(item, "count") for item in entries)
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
    ]

    stat_cards = [
        {
            "label": "Recommendation rate",
            "value": _fmt_pct(insights.get("recommendation")),
            "color": _rec_color(insights.get("recommendation")),
        },
        {"label": "Issue rate", "value": _fmt_pct(llm_metrics.get("issue_rate")), "color": COL_ACCENT_3},
        {"label": "Request rate", "value": _fmt_pct(llm_metrics.get("feature_request_rate")), "color": COL_ACCENT_2},
        {"label": "Reviews analyzed", "value": _safe_text(metadata.get("retrieved", 0)), "color": COL_MUTED_2},
    ]

    stat_cells = "".join(
        "<td><div class='stat-card'>"
        f"<div class='stat-number' style='color:{card['color']};'>{_h(card['value'])}</div>"
        f"<div class='stat-label'>{_h(card['label'])}</div>"
        "</div></td>"
        for card in stat_cards
    )

    category_blocks = []
    category_keys = [key for key in MAIN_CATEGORY_LABELS if key != "other"]
    for main_key in category_keys:
        label = MAIN_CATEGORY_LABELS.get(main_key, str(main_key).title())
        payload = category_rates.get(main_key) if isinstance(category_rates, dict) else {}
        if not isinstance(payload, dict):
            payload = {}
        rate_value = payload.get("rate") if payload else None
        rate = _fmt_pct(rate_value) if payload else "-"
        rate_color = _rec_color(rate_value)
        entries = subcategory_by_main.get(main_key, []) or []
        try:
            tagged = sum(_weighted_value(item, "count") for item in entries)
        except Exception:
            tagged = 0
        if not tagged:
            try:
                tagged = int(payload.get("count", 0) or 0) if payload else 0
            except Exception:
                tagged = 0
        sub_rows = []
        toggle_html = ""
        if interactive:
            for idx, entry in enumerate(entries):
                if not isinstance(entry, dict):
                    continue
                raw_sub = _safe_text(entry.get("subcategory") or entry.get("sub_category") or "")
                if not raw_sub:
                    raw_sub = f"{main_key}/general"
                sub_label_raw = raw_sub.split("/", 1)[1] if "/" in raw_sub else raw_sub
                sub_label = sub_label_raw.replace("_", " ").strip().title()
                sub_rate_value = entry.get("recommendation_rate")
                sub_rate_color = _rec_color(sub_rate_value)
                hidden_attr = " hidden" if idx >= 3 else ""
                hidden_flag = "true" if idx >= 3 else "false"
                sub_rows.append(
                    "<button class='sub-row sub-row-button' type='button'"
                    f" data-subcategory='{_h(raw_sub)}'"
                    f" data-label='{_h(sub_label)}'"
                    f" data-main='{_h(label)}'"
                    f" data-hidden='{hidden_flag}'{hidden_attr}>"
                    f"<span>{_h(sub_label)}</span>"
                    f"<span class='sub-rate' style='color:{sub_rate_color};'>{_h(_fmt_pct(sub_rate_value))}</span>"
                    "</button>"
                )
            if len(entries) > 3:
                toggle_html = (
                    "<div class='sub-toggle-row'>"
                    f"<span class='sub-count' data-category='{_h(main_key)}'>Showing 3 of {len(entries)}</span>"
                    f"<button class='sub-toggle' type='button' data-category='{_h(main_key)}'>+</button>"
                    "</div>"
                )
        else:
            visible_entries = entries[:3]
            for entry in visible_entries:
                if not isinstance(entry, dict):
                    continue
                sub_label_raw = _safe_text(entry.get("sub_category") or entry.get("subcategory", "")).strip()
                if "/" in sub_label_raw:
                    sub_label_raw = sub_label_raw.split("/", 1)[1]
                sub_label = sub_label_raw.replace("_", " ").strip().title()
                sub_rate_value = entry.get("recommendation_rate")
                sub_rate_color = _rec_color(sub_rate_value)
                sub_rows.append(
                    "<div class='sub-row'>"
                    f"<span>{_h(sub_label)}</span>"
                    f"<span class='sub-rate' style='color:{sub_rate_color};'>{_h(_fmt_pct(sub_rate_value))}</span>"
                    "</div>"
                )
            extra_count = max(0, len(entries) - len(visible_entries))
            if extra_count:
                sub_rows.append(f"<div class='sub-row more'>+{extra_count} more</div>")

        if sub_rows:
            sub_html = "<div class='sub-list'>" + "".join(sub_rows) + "</div>" + toggle_html
        else:
            sub_html = "<div class='sub-list'><div class='empty'>No subcategories tagged.</div></div>"

        card_attrs = ""
        if interactive:
            card_attrs = f" data-category='{_h(main_key)}' data-total='{len(entries)}' data-expanded='false'"

        category_blocks.append(
            "<div class='category-card'" + card_attrs + ">"
            f"<div class='category-head'><div class='category-name'>{_h(label)}</div>"
            f"<div class='category-rate' style='color:{rate_color};'>{_h(rate)}</div></div>"
            f"<div class='category-meta'>{_h(tagged)} {_h(volume_label)}</div>"
            f"{sub_html}"
            "</div>"
        )

    if category_blocks:
        category_board_html = _cards_grid(category_blocks, columns=3)
    else:
        category_board_html = "<div class='muted'>No category insights available yet.</div>"

    issue_summary_snippets: dict[str, list[str]] = {}
    request_summary_snippets: dict[str, list[str]] = {}
    if reviews and llm_labels:
        def _helpful_votes(review: dict) -> int:
            try:
                return int(review.get("votes_up", 0) or 0)
            except Exception:
                return 0

        sorted_reviews = sorted(reviews, key=_helpful_votes, reverse=True)
        for review in sorted_reviews[:summary_review_cap]:
            review_id_value = review.get("recommendationid") or review.get("review_id")
            if review_id_value is None:
                continue
            payload = _label_payload(llm_labels.get(str(review_id_value)))
            if not payload:
                continue
            evidence = payload.get("evidence") or {}
            if not isinstance(evidence, dict):
                evidence = {}
            issue_subcats = set(payload.get("issue_subcategories") or [])
            request_subcats = set(payload.get("request_subcategories") or [])
            for subcat in issue_subcats:
                bucket = issue_summary_snippets.setdefault(subcat, [])
                for snippet in _evidence_snippets(evidence.get(subcat)):
                    if len(bucket) >= 3:
                        break
                    if snippet not in bucket:
                        bucket.append(snippet)
            for subcat in request_subcats:
                bucket = request_summary_snippets.setdefault(subcat, [])
                for snippet in _evidence_snippets(evidence.get(subcat)):
                    if len(bucket) >= 3:
                        break
                    if snippet not in bucket:
                        bucket.append(snippet)

    def _top_items(kind: str, *, snippet_map: Optional[dict[str, list[str]]] = None) -> list[dict]:
        count_key = "issue_count" if kind == "issue" else "request_count"
        snippet_key = "issue_snippets" if kind == "issue" else "request_snippets"
        items: list[dict] = []
        for entry in subcat_records:
            count = _weighted_value(entry, count_key)
            if count <= min_summary_count:
                continue
            raw_key = _safe_text(entry.get("subcategory") or entry.get("sub_category") or "").strip()
            if not raw_key:
                continue
            if "/" not in raw_key:
                main = _safe_text(entry.get("main_category") or "").strip()
                if main:
                    raw_key = f"{main}/{raw_key}"
            label = raw_key.split("/", 1)[1] if "/" in raw_key else raw_key
            label = label.replace("_", " ").strip().title() or "-"
            snippets = []
            if snippet_map:
                snippets = snippet_map.get(raw_key) or []
            if not snippets:
                snippets = entry.get(snippet_key) or []
            if not isinstance(snippets, list):
                snippets = []
            items.append(
                {
                    "key": raw_key,
                    "label": label,
                    "count": count,
                    "snippets": [_truncate(_safe_text(snippet), 160) for snippet in snippets if snippet],
                }
            )
        items.sort(key=lambda item: item.get("count", 0), reverse=True)
        return items[:5]

    issue_items_top = _top_items("issue", snippet_map=issue_summary_snippets)
    request_items_top = _top_items("request", snippet_map=request_summary_snippets)
    summaries = _summarize_issue_requests(issue_items_top, request_items_top)

    def _item_summary(item: dict) -> str:
        summary = summaries.get(item.get("key"))
        if not summary:
            summary = summaries.get(_safe_text(item.get("label")).lower())
        if not summary:
            summary = _fallback_summary(item)
        return summary

    def _render_items(items: list[dict]) -> str:
        if not items:
            return "<div class='muted'>No data available.</div>"
        lines = []
        for item in items:
            summary = _item_summary(item)
            count = _safe_text(item.get("count", 0))
            lines.append(
                "<div class='card-note'>"
                f"<strong>{_h(item.get('label'))}</strong> · {_h(count)} {_h(volume_label)}"
                "</div>"
                f"<div class='card-quote'>{_h(summary)}</div>"
            )
        return "".join(lines)

    issue_request_section_html = (
        "<div class='section'>"
        "<div class='section-title'>Issues & feature requests</div>"
        f"<div class='subsection-note'>{_h(volume_note)}</div>"
        "<table class='grid'><tr>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_3};'></div>"
        "<div class='card-title'>Top issues</div>"
        f"{_render_items(issue_items_top)}"
        "</div>"
        "</td>"
        "<td class='grid-cell'>"
        "<div class='card'>"
        f"<div class='accent-bar' style='background:{COL_ACCENT_2};'></div>"
        "<div class='card-title'>Top feature requests</div>"
        f"{_render_items(request_items_top)}"
        "</div>"
        "</td>"
        "</tr></table>"
        "</div>"
    )

    review_rows: list[dict] = []
    if reviews and llm_labels:
        for review in reviews:
            review_id_value = review.get("recommendationid") or review.get("review_id")
            if review_id_value is None:
                continue
            payload = _label_payload(llm_labels.get(str(review_id_value)))
            subcats = payload.get("subcategories") or []
            if not isinstance(subcats, list):
                subcats = []
            issue_subcats = payload.get("issue_subcategories") or []
            if not isinstance(issue_subcats, list):
                issue_subcats = []
            request_subcats = payload.get("request_subcategories") or []
            if not isinstance(request_subcats, list):
                request_subcats = []
            evidence = payload.get("evidence") or {}
            if not isinstance(evidence, dict):
                evidence = {}
            author = review.get("author") or {}
            total_minutes = int(author.get("playtime_forever") or 0)
            recent_minutes = int(author.get("playtime_last_two_weeks") or 0)
            created_at = _parse_review_datetime(review.get("timestamp_created") or review.get("created_at"))
            try:
                helpful_votes = int(review.get("votes_up", 0) or 0)
            except Exception:
                helpful_votes = 0
            review_rows.append(
                {
                    "voted_up": bool(review.get("voted_up")),
                    "weight": _review_weight(review),
                    "helpful_votes": helpful_votes,
                    "playtime_total": total_minutes,
                    "playtime_recent": recent_minutes,
                    "created_at": created_at,
                    "subcategories": [str(item) for item in subcats if isinstance(item, str)],
                    "issue_subcategories": [str(item) for item in issue_subcats if isinstance(item, str)],
                    "request_subcategories": [str(item) for item in request_subcats if isinstance(item, str)],
                    "evidence": evidence,
                }
            )

    segmentation_html = ""
    if review_rows:
        def _rec_rate(rows: list[dict]) -> Optional[float]:
            if not rows:
                return None
            return float(sum(1 for row in rows if row.get("voted_up")) / len(rows))

        def _request_category_counts(rows: list[dict]) -> dict[str, int]:
            counts: dict[str, int] = {}
            for row in rows:
                weight = int(row.get("weight", 1) or 1)
                for subcat in row.get("request_subcategories") or []:
                    main = _main_category(subcat)
                    counts[main] = counts.get(main, 0) + weight
            return counts

        def _rows_for_request_category(rows: list[dict], main_key: str) -> list[dict]:
            return [
                row
                for row in rows
                if any(_main_category(subcat) == main_key for subcat in row.get("request_subcategories") or [])
            ]

        def _top_request_items(
            rows: list[dict],
            *,
            limit: int = 3,
            snippet_rows: Optional[list[dict]] = None,
        ) -> list[dict]:
            counts: dict[str, int] = {}
            snippets: dict[str, list[str]] = {}
            for row in rows:
                weight = int(row.get("weight", 1) or 1)
                for subcat in row.get("request_subcategories") or []:
                    counts[subcat] = counts.get(subcat, 0) + weight
            snippet_rows = rows if snippet_rows is None else snippet_rows
            for row in snippet_rows:
                evidence = row.get("evidence") or {}
                for subcat in row.get("request_subcategories") or []:
                    if subcat not in snippets:
                        snippets[subcat] = []
                    for snippet in _evidence_snippets(evidence.get(subcat)):
                        if len(snippets[subcat]) >= 3:
                            break
                        if snippet not in snippets[subcat]:
                            snippets[subcat].append(snippet)
            items = []
            for subcat, count in counts.items():
                if count < segment_min_summary_count:
                    continue
                label = subcat.split("/", 1)[1] if "/" in subcat else subcat
                label = label.replace("_", " ").strip().title() or "-"
                items.append(
                    {
                        "key": subcat,
                        "label": label,
                        "count": count,
                        "snippets": snippets.get(subcat, []),
                    }
                )
            items.sort(key=lambda item: item.get("count", 0), reverse=True)
            return items[:limit]

        overall_request_cat_rate: dict[str, float] = {}
        if review_rows:
            all_request_counts = _request_category_counts(review_rows)
            for main_key in all_request_counts:
                cat_rows = _rows_for_request_category(review_rows, main_key)
                rate = _rec_rate(cat_rows)
                if rate is not None:
                    overall_request_cat_rate[main_key] = rate

        def _segment_card(label: str, rows: list[dict], *, accent: str) -> str:
            if not rows:
                return (
                    "<div class='card'>"
                    f"<div class='accent-bar' style='background:{accent};'></div>"
                    f"<div class='card-title'>{_h(label)}</div>"
                    "<div class='muted'>No data available.</div>"
                    "</div>"
                )
            rec_rate = _rec_rate(rows)
            request_counts = _request_category_counts(rows)
            top_cat = max(request_counts, key=request_counts.get) if request_counts else ""
            top_cat_label = MAIN_CATEGORY_LABELS.get(top_cat, top_cat.title() if top_cat else "-")
            top_cat_volume = request_counts.get(top_cat, 0) if top_cat else 0
            cat_rows = _rows_for_request_category(rows, top_cat) if top_cat else []
            cat_rate = _rec_rate(cat_rows)
            overall_rate = overall_request_cat_rate.get(top_cat)
            delta = (cat_rate - overall_rate) if (cat_rate is not None and overall_rate is not None) else None

            snippet_rows = rows
            if summary_review_cap and len(rows) > summary_review_cap:
                snippet_rows = sorted(
                    rows,
                    key=lambda item: int(item.get("helpful_votes", 0) or 0),
                    reverse=True,
                )[:summary_review_cap]
            request_items = _top_request_items(rows, snippet_rows=snippet_rows)
            segment_summaries = _summarize_issue_requests([], request_items) if request_items else {}

            def _segment_item_summary(item: dict) -> str:
                summary = segment_summaries.get(item.get("key"))
                if not summary:
                    summary = segment_summaries.get(_safe_text(item.get("label")).lower())
                if not summary:
                    summary = _fallback_summary(item)
                return summary

            if request_items:
                request_lines = []
                for item in request_items:
                    summary = _segment_item_summary(item)
                    request_lines.append(
                        "<div class='card-note'>"
                        f"<strong>{_h(item.get('label'))}</strong> · {_h(item.get('count'))} {_h(volume_label)}"
                        "</div>"
                        f"<div class='card-quote'>{_h(summary)}</div>"
                    )
                requests_html = "".join(request_lines)
            else:
                requests_html = "<div class='muted'>No feature requests found.</div>"

            meta_lines = [
                f"{len(rows)} reviews · rec {_fmt_pct(rec_rate)}",
            ]
            if top_cat:
                meta_lines.append(
                    f"Top request category: {top_cat_label} ({_safe_text(top_cat_volume)} {volume_label})"
                )
            if cat_rate is not None:
                delta_text = _fmt_pp(delta) if delta is not None else "-"
                meta_lines.append(f"Category rec rate: {_fmt_pct(cat_rate)} · delta {delta_text} vs overall")
            meta_html = "".join(f"<div class='card-note'>{_h(line)}</div>" for line in meta_lines)

            return (
                "<div class='card'>"
                f"<div class='accent-bar' style='background:{accent};'></div>"
                f"<div class='card-title'>{_h(label)}</div>"
                f"{meta_html}{requests_html}"
                "</div>"
            )

        playtime_segments = {
            "<2h": [],
            "2–20h": [],
            "20h+": [],
        }
        for row in review_rows:
            playtime_key = _playtime_bucket(int(row.get("playtime_total", 0) or 0))
            playtime_segments.setdefault(playtime_key, []).append(row)

        playtime_cards = [
            _segment_card(key, playtime_segments.get(key, []), accent=COL_ACCENT_2)
            for key in ("<2h", "2–20h", "20h+")
        ]

        segmentation_html = (
            "<div class='section'>"
            "<div class='section-title'>Userbase segmentation</div>"
            "<div class='subsection-title'>Playtime cohorts</div>"
            f"<div class='subsection-note'>Top request category + top 3 feature requests per cohort ({segmentation_weight_note}).</div>"
            f"{_cards_grid(playtime_cards, columns=3)}"
            "</div>"
        )
    else:
        segmentation_html = (
            "<div class='section'>"
            "<div class='section-title'>Userbase segmentation</div>"
            "<div class='muted'>Segmentation unavailable (missing review data).</div>"
            "</div>"
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
                score = sum(_weighted_value(item, "count") for item in entries)
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
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": _weighted_value(item, "count")}
            for item in entries
        ]
        subcats = [item for item in subcats if item.get("category")]
        subcats.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
        issue_items = [
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": _weighted_value(item, "issue_count")}
            for item in entries
        ]
        issue_items = [item for item in issue_items if item.get("count", 0)]
        issue_items.sort(key=lambda item: int(item.get("count", 0) or 0), reverse=True)
        req_items = [
            {"category": _safe_text(item.get("sub_category") or item.get("subcategory", "")), "count": _weighted_value(item, "request_count")}
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
            cat_total = sum(int(item.get("count", 0) or 0) for item in subcats)
        except Exception:
            cat_total = 0
        if not cat_total:
            try:
                cat_total = int(rate_payload.get("count", 0) or 0)
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
            cat_note = f"{cat_total} {volume_label} in this category"

        snapshot_lines = []
        if cat_total:
            snapshot_lines.append(f"{cat_total} {volume_label}")
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
            snapshot_lines.append(f"Issue volume: {issue_total}")
        if request_total:
            snapshot_lines.append(f"Request volume: {request_total}")
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

    reviews_payload = reviews if isinstance(reviews, list) else []

    interactive_html = ""
    if interactive:
        interactive_html = f"""
  <script id="review-data" type="application/json">{_json_script(reviews_payload)}</script>
  <div id="review-modal" class="modal-overlay" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <div id="review-modal-title" class="modal-title">Subcategory</div>
          <div id="review-modal-meta" class="modal-meta"></div>
        </div>
        <button class="modal-close" type="button" data-close-modal>Close</button>
      </div>
      <div id="review-modal-list" class="modal-list"></div>
    </div>
  </div>
  <script>
  (function() {{
    const dataEl = document.getElementById('review-data');
    if (!dataEl) return;
    let reviews = [];
    try {{
      reviews = JSON.parse(dataEl.textContent || '[]');
    }} catch (err) {{
      reviews = [];
    }}

    const modal = document.getElementById('review-modal');
    const titleEl = document.getElementById('review-modal-title');
    const metaEl = document.getElementById('review-modal-meta');
    const listEl = document.getElementById('review-modal-list');

    const closeModal = () => {{
      if (!modal) return;
      modal.classList.remove('open');
      document.body.classList.remove('modal-open');
    }};

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {{
      btn.addEventListener('click', closeModal);
    }});

    if (modal) {{
      modal.addEventListener('click', (event) => {{
        if (event.target === modal) {{
          closeModal();
        }}
      }});
    }}

    document.addEventListener('keydown', (event) => {{
      if (event.key === 'Escape') {{
        closeModal();
      }}
    }});

    const renderReview = (review) => {{
      const card = document.createElement('div');
      card.className = 'review-card';

      const meta = document.createElement('div');
      meta.className = 'review-meta';
      const idSpan = document.createElement('span');
      idSpan.textContent = 'Review ID ' + (review.review_id ?? '—');
      const helpfulSpan = document.createElement('span');
      helpfulSpan.textContent = (review.votes_up || 0) + ' helpful';
      meta.appendChild(idSpan);
      meta.appendChild(helpfulSpan);
      card.appendChild(meta);

      const text = document.createElement('p');
      text.className = 'review-text';
      text.textContent = review.review || '';
      card.appendChild(text);

      const footer = document.createElement('div');
      footer.className = 'review-footer';
      const badge = document.createElement('span');
      badge.className = 'pill ' + (review.voted_up ? 'pill-pos' : 'pill-neg');
      badge.textContent = review.voted_up ? 'Recommended' : 'Not recommended';
      footer.appendChild(badge);
      card.appendChild(footer);

      return card;
    }};

    const openModal = (subcategory, label, mainLabel) => {{
      if (!modal || !listEl || !titleEl || !metaEl) return;
      const filtered = reviews.filter((review) =>
        Array.isArray(review.llm_subcategories) && review.llm_subcategories.includes(subcategory)
      );
      filtered.sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0));

      titleEl.textContent = label || subcategory || 'Subcategory';
      const metaBits = [];
      if (mainLabel) metaBits.push(mainLabel);
      metaBits.push(filtered.length + ' reviews');
      metaEl.textContent = metaBits.join(' · ');

      while (listEl.firstChild) {{
        listEl.removeChild(listEl.firstChild);
      }}

      if (!filtered.length) {{
        const empty = document.createElement('div');
        empty.className = 'modal-empty';
        empty.textContent = 'No reviews found for this subcategory.';
        listEl.appendChild(empty);
      }} else {{
        filtered.forEach((review) => {{
          listEl.appendChild(renderReview(review));
        }});
      }}

      modal.classList.add('open');
      document.body.classList.add('modal-open');
    }};

    document.querySelectorAll('.sub-row-button').forEach((btn) => {{
      btn.addEventListener('click', () => {{
        openModal(btn.dataset.subcategory || '', btn.dataset.label || '', btn.dataset.main || '');
      }});
    }});

    document.querySelectorAll('.sub-toggle').forEach((btn) => {{
      btn.addEventListener('click', () => {{
        const key = btn.dataset.category;
        if (!key) return;
        const card = document.querySelector('.category-card[data-category="' + key + '"]');
        if (!card) return;
        const hiddenRows = card.querySelectorAll('.sub-row[data-hidden="true"]');
        const isExpanded = card.getAttribute('data-expanded') === 'true';
        hiddenRows.forEach((row) => {{
          row.hidden = !isExpanded ? false : true;
        }});
        card.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
        btn.textContent = isExpanded ? '+' : '-';
        const countEl = card.querySelector('.sub-count');
        if (countEl) {{
          const total = parseInt(card.getAttribute('data-total') || '0', 10) || 0;
          const shown = isExpanded ? Math.min(3, total) : total;
          countEl.textContent = 'Showing ' + shown + ' of ' + total;
        }}
      }});
    }});
  }})();
  </script>
"""

    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>{css}</style>
</head>
<body>
  <div class="screen-wrap">
    <div class="cover">
      {image_html}
      <div class="kicker">Insights report</div>
      <h1>SentiNext report for {_h(game_name)}</h1>
      <div class="muted">App id {_h(app_id)} &middot; Generated {generated_at}</div>
      <div class="meta">{_h(meta_line)}</div>
      <div class="pill-row">{''.join(chip_items)}</div>
    </div>

    <div class="section">
      <div class="section-title">Main KPIs</div>
      <table class="stat-grid"><tr>{stat_cells}</tr></table>
    </div>

    <div class="section">
      <div class="section-title">Overall views of categories</div>
      {category_board_html}
    </div>

    {issue_request_section_html}

    {segmentation_html}

    <div class="footer-note">
      Generated by SentiNext.
    </div>
  </div>
  {interactive_html}
</body>
</html>
"""
    return html_doc


def _render_comparison_html(reports: list[dict]) -> str:
    if not reports:
        return ""

    font_css, font_stack = _font_css()
    css = _build_css(font_css, font_stack)
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    image_html = ""
    first_image = reports[0].get("game_image_url") if isinstance(reports[0], dict) else None
    image_payload = _fetch_steam_header_image(first_image or "")
    if image_payload:
        image_bytes, mime = image_payload
        try:
            with PILImage.open(BytesIO(image_bytes)) as img:
                img.verify()
            image_html = f"<img class='hero-image' src='{_image_data_uri(image_bytes, mime)}' alt='Steam header' />"
        except Exception:
            image_html = ""

    def _entry_key(entry: dict) -> str:
        raw_key = _safe_text(entry.get("subcategory") or entry.get("sub_category") or "").strip()
        if not raw_key:
            return ""
        if "/" not in raw_key:
            main = _safe_text(entry.get("main_category") or "").strip()
            if main:
                raw_key = f"{main}/{raw_key}"
        return raw_key

    games = []
    any_weighted = False
    for report in reports:
        if not isinstance(report, dict):
            continue
        app_id = int(report.get("app_id", 0) or 0)
        game_name = _safe_text(report.get("game_name", "-")).strip() or "-"
        metadata = report.get("metadata", {}) if isinstance(report.get("metadata"), dict) else {}
        insights = report.get("insights", {}) if isinstance(report.get("insights"), dict) else {}
        reviews = report.get("reviews") if isinstance(report.get("reviews"), list) else []
        llm_labels = report.get("llm_labels") if isinstance(report.get("llm_labels"), dict) else {}
        llm_metrics = insights.get("llm", {}) if isinstance(insights, dict) else {}
        category_rates = insights.get("category_recommendation_rates") or {}
        if not isinstance(category_rates, dict):
            category_rates = {}
        subcat_records = list(insights.get("subcategory_insights") or []) if isinstance(insights, dict) else []
        weighted_counts = _weighted_subcategory_counts(reviews or [], llm_labels)
        _apply_weighted_counts(subcat_records, weighted_counts)
        if weighted_counts:
            any_weighted = True

        subcategory_by_main: dict[str, list[dict]] = {}
        subcat_map: dict[str, dict] = {}
        for entry in subcat_records:
            if not isinstance(entry, dict):
                continue
            key = _entry_key(entry)
            if key:
                subcat_map[key] = entry
            main = _safe_text(entry.get("main_category") or "").strip().lower()
            if not main:
                raw = _safe_text(entry.get("subcategory") or "")
                if "/" in raw:
                    main = raw.split("/", 1)[0].strip().lower()
                else:
                    main = "other"
            subcategory_by_main.setdefault(main, []).append(entry)
        for entries in subcategory_by_main.values():
            entries.sort(key=lambda item: _weighted_value(item, "count"), reverse=True)

        games.append(
            {
                "app_id": app_id,
                "name": game_name,
                "metadata": metadata,
                "insights": insights,
                "llm_metrics": llm_metrics,
                "subcategory_by_main": subcategory_by_main,
                "subcat_map": subcat_map,
                "category_rates": category_rates,
                "subcat_records": subcat_records,
            }
        )

    if not games:
        return ""

    volume_label = "weighted mentions" if any_weighted else "mentions"
    game_names = [game["name"] for game in games]
    game_title = " vs ".join(game_names)

    pills = "".join(
        f"<span class='pill'>{_h(game['name'])} · {_h(game['metadata'].get('retrieved', '-'))} reviews</span>"
        for game in games
    )

    meta_rows = [
        [
            _safe_text(game["name"]),
            _safe_text(game["app_id"]),
            _safe_text(game["metadata"].get("retrieved", "-")),
            _safe_text(game["metadata"].get("language", "-")),
            _safe_text(game["metadata"].get("fetched_at", "-")),
        ]
        for game in games
    ]
    meta_table = _html_table(["Game", "App id", "Reviews", "Lang", "Fetched"], meta_rows)

    kpi_headers = ["Metric", *game_names]
    kpi_rows = [
        ["Recommendation rate", *[_fmt_pct(game["insights"].get("recommendation")) for game in games]],
        ["Issue rate", *[_fmt_pct(game["llm_metrics"].get("issue_rate")) for game in games]],
        ["Request rate", *[_fmt_pct(game["llm_metrics"].get("feature_request_rate")) for game in games]],
        ["Reviews analyzed", *[_safe_text(game["metadata"].get("retrieved", "-")) for game in games]],
    ]
    kpi_table = _html_table(kpi_headers, kpi_rows)

    def _top_subcategory(game: dict, key: str) -> str:
        best_entry = None
        best_count = 0
        for entry in game.get("subcat_records", []):
            count = _weighted_value(entry, key)
            if count > best_count:
                best_count = count
                best_entry = entry
        if not best_entry or best_count <= 0:
            return "-"
        raw = _safe_text(best_entry.get("subcategory") or best_entry.get("sub_category") or "")
        label = raw.split("/", 1)[1] if "/" in raw else raw
        label = label.replace("_", " ").strip().title() or "-"
        return f"{label} ({best_count})"

    issue_rows = [
        [
            _safe_text(game["name"]),
            _top_subcategory(game, "issue_count"),
            _top_subcategory(game, "request_count"),
        ]
        for game in games
    ]
    issue_table = _html_table(["Game", "Top issue", "Top request"], issue_rows)

    category_sections = []
    max_subcats_per_game = 6
    for main_key in MAIN_CATEGORY_LABELS:
        if main_key == "other":
            continue
        entries_by_game = [game["subcategory_by_main"].get(main_key, []) for game in games]
        union_keys: list[str] = []
        seen = set()
        for entries in entries_by_game:
            for entry in entries[:max_subcats_per_game]:
                key = _entry_key(entry)
                if not key or key in seen:
                    continue
                seen.add(key)
                union_keys.append(key)
        if not union_keys:
            continue

        rows = []
        for key in union_keys:
            label = key.split("/", 1)[1] if "/" in key else key
            label = label.replace("_", " ").strip().title() or "-"
            row = [label]
            for game in games:
                entry = game["subcat_map"].get(key)
                rate = _fmt_pct(entry.get("recommendation_rate")) if entry else "-"
                row.append(rate)
            rows.append(row)

        headers = ["Subcategory", *game_names]
        table_html = _html_table(headers, rows)

        meta_bits = []
        for idx, game in enumerate(games):
            entries = entries_by_game[idx]
            total = 0
            try:
                total = sum(_weighted_value(item, "count") for item in entries)
            except Exception:
                total = 0
            if not total:
                payload = game["category_rates"].get(main_key) if isinstance(game["category_rates"], dict) else {}
                if isinstance(payload, dict):
                    try:
                        total = int(payload.get("count", 0) or 0)
                    except Exception:
                        total = 0
            rate_payload = game["category_rates"].get(main_key) if isinstance(game["category_rates"], dict) else {}
            rate_value = rate_payload.get("rate") if isinstance(rate_payload, dict) else None
            rate_text = _fmt_pct(rate_value) if rate_payload else "-"
            meta_bits.append(f"{game['name']}: {rate_text} · {total} {volume_label}")

        category_sections.append(
            f"<div class='subsection-title'>{_h(MAIN_CATEGORY_LABELS.get(main_key, main_key.title()))}</div>"
            f"<div class='subsection-note'>{_h(' · '.join(meta_bits))}</div>"
            f"{table_html}"
        )

    if category_sections:
        categories_html = "".join(category_sections)
    else:
        categories_html = "<div class='muted'>No category insights available yet.</div>"

    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>{css}</style>
</head>
<body>
  <div class="screen-wrap">
    <div class="cover">
      {image_html}
      <div class="kicker">Insights report</div>
      <h1>SentiNext comparison report</h1>
      <div class="muted">Generated {generated_at}</div>
      <div class="meta">{_h(game_title)}</div>
      <div class="pill-row">{pills}</div>
    </div>

    <div class="section">
      <div class="section-title">Games compared</div>
      {meta_table}
    </div>

    <div class="section">
      <div class="section-title">Main KPIs</div>
      {kpi_table}
    </div>

    <div class="section">
      <div class="section-title">Issues & feature requests</div>
      <div class="subsection-note">Top subcategory by {volume_label}.</div>
      {issue_table}
    </div>

    <div class="section">
      <div class="section-title">Category comparison</div>
      <div class="subsection-note">Recommendation rate by subcategory. Ordered by {volume_label}.</div>
      {categories_html}
    </div>

    <div class="footer-note">
      Generated by SentiNext.
    </div>
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
    reviews: Optional[list[dict]] = None,
    llm_labels: Optional[dict] = None,
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
        reviews=reviews,
        llm_labels=llm_labels,
    )
    base_url = str(Path(__file__).resolve().parent)
    return HTML(string=html_doc, base_url=base_url).write_pdf()


def render_insights_html(
    *,
    app_id: int,
    game_name: str,
    metadata: Dict[str, Any],
    insights: Dict[str, Any],
    game_image_url: Optional[str] = None,
    reviews: Optional[list[dict]] = None,
    llm_labels: Optional[dict] = None,
) -> str:
    return _render_html(
        app_id=app_id,
        game_name=game_name,
        metadata=metadata,
        insights=insights,
        game_image_url=game_image_url,
        reviews=reviews,
        llm_labels=llm_labels,
        interactive=False,
    )


def render_insights_html_interactive(
    *,
    app_id: int,
    game_name: str,
    metadata: Dict[str, Any],
    insights: Dict[str, Any],
    reviews: Optional[list[dict]] = None,
    game_image_url: Optional[str] = None,
    llm_labels: Optional[dict] = None,
) -> str:
    return _render_html(
        app_id=app_id,
        game_name=game_name,
        metadata=metadata,
        insights=insights,
        reviews=reviews,
        game_image_url=game_image_url,
        llm_labels=llm_labels,
        interactive=True,
    )


def render_insights_comparison_pdf(*, reports: list[dict]) -> bytes:
    if HTML is None:
        error = _WEASYPRINT_ERROR
        raise RuntimeError(
            "WeasyPrint is required for HTML-to-PDF rendering. "
            "Install it and its system dependencies, then retry."
        ) from error

    html_doc = _render_comparison_html(reports)
    base_url = str(Path(__file__).resolve().parent)
    return HTML(string=html_doc, base_url=base_url).write_pdf()


def render_insights_comparison_html(*, reports: list[dict]) -> str:
    return _render_comparison_html(reports)
