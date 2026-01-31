"""Redis connection manager for background job queue."""
from __future__ import annotations

import os
from typing import Optional

_redis_conn: Optional["redis.Redis"] = None
_queue: Optional["rq.Queue"] = None


def get_redis_url() -> str:
    """Get Redis URL from environment."""
    return os.getenv("REDIS_URL", "redis://localhost:6379")


def is_redis_configured() -> bool:
    """Check if Redis is configured via environment."""
    return bool(os.getenv("REDIS_URL"))


def get_redis() -> "redis.Redis":
    """Get or create Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        import redis
        _redis_conn = redis.from_url(get_redis_url())
    return _redis_conn


def get_queue(name: str = "default") -> "rq.Queue":
    """Get or create RQ queue."""
    global _queue
    if _queue is None:
        from rq import Queue
        _queue = Queue(name, connection=get_redis())
    return _queue


def enqueue_job(func, *args, job_timeout: int = 3600, **kwargs) -> Optional[str]:
    """Enqueue a job and return the job ID, or None if Redis is not configured."""
    if not is_redis_configured():
        return None
    queue = get_queue()
    job = queue.enqueue(func, *args, job_timeout=job_timeout, **kwargs)
    return job.id


def get_job_status(job_id: str) -> Optional[str]:
    """Get job status by ID. Returns None if job not found."""
    if not is_redis_configured():
        return None
    from rq.job import Job
    try:
        job = Job.fetch(job_id, connection=get_redis())
        return job.get_status()
    except Exception:
        return None


def job_exists(job_id: str) -> bool:
    """Check if a job exists in Redis."""
    if not is_redis_configured():
        return False
    from rq.job import Job
    try:
        Job.fetch(job_id, connection=get_redis())
        return True
    except Exception:
        return False
