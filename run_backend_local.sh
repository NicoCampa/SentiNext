#!/bin/bash
# Load environment variables from .env.local
set -a
source .env.local
set +a

# Verify DATABASE_URL is loaded
echo "DATABASE_URL is set"

# Run backend with hot reload
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
