"""RQ worker entry point for background job processing.

Run with: python -m apps.api.worker

This worker connects to Redis and processes jobs from the default queue.
Configure Redis URL via REDIS_URL environment variable.
"""
from __future__ import annotations

import logging
import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from rq import Worker, Queue, Connection
from rq_scheduler import Scheduler

from apps.api.senti_next.redis_client import get_redis, get_redis_url
from apps.api.senti_next import storage

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


def main() -> None:
    """Start the RQ worker."""
    redis_url = get_redis_url()
    logger.info("Starting RQ worker, connecting to %s", redis_url)

    # Initialize database
    storage.init_db()

    # Recover any interrupted jobs from previous runs
    recover_interrupted_jobs()

    redis_conn = get_redis()

    # Setup scheduler (no scheduled jobs currently)
    try:
        Scheduler(connection=redis_conn)
    except Exception as exc:
        logger.warning("Failed to initialize scheduler: %s", exc)

    with Connection(redis_conn):
        queues = [Queue("default")]
        worker = Worker(queues)
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
