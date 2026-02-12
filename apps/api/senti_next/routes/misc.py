"""Miscellaneous endpoints: /translate, /compare/*, /report/*, /account."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import storage, llm
from ..steam_api import fetch_app_details
from .. import build_reviews_dataframe

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class TranslateRequest(BaseModel):
    text: str = Field(..., max_length=10000)
    target_language: str


class TranslateResponse(BaseModel):
    translated_text: str
    model_id: str


class GameComparisonData(BaseModel):
    app_id: int
    name: str
    reviews: List[dict] = Field(..., max_length=50)
    metrics: dict


class ComparisonSummarizeRequest(BaseModel):
    games: List[GameComparisonData] = Field(..., min_length=2, max_length=2)
    comparison_type: str = Field(..., pattern="^(overview|category|subcategory)$")
    category: Optional[str] = None
    subcategory: Optional[str] = None


class ComparisonSummaryResponse(BaseModel):
    summary: str
    winners: Dict[str, List[int]]
    key_differences: List[str]
    strengths_per_game: Dict[int, List[str]]
    weaknesses_per_game: Dict[int, List[str]]
    recommendations: Dict[int, str]
    cached: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/translate", response_model=TranslateResponse)
def translate_text_endpoint(request: TranslateRequest) -> TranslateResponse:

    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    target_language = (request.target_language or "").strip().lower()
    if not target_language:
        raise HTTPException(status_code=400, detail="Target language is required.")

    try:
        with llm.llm_usage_context(operation="translate"):
            translated, model_id = llm.translate_text(text, target_language)
        return TranslateResponse(translated_text=translated, model_id=model_id)
    except Exception as exc:
        logger.exception("Translation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Translation failed.") from exc


@router.post("/compare/summarize", response_model=ComparisonSummaryResponse)
def compare_games_summarize(request: ComparisonSummarizeRequest) -> ComparisonSummaryResponse:

    app_ids = [g.app_id for g in request.games]
    cache_key = storage.generate_comparison_cache_key(
        app_ids, request.comparison_type, request.category, request.subcategory
    )

    cached = storage.load_comparison_summary(cache_key)
    if cached:
        return ComparisonSummaryResponse(**cached, cached=True)

    try:
        logger.info(f"Generating comparison for {len(app_ids)} games (type: {request.comparison_type})")
        with llm.llm_usage_context(operation="compare"):
            result = llm.compare_games(
                games_data=[g.dict() for g in request.games],
                comparison_type=request.comparison_type,
                category=request.category,
                subcategory=request.subcategory,
            )

        storage.save_comparison_summary(
            app_ids=app_ids,
            comparison_type=request.comparison_type,
            category=request.category,
            subcategory=request.subcategory,
            summary_data=result,
        )

        logger.info(f"Successfully generated comparison for {len(app_ids)} games")
        return ComparisonSummaryResponse(**result, cached=False)

    except llm.LLMError as exc:
        logger.exception("LLM comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI comparison failed. Please try again.") from exc
    except Exception as exc:
        logger.exception("Comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate comparison. Please try again.") from exc


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get("/reports/available-months/{app_id}")
def get_report_months(app_id: int):

    from ..reports import get_available_months

    if not storage.user_has_game(app_id):
        raise HTTPException(status_code=404, detail="No analysis available for this game.")

    months = get_available_months(app_id)

    return {"months": months}


@router.get("/reports/executive-summary/{app_id}")
def generate_executive_summary(
    app_id: int,
    year: int,
    month: int,
    format: str = "pdf",
    include_llm_summary: bool = True,
):

    from ..reports import (
        filter_reviews_by_month,
        calculate_monthly_insights,
        create_dashboard_html,
        create_pdf_report_legacy,
        create_pdf_report,
    )

    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    if not (2000 <= year <= 2100):
        raise HTTPException(status_code=400, detail="Invalid year")

    if not storage.user_has_game(app_id):
        raise HTTPException(status_code=404, detail="Game must be analyzed first")

    game_context = fetch_app_details(app_id)
    game_name = game_context.get("name", f"App {app_id}") if game_context else f"App {app_id}"
    header_image = game_context.get("header_image", "") if game_context else ""

    reviews = storage.load_reviews(app_id, limit=None)
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found for this game")

    cached_labels = storage.load_review_labels(app_id)
    if not cached_labels:
        raise HTTPException(
            status_code=404,
            detail="No classification data available. Please analyze this game first.",
        )

    llm_labels = {rid: data.get("payload", {}) for rid, data in cached_labels.items()}
    df = build_reviews_dataframe(reviews)
    df = llm.apply_review_labels(df, llm_labels)

    filtered_df = filter_reviews_by_month(df, year, month)
    if filtered_df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No reviews found for {datetime(year, month, 1).strftime('%B %Y')}",
        )

    try:
        insights = calculate_monthly_insights(
            filtered_df,
            full_df=df,
            year=year,
            month=month,
        )
    except Exception as e:
        logger.error(f"Failed to calculate insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate insights") from e

    period = datetime(year, month, 1).strftime("%B %Y")

    if include_llm_summary and format in {"pdf", "html"}:
        try:
            with llm.llm_usage_context(app_id=app_id, operation="report_summary"):
                llm_summary = llm.summarize_monthly_report(
                    game_name=game_name,
                    period=period,
                    insights=insights,
                )
            llm_summary["generated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            insights = {**insights, "llm_summary": llm_summary}
        except Exception as exc:
            logger.exception("Failed to generate report summary: %s", exc)

    safe_game_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '' for c in game_name)
    safe_game_name = safe_game_name.replace(' ', '_')[:40]
    month_label = datetime(year, month, 1).strftime("%B%Y")

    if format == "html":
        try:
            html_content = create_dashboard_html(
                insights, game_name, period, app_id=app_id, header_image=header_image
            )
        except Exception as e:
            logger.error(f"Failed to generate HTML: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate HTML report") from e

        return StreamingResponse(
            iter([html_content.encode("utf-8")]),
            media_type="text/html; charset=utf-8",
        )

    elif format == "legacy":
        try:
            pdf_bytes = create_pdf_report_legacy(insights, game_name, period)
        except Exception as e:
            logger.error(f"Failed to generate legacy PDF: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate PDF report") from e

        filename = f"{safe_game_name}_{month_label}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    elif format == "pdf":
        try:
            pdf_bytes = create_pdf_report(
                insights, game_name, period, app_id=app_id, header_image=header_image
            )
        except Exception as e:
            logger.error(f"Failed to generate PDF: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate PDF report") from e

        filename = f"{safe_game_name}_{month_label}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    else:
        raise HTTPException(status_code=400, detail="Format must be 'pdf', 'html', or 'legacy'")

