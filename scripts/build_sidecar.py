#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def resolve_python(root: Path) -> str:
    override = os.getenv("SENTINEXT_PYTHON")
    if override:
        return override
    venv_unix = root / ".venv" / "bin" / "python"
    if venv_unix.exists():
        return str(venv_unix)
    venv_win = root / ".venv" / "Scripts" / "python.exe"
    if venv_win.exists():
        return str(venv_win)
    return sys.executable


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    python = resolve_python(root)
    dist_path = root / "backend" / "dist"
    work_path = root / "build" / "sentinext-backend"
    dist_path.mkdir(parents=True, exist_ok=True)

    cmd = [
        python,
        "-m",
        "PyInstaller",
        str(root / "sentinext-backend.spec"),
        "--noconfirm",
        "--distpath",
        str(dist_path),
        "--workpath",
        str(work_path),
    ]
    result = subprocess.call(cmd, cwd=root)
    if result != 0:
        return result

    target_triple = os.getenv("TAURI_TARGET_TRIPLE") or os.getenv("TARGET") or ""
    if target_triple:
        is_windows = "windows" in target_triple
        suffix = f"-{target_triple}{'.exe' if is_windows else ''}"
        source_name = f"sentinext-backend{'.exe' if is_windows else ''}"
        source = dist_path / source_name
        if source.exists():
            shutil.copy2(source, dist_path / f"sentinext-backend{suffix}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
