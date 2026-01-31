"""Internal Pydantic models for type safety and validation."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MainCategory(str, Enum):
    """Main review classification categories."""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    MIXED = "mixed"
    NEUTRAL = "neutral"


class ReviewLabel(BaseModel):
    """LLM-generated labels for a single review."""
    main_category: MainCategory
    subcategory: str
    subcategories: List[str] = Field(default_factory=list)
    issue_subcategories: List[str] = Field(default_factory=list)
    request_subcategories: List[str] = Field(default_factory=list)
    subcategory_evidence: str = ""
    has_issue: bool = False
    has_request: bool = False


class CachedLabel(BaseModel):
    """Stored review label with metadata."""
    review_id: str
    app_id: int
    label: ReviewLabel
    model_id: str
    context_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProgressState(BaseModel):
    """Analysis progress tracking state."""
    user_id: str
    app_id: int
    processed: int = 0
    total: int = 0
    status: str = "pending"
    started_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @property
    def percentage(self) -> float:
        """Calculate progress percentage."""
        if self.total == 0:
            return 0.0
        return (self.processed / self.total) * 100


class GameContext(BaseModel):
    """Game metadata from Steam API for LLM context."""
    name: str
    short_description: str = ""
    type: str = "game"
    header_image: str = ""
    genres: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)


class JobStatus(str, Enum):
    """Background job status values."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobRegistry(BaseModel):
    """Background job tracking record."""
    job_id: str
    user_id: str
    app_id: int
    job_type: str = "analysis"
    status: JobStatus = JobStatus.PENDING
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalysisRequest(BaseModel):
    """Request payload for starting analysis."""
    app_id: int
    review_count: int = Field(default=100, ge=1, le=10000)
    language: str = "english"
    filter_type: str = "recent"
    day_range: Optional[int] = Field(default=None, ge=1, le=365)


class AnalysisResult(BaseModel):
    """Stored analysis result."""
    user_id: str
    app_id: int
    status: str
    run_id: str
    snapshot_hash: str
    context_hash: str
    metadata: Dict[str, Any]
    insights: Optional[Dict[str, Any]] = None
    reviews: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CircuitBreakerStats(BaseModel):
    """Circuit breaker status and statistics."""
    name: str
    state: str
    failure_count: int
    success_count: int
    last_failure_time: float
    config: Dict[str, Any]
