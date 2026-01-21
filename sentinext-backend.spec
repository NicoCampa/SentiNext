# -*- mode: python ; coding: utf-8 -*-


import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

project_root = Path(os.getcwd())

hiddenimports = [
    "backend.main",
    "backend.reports",
    "backend.html_pdf",
    "backend.pdf_report",
    "backend.emailer",
]
hiddenimports += collect_submodules("backend.senti_next")

datas = collect_data_files("backend", includes=["assets/**"])

a = Analysis(
    ["backend/tauri_backend.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='sentinext-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
