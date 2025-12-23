#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/frontend"
npm install
npm run build

cd "$ROOT_DIR"
if ! command -v conda >/dev/null 2>&1; then
  echo "conda is required. Install Miniconda/Anaconda, then re-run."
  exit 1
fi

if ! conda env list | grep -E '^[[:space:]]*SentiNext[[:space:]]' >/dev/null 2>&1; then
  conda env create -f environment.yml
fi

conda run -n SentiNext pip install -r desktop/requirements.txt

conda run -n SentiNext pyinstaller --clean --noconfirm desktop/sentinext_desktop.spec

echo "Built app in: $ROOT_DIR/dist/SentiNext"
