#!/bin/bash
# Load environment variables from .env.local
set -a
source .env.local
set +a

# Run backend with hot reload
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
