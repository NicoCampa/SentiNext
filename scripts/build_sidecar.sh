#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${SENTINEXT_PYTHON:-python}"

"$PYTHON" "$ROOT/scripts/build_sidecar.py"
