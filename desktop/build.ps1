$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Set-Location (Join-Path $RootDir "frontend")
npm install
npm run build

Set-Location $RootDir
python -m venv .venv-build
. .\.venv-build\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r desktop\requirements.txt

pyinstaller --clean --noconfirm desktop\sentinext_desktop.spec

Write-Host "Built app in: $RootDir\dist\SentiNext"

