from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from senti_next import (
    SteamAPIError,
    build_reviews_dataframe,
    fetch_reviews,
    search_applications,
)
from senti_next.insights import prepare_insights
from senti_next import storage
from senti_next import llm

SAMPLE_LIMIT = 200
FETCH_LIMIT = 2000

APP_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

storage.init_db()

app = FastAPI(title="SentiNext API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=APP_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchResult(BaseModel):
    appid: int
    name: str
    price: Optional[str] = None
    url: str


class AnalyzeRequest(BaseModel):
    app_id: int = Field(..., gt=0)
    review_count: int = Field(FETCH_LIMIT, ge=0, le=FETCH_LIMIT)
    language: str = Field("english", min_length=2, max_length=32)
    filter: str = Field("recent")
    day_range: Optional[int] = Field(None, ge=1, le=365)
    persist: bool = Field(True)
    refresh: bool = Field(True)


class AnalyzeMetadata(BaseModel):
    app_id: int
    requested: int
    retrieved: int
    language: str
    fetched_at: str


class AnalyzeResponse(BaseModel):
    metadata: AnalyzeMetadata
    insights: Optional[dict]
    reviews: List[dict]


REVIEW_EXPORT_COLUMNS = [
    "review_id",
    "review",
    "language",
    "sentiment_label",
    "sentiment_compound",
    "sentiment_positive",
    "sentiment_neutral",
    "sentiment_negative",
    "voted_up",
    "votes_up",
    "votes_funny",
    "author_num_games_owned",
    "author_num_reviews",
    "author_playtime_forever",
    "author_playtime_last_two_weeks",
    "author_playtime_hours",
    "author_recent_playtime_hours",
    "created_at",
    "llm_sentiment",
    "llm_topics",
    "llm_pain_point",
    "llm_feature_request",
    "llm_confidence",
]


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.get("/search", response_model=List[SearchResult])
def search(query: str) -> List[SearchResult]:
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters long.")
    try:
        results = search_applications(query.strip(), limit=5)
    except SteamAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return [
        SearchResult(appid=item.appid, name=item.name, price=item.price, url=item.url)
        for item in results
    ]


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    filter_type = (request.filter or "recent").lower()
    if filter_type not in {"recent", "updated", "all", "recent_created", "best"}:
        filter_type = "recent"

    stored_reviews: List[dict] = []
    if request.persist:
        stored_reviews = storage.load_reviews(request.app_id)

    should_fetch = not stored_reviews or request.refresh or not request.persist

    fetched_reviews: List[dict] = []
    if should_fetch:
        try:
            fetched_reviews = fetch_reviews(
                request.app_id,
                count=request.review_count,
                language=request.language,
                filter_type=filter_type,
                day_range=request.day_range,
            )
        except SteamAPIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if request.persist:
            storage.upsert_reviews(request.app_id, fetched_reviews)
            stored_reviews = storage.load_reviews(request.app_id)
        else:
            stored_reviews = fetched_reviews

    all_reviews = stored_reviews or fetched_reviews
    if request.review_count:
        all_reviews = all_reviews[: request.review_count]

    llm_labels = llm.ensure_review_labels(request.app_id, all_reviews)

    df = build_reviews_dataframe(all_reviews)
    df = llm.apply_review_labels(df, llm_labels)
    metadata = AnalyzeMetadata(
        app_id=request.app_id,
        requested=request.review_count,
        retrieved=int(df.shape[0]) if df is not None else 0,
        language=request.language,
        fetched_at=datetime.utcnow().isoformat() + "Z",
    )

    if df is None or df.empty:
        return AnalyzeResponse(metadata=metadata, insights=None, reviews=[])

    insights = prepare_insights(df)

    export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
    if export_columns:
        sample_limit = min(SAMPLE_LIMIT, df.shape[0])
        reviews_payload = json.loads(
            df[export_columns]
            .head(sample_limit)
            .to_json(orient="records", date_format="iso", date_unit="s")
        )
    else:
        reviews_payload = []

    return AnalyzeResponse(
        metadata=metadata,
        insights=insights,
        reviews=reviews_payload,
    )


@app.get("/reviews/{app_id}")
def export_reviews(app_id: int, limit: Optional[int] = None, format: str = "csv"):
    rows = storage.load_reviews(app_id, limit)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No cached reviews for this app. Run an analysis with persistence enabled.",
        )

    llm_labels = llm.ensure_review_labels(app_id, rows)

    df = build_reviews_dataframe(rows)
    df = llm.apply_review_labels(df, llm_labels)
    export_columns = [col for col in REVIEW_EXPORT_COLUMNS if col in df.columns]
    if not export_columns:
        raise HTTPException(status_code=500, detail="No exportable columns found.")

    if format == "json":
        data = df[export_columns].to_json(orient="records", date_format="iso", date_unit="s")
        return StreamingResponse(
            iter([data]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.json",
            },
        )

    # default CSV
    csv_data = df[export_columns].to_csv(index=False)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=senti-next-reviews-{app_id}.csv",
        },
    )
