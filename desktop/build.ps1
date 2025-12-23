$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Set-Location (Join-Path $RootDir "frontend")
npm install
npm run build

Set-Location $RootDir
if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
  throw "conda is required. Install Miniconda/Anaconda, then re-run."
}

$hasEnv = (conda env list) | Select-String -Pattern "^\s*SentiNext\s"
if (-not $hasEnv) {
  conda env create -f environment.yml
}

conda run -n SentiNext pip install -r desktop\requirements.txt

conda run -n SentiNext pyinstaller --clean --noconfirm desktop\sentinext_desktop.spec

Write-Host "Built app in: $RootDir\dist\SentiNext"
