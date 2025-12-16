# PyInstaller spec to build a single-file desktop app that runs the FastAPI local server
# and hosts the UI in an embedded webview.

from __future__ import annotations

from pathlib import Path

project_root = Path(__file__).resolve().parents[1]

datas = [
    (str(project_root / "frontend" / "out"), "frontend/out"),
]

hiddenimports = [
    "backend.local_app",
    "backend.main",
]

a = Analysis(
    ["desktop/sentinext_desktop.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="SentiNext",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name="SentiNext",
)

