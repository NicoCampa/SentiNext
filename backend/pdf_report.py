from __future__ import annotations

from datetime import datetime
import os
import json
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
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




def _try_register_ttf(font_name: str, ttf_path: Path) -> bool:
    try:
        if not ttf_path.exists():
            return False
        pdfmetrics.registerFont(TTFont(font_name, str(ttf_path)))
        return True
    except Exception:
        return False


def _resolve_pdf_fonts() -> tuple[str, str]:
    """Best-effort modern UI font. Falls back to Helvetica if no TTFs are available.

    Website font stack is `ui-sans-serif, system-ui, -apple-system, ...` (SF Pro on macOS).
    SF Pro is not redistributable, so for PDFs we support optional Inter (or any TTF you provide).
    """
    # Default PDF-safe fonts
    fallback_regular = "Helvetica"
    fallback_bold = "Helvetica-Bold"

    # Opt-in font directory (or repo default).
    candidates: list[Path] = []
    env_dir = os.getenv("SENTINEXT_PDF_FONT_DIR")
    if env_dir:
        candidates.append(Path(env_dir).expanduser())
    candidates.append(Path(__file__).resolve().parent / "assets" / "fonts")
    candidates.append(Path.cwd() / "backend" / "assets" / "fonts")

    # Space Grotesk (preferred if present). We ship the variable font, so bold uses the same face.
    for font_dir in candidates:
        sg_variable = font_dir / "SpaceGrotesk-Variable.ttf"
        if _try_register_ttf("SpaceGrotesk", sg_variable) and _try_register_ttf("SpaceGrotesk-Bold", sg_variable):
            return "SpaceGrotesk", "SpaceGrotesk-Bold"

    # Inter (recommended)
    for font_dir in candidates:
        inter_regular = font_dir / "Inter-Regular.ttf"
        inter_bold = font_dir / "Inter-SemiBold.ttf"
        if _try_register_ttf("Inter", inter_regular) and _try_register_ttf("Inter-Bold", inter_bold):
            return "Inter", "Inter-Bold"

    # Custom font names (advanced): provide two files named Regular.ttf and Bold.ttf
    for font_dir in candidates:
        custom_regular = font_dir / "Regular.ttf"
        custom_bold = font_dir / "Bold.ttf"
        if _try_register_ttf("Custom", custom_regular) and _try_register_ttf("Custom-Bold", custom_bold):
            return "Custom", "Custom-Bold"

    return fallback_regular, fallback_bold


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

    # Theme inspired by `web/src/app/globals.css` (light, airy, gradient accents).
    COL_BG = colors.HexColor("#f7f2ea")
    COL_TEXT = colors.HexColor("#0f172a")
    COL_MUTED = colors.HexColor("#344258")
    COL_MUTED_2 = colors.HexColor("#61708a")
    COL_BORDER = colors.Color(15 / 255, 23 / 255, 42 / 255, alpha=0.14)
    COL_CARD = colors.Color(1, 1, 1, alpha=0.94)
    COL_ACCENT = colors.HexColor("#f4a340")
    COL_ACCENT_2 = colors.HexColor("#2fc7b5")
    COL_ACCENT_3 = colors.HexColor("#ff6f61")

    BODY_FONT, BODY_FONT_BOLD = _resolve_pdf_fonts()

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="HeroTitle",
            parent=styles["Title"],
            fontName=BODY_FONT_BOLD,
            fontSize=28,
            leading=32,
            textColor=COL_TEXT,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2",
            parent=styles["Heading2"],
            fontName=BODY_FONT_BOLD,
            fontSize=14.5,
            leading=18,
            textColor=COL_TEXT,
            spaceBefore=8,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H3",
            parent=styles["Heading3"],
            fontName=BODY_FONT_BOLD,
            fontSize=11.2,
            leading=14,
            textColor=COL_TEXT,
            spaceBefore=6,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName=BODY_FONT,
            fontSize=10.5,
            leading=14,
            textColor=COL_TEXT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Muted",
            parent=styles["BodyText"],
            fontName=BODY_FONT,
            fontSize=9.6,
            leading=13,
            textColor=COL_MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TinyMuted",
            parent=styles["BodyText"],
            fontName=BODY_FONT,
            fontSize=8.6,
            leading=11,
            textColor=COL_MUTED_2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="StatNumber",
            parent=styles["BodyText"],
            fontName=BODY_FONT_BOLD,
            fontSize=16,
            leading=18,
            textColor=COL_TEXT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="StatLabel",
            parent=styles["BodyText"],
            fontName=BODY_FONT,
            fontSize=8.8,
            leading=11,
            textColor=COL_MUTED,
        )
    )
    story = []

    def heading(text: str) -> None:
        story.append(Paragraph(_safe_text(text), styles["H2"]))

    def subheading(text: str) -> None:
        story.append(Paragraph(_safe_text(text), styles["H3"]))

    def paragraph(text: str) -> None:
        story.append(Paragraph(_safe_text(text), styles["Body"]))

    class ProgressBar(Flowable):
        def __init__(self, value: float, *, width: float, height: float = 10, color=COL_ACCENT_2):
            super().__init__()
            self.value = max(0.0, min(1.0, float(value or 0.0)))
            self.width = float(width)
            self.height = float(height)
            self.color = color

        def wrap(self, availWidth, availHeight):
            return min(self.width, availWidth), self.height

        def draw(self):
            w, h = self.wrap(self.width, 0)
            self.canv.setLineWidth(0.6)
            self.canv.setStrokeColor(COL_BORDER)
            self.canv.setFillColor(colors.Color(1, 1, 1, alpha=0.55))
            self.canv.roundRect(0, 0, w, h, 4, fill=1, stroke=1)
            if self.value > 0:
                self.canv.setFillColor(self.color)
                self.canv.roundRect(0, 0, w * self.value, h, 4, fill=1, stroke=0)

    class DonutChart(Flowable):
        def __init__(
            self,
            segments: list[tuple[float, colors.Color]],
            *,
            width: float,
            height: float,
            ring: float = 0.42,
        ):
            super().__init__()
            self.segments = [(max(0.0, float(v)), c) for v, c in segments]
            self.width = float(width)
            self.height = float(height)
            self.ring = float(ring)

        def wrap(self, availWidth, availHeight):
            return min(self.width, availWidth), min(self.height, availHeight) if availHeight else self.height

        def draw(self):
            w, h = self.wrap(self.width, self.height)
            cx, cy = w / 2, h / 2
            r = min(w, h) / 2
            total = sum(v for v, _ in self.segments) or 1.0
            start = 90.0
            for value, color in self.segments:
                if value <= 0:
                    continue
                angle = 360.0 * (value / total)
                self.canv.setFillColor(color)
                self.canv.setStrokeColor(color)
                self.canv.wedge(cx - r, cy - r, cx + r, cy + r, start, start - angle, stroke=0, fill=1)
                start -= angle

            # Cutout
            inner_r = r * (1.0 - max(0.1, min(self.ring, 0.8)))
            self.canv.setFillColor(COL_CARD)
            self.canv.setStrokeColor(COL_CARD)
            self.canv.circle(cx, cy, inner_r, stroke=0, fill=1)

            # Center dot for polish
            self.canv.setFillColor(colors.Color(15 / 255, 23 / 255, 42 / 255, alpha=0.10))
            self.canv.circle(cx, cy, 1.2, stroke=0, fill=1)

    class Sparkline(Flowable):
        def __init__(
            self,
            values: list[float],
            *,
            width: float,
            height: float = 34,
            color: colors.Color = COL_ACCENT_3,
        ):
            super().__init__()
            self.values = [float(v) for v in values if v is not None]
            self.width = float(width)
            self.height = float(height)
            self.color = color

        def wrap(self, availWidth, availHeight):
            return min(self.width, availWidth), self.height

        def draw(self):
            w, h = self.wrap(self.width, 0)
            if len(self.values) < 2:
                self.canv.setStrokeColor(COL_BORDER)
                self.canv.setLineWidth(0.8)
                self.canv.line(0, h / 2, w, h / 2)
                return

            min_v = min(self.values)
            max_v = max(self.values)
            span = (max_v - min_v) or 1.0

            def to_xy(i: int, v: float) -> tuple[float, float]:
                x = (w * i) / (len(self.values) - 1)
                y = (h - 2) * ((v - min_v) / span) + 1
                return x, y

            # background track
            self.canv.setStrokeColor(COL_BORDER)
            self.canv.setLineWidth(0.6)
            self.canv.line(0, 1, w, 1)

            # area fill
            self.canv.setFillColor(colors.Color(self.color.red, self.color.green, self.color.blue, alpha=0.16))
            path = self.canv.beginPath()
            x0, y0 = to_xy(0, self.values[0])
            path.moveTo(x0, y0)
            for i, v in enumerate(self.values[1:], start=1):
                x, y = to_xy(i, v)
                path.lineTo(x, y)
            path.lineTo(w, 1)
            path.lineTo(0, 1)
            path.close()
            self.canv.drawPath(path, stroke=0, fill=1)

            # line
            self.canv.setStrokeColor(self.color)
            self.canv.setLineWidth(1.6)
            path2 = self.canv.beginPath()
            path2.moveTo(x0, y0)
            for i, v in enumerate(self.values[1:], start=1):
                x, y = to_xy(i, v)
                path2.lineTo(x, y)
            self.canv.drawPath(path2, stroke=1, fill=0)

            # endpoint
            xe, ye = to_xy(len(self.values) - 1, self.values[-1])
            self.canv.setFillColor(self.color)
            self.canv.circle(xe, ye, 2.2, stroke=0, fill=1)

    class Pill(Flowable):
        def __init__(
            self,
            text: str,
            *,
            bg: colors.Color = colors.Color(1, 1, 1, alpha=0.65),
            border: colors.Color = COL_BORDER,
            fg: colors.Color = COL_MUTED,
            pad_x: float = 10,
            pad_y: float = 5,
            radius: float = 10,
            font_size: float = 9.0,
        ):
            super().__init__()
            self.text = _safe_text(text)
            self.bg = bg
            self.border = border
            self.fg = fg
            self.pad_x = float(pad_x)
            self.pad_y = float(pad_y)
            self.radius = float(radius)
            self.font_size = float(font_size)

        def wrap(self, availWidth, availHeight):
            font = BODY_FONT_BOLD
            try:
                text_w = self.canv.stringWidth(self.text, font, self.font_size)
            except Exception:
                text_w = len(self.text) * 5
            w = min(availWidth, text_w + 2 * self.pad_x)
            h = self.font_size + 2 * self.pad_y
            return w, h

        def draw(self):
            w, h = self.wrap(10_000, 0)
            self.canv.setFillColor(self.bg)
            self.canv.setStrokeColor(self.border)
            self.canv.setLineWidth(0.6)
            self.canv.roundRect(0, 0, w, h, min(self.radius, h / 2), fill=1, stroke=1)
            self.canv.setFillColor(self.fg)
            self.canv.setFont(BODY_FONT_BOLD, self.font_size)
            self.canv.drawString(self.pad_x, self.pad_y, self.text)

    class BarList(Flowable):
        def __init__(
            self,
            items: list[dict],
            *,
            width: float,
            value_key: str = "count",
            label_key: str = "category",
            max_items: int = 6,
            row_height: float = 16,
            bar_color=COL_ACCENT,
        ):
            super().__init__()
            self.items = items[:max_items]
            self.width = float(width)
            self.value_key = value_key
            self.label_key = label_key
            self.max_items = max_items
            self.row_height = float(row_height)
            self.bar_color = bar_color

        def wrap(self, availWidth, availHeight):
            w = min(self.width, availWidth)
            h = max(1, len(self.items)) * self.row_height + 2
            return w, h

        def draw(self):
            w, h = self.wrap(self.width, 0)
            items = self.items
            max_value = 0
            for it in items:
                try:
                    max_value = max(max_value, int(it.get(self.value_key, 0) or 0))
                except Exception:
                    continue
            max_value = max(max_value, 1)

            label_col = w * 0.54
            bar_col = w - label_col - 2
            y = h - self.row_height
            self.canv.setFont(BODY_FONT, 9.0)
            for it in items:
                raw_label = _safe_text(it.get(self.label_key, "")).replace("_", " ").strip() or "—"
                label = (raw_label[:42] + "…") if len(raw_label) > 43 else raw_label
                try:
                    value = int(it.get(self.value_key, 0) or 0)
                except Exception:
                    value = 0

                # label
                self.canv.setFillColor(COL_TEXT)
                self.canv.drawString(0, y + 4, label)
                # value
                self.canv.setFillColor(COL_MUTED)
                self.canv.drawRightString(label_col - 6, y + 4, str(value))

                # bar track
                self.canv.setStrokeColor(COL_BORDER)
                self.canv.setFillColor(colors.Color(15 / 255, 23 / 255, 42 / 255, alpha=0.06))
                self.canv.roundRect(label_col, y + 3, bar_col, 10, 4, fill=1, stroke=1)
                # bar
                if value > 0:
                    frac = value / max_value
                    self.canv.setFillColor(self.bar_color)
                    self.canv.roundRect(label_col, y + 3, bar_col * frac, 10, 4, fill=1, stroke=0)
                y -= self.row_height

    def card(flowables: list, *, pad: float = 10) -> Table:
        table = Table([[flowables]], colWidths=[doc.width])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), COL_CARD),
                    ("BOX", (0, 0), (-1, -1), 0.6, COL_BORDER),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), pad),
                    ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                    ("TOPPADDING", (0, 0), (-1, -1), pad),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
                ]
            )
        )
        return table

    def stat_card(number: str, label: str) -> Table:
        table = Table(
            [[Paragraph(_safe_text(number), styles["StatNumber"])], [Paragraph(_safe_text(label), styles["StatLabel"])]],
            colWidths=[doc.width / 4 - 6],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.Color(1, 1, 1, alpha=0.65)),
                    ("BOX", (0, 0), (-1, -1), 0.6, COL_BORDER),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        return table

    def widget(title: str, content: list, *, accent=COL_ACCENT) -> Table:
        accent_bar = Table([[""]], colWidths=[doc.width], rowHeights=[3])
        accent_bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent), ("LINEBELOW", (0, 0), (-1, -1), 0, accent)]))
        return card([accent_bar, Spacer(1, 6), Paragraph(_safe_text(title), styles["H3"]), Spacer(1, 4), *content], pad=10)

    def kv_table(rows: list[list[Any]], *, col_widths: Optional[list[float]] = None) -> Table:
        table = Table(rows, colWidths=col_widths)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), COL_TEXT),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("BOX", (0, 0), (-1, -1), 0.6, COL_BORDER),
                    ("INNERGRID", (0, 0), (-1, -1), 0.6, COL_BORDER),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9.0),
                    ("TEXTCOLOR", (0, 1), (-1, -1), COL_TEXT),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
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

    # Cover
    try_add_header_image()
    generated_at = datetime.utcnow().isoformat() + "Z"
    story.append(Paragraph("<font color='#0f172a'>Steam review insights · PDF report</font>", styles["TinyMuted"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"SentiNext report for <font color='#0f172a'><b>{_safe_text(game_name)}</b></font>", styles["HeroTitle"]))
    story.append(Paragraph(f"<font color='#61708a'>App id {app_id} · Generated {generated_at}</font>", styles["Muted"]))
    story.append(Spacer(1, 10))

    # Chip row (dashboard-like metadata)
    ollama_model = os.getenv("SENTINEXT_OLLAMA_MODEL", "gpt-oss:20b-cloud")
    chip_items = [
        Pill(
            f"{_safe_text(metadata.get('retrieved', '—'))} reviews",
            fg=COL_TEXT,
            bg=colors.Color(244 / 255, 163 / 255, 64 / 255, alpha=0.18),
        ),
        Pill(
            f"LLM: {ollama_model}",
            fg=COL_TEXT,
            bg=colors.Color(47 / 255, 199 / 255, 181 / 255, alpha=0.16),
        ),
        Pill(
            f"Lang: {_safe_text(metadata.get('language', '—'))}",
            fg=COL_TEXT,
            bg=colors.Color(15 / 255, 23 / 255, 42 / 255, alpha=0.06),
        ),
    ]
    chip_row = Table([chip_items], colWidths=[doc.width / len(chip_items)] * len(chip_items))
    chip_row.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(chip_row)
    story.append(Spacer(1, 10))

    metrics = insights.get("metrics", {}) if isinstance(insights, dict) else {}
    llm_metrics = insights.get("llm", {}) if isinstance(insights, dict) else {}

    theme = insights.get("theme") if isinstance(insights, dict) else None
    theme_name = ""
    if isinstance(theme, dict):
        theme_name = _safe_text(theme.get("name") or "").strip()
    elif isinstance(theme, str):
        theme_name = theme.strip()
    if not theme_name:
        theme_name = "—"

    overview_rows = [
        ["Metric", "Value"],
        ["Requested reviews", _safe_text(metadata.get("requested", "—"))],
        ["Retrieved reviews", _safe_text(metadata.get("retrieved", "—"))],
        ["Language", _safe_text(metadata.get("language", "—"))],
        ["Fetched at", _safe_text(metadata.get("fetched_at", "—"))],
        ["Theme", theme_name],
    ]

    # Stat grid (inspired by the homepage dashboard)
    stat_grid = Table(
        [
            [
                stat_card(_fmt_pct(insights.get("recommendation")), "Recommendation rate"),
                stat_card(_safe_text(metrics.get("average_compound", "—")), "Avg sentiment (compound)"),
                stat_card(_fmt_pct(llm_metrics.get("issue_rate")), "Issue rate"),
                stat_card(_fmt_pct(llm_metrics.get("feature_request_rate")), "Request rate"),
            ]
        ],
        colWidths=[doc.width / 4] * 4,
    )
    stat_grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(stat_grid)
    story.append(Spacer(1, 12))

    subcategory_insights = insights.get("subcategory_insights") or []
    subcat_records = list(subcategory_insights) if isinstance(subcategory_insights, list) else []
    issue_subcats = [item for item in subcat_records if (item.get("issue_count", 0) or 0) > 0]
    request_subcats = [item for item in subcat_records if (item.get("request_count", 0) or 0) > 0]
    issue_subcats.sort(key=lambda item: int(item.get("issue_count", 0) or 0), reverse=True)
    request_subcats.sort(key=lambda item: int(item.get("request_count", 0) or 0), reverse=True)
    top_issue = issue_subcats[:1]
    top_req = request_subcats[:1]
    summary_bits = []
    if theme_name and theme_name != "—":
        summary_bits.append(f"Theme: <b>{_safe_text(theme_name)}</b>.")
    if top_issue:
        issue_label = _safe_text(top_issue[0].get("sub_category") or top_issue[0].get("subcategory", "")).replace("_", " ").strip()
        summary_bits.append(f"Top issue: <b>{issue_label}</b> ({_safe_text(top_issue[0].get('issue_count',''))} mentions).")
    if top_req:
        req_label = _safe_text(top_req[0].get("sub_category") or top_req[0].get("subcategory", "")).replace("_", " ").strip()
        summary_bits.append(f"Top request: <b>{req_label}</b> ({_safe_text(top_req[0].get('request_count',''))} mentions).")
    summary = " ".join(summary_bits) if summary_bits else "Summary not available."

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

    story.append(
        card(
            [
                Paragraph("Overview", styles["H3"]),
                Paragraph(summary, styles["Body"]),
                Spacer(1, 8),
                kv_table(overview_rows, col_widths=[58 * mm, doc.width - 58 * mm]),
            ]
        )
    )
    story.append(Spacer(1, 12))

    takeaway_bits = []
    if theme_name and theme_name != "—":
        takeaway_bits.append(f"Theme: <b>{_safe_text(theme_name)}</b>")
    if top_issue:
        takeaway_bits.append(
            f"Top issue: <b>{_safe_text(top_issue[0].get('sub_category') or top_issue[0].get('subcategory','')).replace('_', ' ')}</b>"
        )
    if top_req:
        takeaway_bits.append(
            f"Top request: <b>{_safe_text(top_req[0].get('sub_category') or top_req[0].get('subcategory','')).replace('_', ' ')}</b>"
        )
    if insights.get("recommendation") is not None:
        takeaway_bits.append(f"Recommendation rate: <b>{_fmt_pct(insights.get('recommendation'))}</b>")
    if not takeaway_bits:
        takeaway_bits.append("Highlights unavailable yet.")
    takeaways_text = "<br/>".join(f"{idx + 1}. {text}" for idx, text in enumerate(takeaway_bits))

    if requested_count <= 0:
        quality_note = "Coverage data unavailable."
    elif retrieved_count < requested_count:
        quality_note = f"Coverage {retrieval_rate * 100:.0f}% of requested reviews."
    else:
        quality_note = "Coverage 100% of requested reviews."

    quality_flow = [
        Paragraph(
            f"<b>{retrieved_count}</b> <font color='#61708a'>retrieved</font> / <b>{requested_count}</b> <font color='#61708a'>requested</font>",
            styles["Body"],
        ),
        Spacer(1, 6),
        ProgressBar(retrieval_rate, width=(doc.width / 2) - 22, height=10, color=COL_ACCENT_2),
        Spacer(1, 4),
        Paragraph(quality_note, styles["TinyMuted"]),
    ]

    detail_row = Table(
        [
            [
                widget("Key takeaways", [Paragraph(takeaways_text, styles["Body"])], accent=COL_ACCENT_2),
                widget("Data quality", quality_flow, accent=COL_ACCENT),
            ]
        ],
        colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6],
    )
    detail_row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(detail_row)
    story.append(Spacer(1, 16))

    issue_records = list(issue_subcats) if issue_subcats else []
    req_records = list(request_subcats) if request_subcats else []

    # Widget dashboard page (cards instead of tables)
    story.append(PageBreak())
    heading("Dashboard")

    sentiment_counts = insights.get("sentiment_counts") or []
    sentiment_map = {}
    if isinstance(sentiment_counts, list):
        for row in sentiment_counts:
            if isinstance(row, dict) and row.get("sentiment"):
                sentiment_map[str(row["sentiment"]).lower()] = int(row.get("count", 0) or 0)
    pos = sentiment_map.get("positive") or sentiment_map.get("recommended") or sentiment_map.get("thumbs_up") or 0
    neg = sentiment_map.get("negative") or sentiment_map.get("not_recommended") or sentiment_map.get("thumbs_down") or 0
    total = max(1, pos + neg)
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

    category_rates = insights.get("category_recommendation_rates") or {}
    category_items: list[dict] = []
    if subcat_records:
        main_counts: dict[str, int] = {}
        for entry in subcat_records:
            if not isinstance(entry, dict):
                continue
            main = _safe_text(entry.get("main_category") or "").strip()
            if not main:
                raw = _safe_text(entry.get("subcategory") or "")
                main = raw.split("/", 1)[0] if "/" in raw else raw or "other"
            main_counts[main] = main_counts.get(main, 0) + int(entry.get("count", 0) or 0)
        category_items = [{"category": key, "count": value} for key, value in main_counts.items()]
        category_items.sort(key=lambda x: x.get("count", 0), reverse=True)
    elif isinstance(category_rates, dict):
        for k, payload in category_rates.items():
            if not isinstance(payload, dict):
                continue
            category_items.append({"category": str(k), "count": int(payload.get("count", 0) or 0)})
        category_items.sort(key=lambda x: x.get("count", 0), reverse=True)

    top_row = Table(
        [
            [
                widget(
                    "Top issue subcategories",
                    [
                        BarList(
                            issue_records,
                            width=(doc.width / 2) - 22,
                            value_key="issue_count",
                            label_key="subcategory",
                            bar_color=COL_ACCENT,
                        )
                    ],
                    accent=COL_ACCENT,
                ),
                widget(
                    "Top request subcategories",
                    [
                        BarList(
                            req_records,
                            width=(doc.width / 2) - 22,
                            value_key="request_count",
                            label_key="subcategory",
                            bar_color=COL_ACCENT_2,
                        )
                    ],
                    accent=COL_ACCENT_2,
                ),
            ]
        ],
        colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6],
    )
    top_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(top_row)
    story.append(Spacer(1, 12))

    bottom_row = Table(
        [
            [
                widget(
                    "Sentiment",
                    [
                        Table(
                            [
                                [
                                    DonutChart(
                                        [(pos, COL_ACCENT_2), (neg, COL_ACCENT_3)],
                                        width=54,
                                        height=54,
                                    ),
                                    Paragraph(
                                        f"<b>{_fmt_pct(rec_rate)}</b> <font color='#61708a'>recommendation rate</font><br/>"
                                        f"<font color='#344258'>Positive</font> <b>{pos}</b> · <font color='#344258'>Negative</font> <b>{neg}</b>",
                                        styles["Body"],
                                    ),
                                ]
                            ],
                            colWidths=[60, (doc.width / 2) - 22 - 60],
                        ),
                        Spacer(1, 8),
                        ProgressBar(rec_rate, width=(doc.width / 2) - 22, height=11, color=COL_ACCENT_3),
                    ],
                    accent=COL_ACCENT_3,
                ),
                widget(
                    "Trend (recommendation rate)",
                    [
                        Paragraph(
                            f"<b>{_fmt_pct(trend_series[-1] if trend_series else rec_rate)}</b> <font color='#61708a'>latest period</font>",
                            styles["Body"],
                        ),
                        Spacer(1, 6),
                        Sparkline(trend_series or [rec_rate, rec_rate], width=(doc.width / 2) - 22, height=34, color=COL_ACCENT),
                        Spacer(1, 6),
                        Paragraph("<font color='#344258'>Tip:</font> Re-run after your next patch to see if the line moves.", styles["TinyMuted"]),
                    ],
                    accent=COL_ACCENT,
                ),
            ]
        ],
        colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6],
    )
    bottom_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(bottom_row)
    story.append(PageBreak())

    def _detail_grid(records: list[dict], *, kind: str) -> Table:
        cards: list[list[Any]] = []
        row: list[Any] = []
        for item in records[:12]:
            raw_title = _safe_text(item.get("subcategory") or item.get("sub_category") or item.get("category") or "")
            title = raw_title.replace("/", " / ").replace("_", " ").strip() or "—"
            count_key = "issue_count" if kind == "issue" else "request_count"
            try:
                count = int(item.get(count_key, item.get("count", 0) or 0) or 0)
            except Exception:
                count = 0

            if kind == "issue":
                meta = f"{count} issue-tagged reviews" if count else "Issue signal"
                accent = COL_ACCENT
                snippets = item.get("issue_snippets") or []
            else:
                meta = f"{count} request-tagged reviews" if count else "Request signal"
                accent = COL_ACCENT_2
                snippets = item.get("request_snippets") or []

            if not isinstance(snippets, list):
                snippets = []
            example = _safe_text(snippets[0]) if snippets else ""

            flow = [
                Paragraph(f"<b>{title}</b>", styles["Body"]),
                Spacer(1, 4),
                Paragraph(f"<b>{count}</b> <font color='#61708a'>mentions</font>", styles["TinyMuted"]),
                Paragraph(f"<font color='#61708a'>{_safe_text(meta)}</font>", styles["TinyMuted"]),
            ]
            if example:
                flow.append(Spacer(1, 6))
                flow.append(Paragraph(f"“{_safe_text(example)[:170]}”", styles["TinyMuted"]))

            row.append(widget("", flow, accent=accent))
            if len(row) == 2:
                cards.append(row)
                row = []

        if row:
            row.append(Spacer(1, 1))
            cards.append(row)

        grid = Table(cards, colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6])
        grid.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        return grid

    heading("Top issue subcategories")
    story.append(Paragraph("Subcategories most frequently tagged as issues.", styles["Muted"]))
    story.append(Spacer(1, 10))
    story.append(_detail_grid(issue_records, kind="issue") if issue_records else card([Paragraph("No issues found.", styles["Muted"])]))
    story.append(PageBreak())

    heading("Top request subcategories")
    story.append(Paragraph("Subcategories most frequently tagged as requests.", styles["Muted"]))
    story.append(Spacer(1, 10))
    story.append(_detail_grid(req_records, kind="request") if req_records else card([Paragraph("No feature requests found.", styles["Muted"])]))

    # Signals page (more widgets)
    story.append(PageBreak())
    heading("Signals")
    story.append(Paragraph("Extra context to decide what to fix first.", styles["Muted"]))
    story.append(Spacer(1, 12))

    risk = insights.get("risk") or {}
    refund_risk = float(risk.get("refund_risk") or 0.0) if isinstance(risk, dict) else 0.0
    churn_rate = float(risk.get("churn_rate") or 0.0) if isinstance(risk, dict) else 0.0
    core_fan = float(risk.get("core_fan_disappointment") or 0.0) if isinstance(risk, dict) else 0.0

    playtime = insights.get("playtime") or {}
    helpful = insights.get("helpful") or {}

    signals_row = Table(
        [
            [
                widget(
                    "Risk meter",
                    [
                        Paragraph(f"<b>{refund_risk:.2f}</b> <font color='#61708a'>refund risk</font>", styles["TinyMuted"]),
                        ProgressBar(min(1.0, max(0.0, refund_risk)), width=(doc.width / 2) - 22, height=10, color=COL_ACCENT_3),
                        Spacer(1, 6),
                        Paragraph(f"<b>{churn_rate:.2f}</b> <font color='#61708a'>churn rate</font>", styles["TinyMuted"]),
                        ProgressBar(min(1.0, max(0.0, churn_rate)), width=(doc.width / 2) - 22, height=10, color=COL_ACCENT),
                        Spacer(1, 6),
                        Paragraph(f"<b>{core_fan:.2f}</b> <font color='#61708a'>core fan disappointment</font>", styles["TinyMuted"]),
                        ProgressBar(min(1.0, max(0.0, core_fan)), width=(doc.width / 2) - 22, height=10, color=COL_ACCENT_2),
                    ],
                    accent=COL_ACCENT_3,
                ),
                widget(
                    "Category hot spots",
                    [
                        BarList(category_items, width=(doc.width / 2) - 22, value_key="count", label_key="category", bar_color=COL_ACCENT_2),
                        Spacer(1, 8),
                        Paragraph("<font color='#344258'>Note:</font> Categories summarize tagged subcategories across reviews.", styles["TinyMuted"]),
                    ],
                    accent=COL_ACCENT_2,
                ),
            ]
        ],
        colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6],
    )
    signals_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(signals_row)
    story.append(Spacer(1, 12))

    engage_row = Table(
        [
            [
                widget(
                    "Playtime & engagement",
                    [
                        Paragraph(f"<b>{_safe_text(playtime.get('median_playtime_hours','—'))}</b> <font color='#61708a'>median hours</font>", styles["Body"]),
                        Paragraph(f"<font color='#61708a'>mean</font> <b>{_safe_text(playtime.get('mean_playtime_hours','—'))}</b> · <font color='#61708a'>recent median</font> <b>{_safe_text(playtime.get('median_recent_playtime_hours','—'))}</b>", styles["TinyMuted"]),
                        Spacer(1, 8),
                        Paragraph(f"<font color='#61708a'>avg helpful</font> <b>{_safe_text(helpful.get('average_votes_up','—'))}</b> · <font color='#61708a'>avg funny</font> <b>{_safe_text(helpful.get('average_votes_funny','—'))}</b>", styles["TinyMuted"]),
                    ],
                    accent=COL_ACCENT,
                ),
                widget(
                    "Label coverage",
                    [
                        Paragraph(
                            f"<b>{_fmt_pct(llm_metrics.get('coverage_rate'))}</b> <font color='#61708a'>reviews tagged</font>",
                            styles["TinyMuted"],
                        ),
                        Paragraph(
                            f"<font color='#61708a'>issue rate</font> <b>{_fmt_pct(llm_metrics.get('issue_rate'))}</b>",
                            styles["TinyMuted"],
                        ),
                        Paragraph(
                            f"<font color='#61708a'>request rate</font> <b>{_fmt_pct(llm_metrics.get('feature_request_rate'))}</b>",
                            styles["TinyMuted"],
                        ),
                    ],
                    accent=COL_ACCENT_2,
                ),
            ]
        ],
        colWidths=[(doc.width / 2) - 6, (doc.width / 2) - 6],
    )
    engage_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(engage_row)

    # Appendix (legacy deep tables) is opt-in to keep the default report modern.
    show_appendix = os.getenv("SENTINEXT_PDF_APPENDIX", "false").lower() in {"1", "true", "yes"}
    show_tables = os.getenv("SENTINEXT_PDF_APPENDIX_TABLES", "false").lower() in {"1", "true", "yes"}
    if show_appendix:
        story.append(PageBreak())
        heading("Appendix (details)")
        paragraph("Raw tables for debugging / deep dives.")
        story.append(Spacer(1, 10))

        if show_tables:
            records_table(
                title="Subcategory table",
                records=subcat_records,
                columns=["subcategory", "count", "issue_count", "request_count"],
                max_rows=30,
                col_widths=[64 * mm, 20 * mm, 20 * mm, 20 * mm],
            )
        def _add_legacy_pages() -> None:
            story.append(PageBreak())

            # Sentiment + engagement blocks
            heading("Sentiment & Engagement")
            playtime_legacy = insights.get("playtime") or {}
            helpful_legacy = insights.get("helpful") or {}

            metrics_rows = [
                ["Metric", "Value"],
                ["Recommendation rate", _fmt_pct(insights.get("recommendation"))],
                ["Avg compound", _safe_text(metrics.get("average_compound", "—"))],
                ["Median playtime (h)", _safe_text(playtime_legacy.get("median_playtime_hours", "—"))],
                ["Mean playtime (h)", _safe_text(playtime_legacy.get("mean_playtime_hours", "—"))],
                ["Median recent playtime (h)", _safe_text(playtime_legacy.get("median_recent_playtime_hours", "—"))],
                ["Avg helpful votes", _safe_text(helpful_legacy.get("average_votes_up", "—"))],
                ["Avg funny votes", _safe_text(helpful_legacy.get("average_votes_funny", "—"))],
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

            trend_legacy = insights.get("trend") or []
            if isinstance(trend_legacy, list) and trend_legacy:
                # Take the most recent periods
                records_table(
                    title="Recommendation Trend",
                    records=trend_legacy[-16:],
                    columns=[k for k in (trend_legacy[0].keys() if isinstance(trend_legacy[0], dict) else [])][:3]
                    or ["period", "recommendation_rate", "avg_compound"],
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
            risk_legacy = insights.get("risk") or {}
            if isinstance(risk_legacy, dict) and risk_legacy:
                rows = [["Metric", "Value"]] + [[k, _safe_text(v)] for k, v in risk_legacy.items()]
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

                    top_issues = payload.get("top_issue_subcategories") or []
                    if isinstance(top_issues, list) and top_issues:
                        records_table(
                            title=f"Top issue subcategories ({version_key})",
                            records=top_issues,
                            columns=["subcategory", "count"],
                            max_rows=10,
                            col_widths=[80 * mm, 30 * mm],
                        )

                    top_requests = payload.get("top_request_subcategories") or []
                    if isinstance(top_requests, list) and top_requests:
                        records_table(
                            title=f"Top request subcategories ({version_key})",
                            records=top_requests,
                            columns=["subcategory", "count"],
                            max_rows=10,
                            col_widths=[80 * mm, 30 * mm],
                        )

            player_segments = insights.get("player_segments") or {}
            if isinstance(player_segments, dict) and player_segments:
                for seg_key, payload in player_segments.items():
                    subheading(f"Player segment: {seg_key}")
                    snippet = json.dumps(payload, indent=2, ensure_ascii=False)[:2200]
                    story.append(Preformatted(snippet, styles["Code"]))
                    story.append(Spacer(1, 10))

        _add_legacy_pages()

    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            "Generated by SentiNext. This report summarizes public Steam review feedback and may contain noise.",
            styles["Italic"],
        )
    )

    def _draw_page(canvas, doc, *, cover: bool) -> None:
        canvas.saveState()
        page_width, page_height = A4

        # Background wash (subtle gradient; avoid "blob" dots).
        bg_mode = os.getenv("SENTINEXT_PDF_BG", "gradient").lower()
        if bg_mode == "solid":
            canvas.setFillColor(COL_BG)
            canvas.rect(0, 0, page_width, page_height, fill=1, stroke=0)
        else:
            top = colors.HexColor("#f7f2ea")
            bottom = colors.HexColor("#eef4f8")
            steps = 28
            for i in range(steps):
                t = i / max(1, steps - 1)
                r = top.red + (bottom.red - top.red) * t
                g = top.green + (bottom.green - top.green) * t
                b = top.blue + (bottom.blue - top.blue) * t
                canvas.setFillColor(colors.Color(r, g, b))
                y0 = (page_height * i) / steps
                y1 = (page_height * (i + 1)) / steps
                canvas.rect(0, y0, page_width, y1 - y0, fill=1, stroke=0)

            # Optional ultra-subtle accent wash on the cover.
            if cover and os.getenv("SENTINEXT_PDF_BG_ACCENT", "true").lower() in {"1", "true", "yes"}:
                canvas.setFillColor(colors.Color(244 / 255, 163 / 255, 64 / 255, alpha=0.06))
                canvas.rect(0, page_height * 0.64, page_width, page_height * 0.36, fill=1, stroke=0)
                canvas.setFillColor(colors.Color(47 / 255, 199 / 255, 181 / 255, alpha=0.05))
                canvas.rect(0, page_height * 0.46, page_width, page_height * 0.18, fill=1, stroke=0)

        # Header bar + logo mark.
        header_y = page_height - doc.topMargin + 6 * mm
        canvas.setStrokeColor(COL_BORDER)
        canvas.line(doc.leftMargin, header_y, page_width - doc.rightMargin, header_y)

        logo_size = 10 * mm
        logo_x = doc.leftMargin
        logo_y = page_height - doc.topMargin + 11 * mm
        canvas.setFillColor(COL_ACCENT)
        canvas.roundRect(logo_x, logo_y, logo_size, logo_size, 3, fill=1, stroke=0)
        canvas.setFillColor(COL_ACCENT_2)
        canvas.roundRect(logo_x + 3.2, logo_y + 3.2, logo_size - 6.4, logo_size - 6.4, 2.2, fill=1, stroke=0)

        canvas.setFillColor(COL_MUTED)
        canvas.setFont(BODY_FONT_BOLD, 10)
        canvas.drawString(logo_x + logo_size + 6, logo_y + 2.5, "SentiNext")

        # Footer
        canvas.setStrokeColor(COL_BORDER)
        footer_y = doc.bottomMargin - 6 * mm
        canvas.line(doc.leftMargin, footer_y, page_width - doc.rightMargin, footer_y)
        canvas.setFillColor(COL_MUTED_2)
        canvas.setFont(BODY_FONT, 8.5)
        canvas.drawString(doc.leftMargin, footer_y - 10, f"{_safe_text(game_name)} · app {app_id}")
        canvas.drawRightString(page_width - doc.rightMargin, footer_y - 10, f"Page {canvas.getPageNumber()}")

        canvas.restoreState()

    doc.build(
        story,
        onFirstPage=lambda c, d: _draw_page(c, d, cover=True),
        onLaterPages=lambda c, d: _draw_page(c, d, cover=False),
    )
    return buffer.getvalue()
