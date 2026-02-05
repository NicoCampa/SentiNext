#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Does not delete any .env.local files.

find "$ROOT" -type d \( \
  -name node_modules \
  -o -name .next \
  -o -name out \
  -o -name dist \
  -o -name build \
  -o -name __pycache__ \
  -o -name .pytest_cache \
  \) -prune -exec rm -rf {} +

find "$ROOT" -type f -name ".DS_Store" -delete

echo "Cleanup complete."
