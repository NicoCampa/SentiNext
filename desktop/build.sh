#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/frontend"
npm install
npm run build

cd "$ROOT_DIR"
python -m venv .venv-build
source .venv-build/bin/activate
pip install -r backend/requirements.txt
pip install -r desktop/requirements.txt

pyinstaller --clean --noconfirm desktop/sentinext_desktop.spec

echo "Built app in: $ROOT_DIR/dist/SentiNext"

