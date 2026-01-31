#!/bin/bash
# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Run backend with hot reload
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
