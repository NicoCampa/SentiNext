"""RQ worker entry point for background job processing.

Run with: python -m backend.worker

This worker connects to Redis and processes jobs from the default queue.
Configure Redis URL via REDIS_URL environment variable.
"""
from __future__ import annotations

import logging
import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rq import Worker, Queue, Connection
from rq_scheduler import Scheduler

from backend.senti_next.redis_client import get_redis, get_redis_url
from backend.senti_next import storage
from backend.senti_next.scheduled_jobs import run_daily_favorites_refresh

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def recover_interrupted_jobs() -> None:
    """Mark any jobs that were running when the worker crashed as failed."""
    try:
        interrupted = storage.find_interrupted_jobs(age_minutes=10)
        for job in interrupted:
            logger.warning(
                "Marking interrupted job %s for app %s as failed",
                job.get("job_id"),
                job.get("app_id"),
            )
            storage.update_job_registry(
                job["job_id"],
                status="failed",
                error="Job interrupted by worker restart",
            )
            # Also update the analysis result
            if job.get("user_id") and job.get("app_id"):
                result = storage.load_analysis_result(job["user_id"], job["app_id"])
                if result and result.get("status") == "running":
                    storage.save_analysis_result(
                        user_id=job["user_id"],
                        app_id=job["app_id"],
                        metadata=result.get("metadata"),
                        insights=None,
                        reviews=[],
                        status="failed",
                        error="Job interrupted by worker restart",
                    )
    except Exception as exc:
        logger.error("Failed to recover interrupted jobs: %s", exc)


def setup_scheduled_jobs(scheduler: Scheduler) -> None:
    """Register scheduled jobs with the RQ scheduler."""
    # Daily favorites refresh at 4 AM UTC
    # cron format: minute hour day_of_month month day_of_week
    job_id = "daily_favorites_refresh"

    # Check if job already exists to avoid duplicates
    existing_jobs = list(scheduler.get_jobs())
    for job in existing_jobs:
        if job.id == job_id:
            logger.info("Scheduled job %s already registered", job_id)
            return

    scheduler.cron(
        "0 4 * * *",  # 4:00 AM UTC daily
        func=run_daily_favorites_refresh,
        id=job_id,
        queue_name="default",
        description="Daily refresh of favorite games with new reviews",
    )
    logger.info("Registered scheduled job: %s (4 AM UTC daily)", job_id)


def main() -> None:
    """Start the RQ worker."""
    redis_url = get_redis_url()
    logger.info("Starting RQ worker, connecting to %s", redis_url)

    # Initialize database
    storage.init_db()

    # Recover any interrupted jobs from previous runs
    recover_interrupted_jobs()

    redis_conn = get_redis()

    # Setup scheduled jobs
    try:
        scheduler = Scheduler(connection=redis_conn)
        setup_scheduled_jobs(scheduler)
    except Exception as exc:
        logger.warning("Failed to setup scheduled jobs: %s", exc)

    with Connection(redis_conn):
        queues = [Queue("default")]
        worker = Worker(queues)
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
