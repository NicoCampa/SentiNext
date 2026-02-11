#!/usr/bin/env python3
"""Build the SentiNext backend sidecar binary using PyInstaller.

Usage:
    python build.py [--target-triple TARGET]

The output is copied to src-tauri/binaries/ with Tauri's naming convention:
    sentinext-backend-{target_triple}  (directory with all --onedir files)

Tauri's externalBin expects the main executable at:
    binaries/sentinext-backend-{target_triple}[.exe]
"""
from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def detect_target_triple() -> str:
    """Detect the current platform's target triple for Tauri."""
    machine = platform.machine().lower()
    system = platform.system().lower()

    arch_map = {
        "x86_64": "x86_64",
        "amd64": "x86_64",
        "arm64": "aarch64",
        "aarch64": "aarch64",
    }
    arch = arch_map.get(machine, machine)

    if system == "darwin":
        return f"{arch}-apple-darwin"
    elif system == "windows":
        return f"{arch}-pc-windows-msvc"
    elif system == "linux":
        return f"{arch}-unknown-linux-gnu"
    else:
        return f"{arch}-unknown-{system}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build SentiNext sidecar")
    parser.add_argument("--target-triple", default=None, help="Override target triple")
    args = parser.parse_args()

    target_triple = args.target_triple or detect_target_triple()

    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent.parent
    desktop_dir = script_dir.parent
    tauri_binaries_dir = desktop_dir / "src-tauri" / "binaries"
    spec_file = script_dir / "sentinext-backend.spec"

    dist_dir = script_dir / "dist"
    build_dir = script_dir / "build"

    print(f"Building for target: {target_triple}")
    print(f"Spec file: {spec_file}")

    # Run PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--distpath", str(dist_dir),
        "--workpath", str(build_dir),
        "--noconfirm",
        str(spec_file),
    ]
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=str(repo_root))

    # PyInstaller --onedir output is at dist/sentinext-backend/
    pyinstaller_out = dist_dir / "sentinext-backend"
    if not pyinstaller_out.exists():
        print(f"ERROR: Build output not found at {pyinstaller_out}")
        sys.exit(1)

    # Tauri externalBin "binaries/sentinext-backend" resolves to:
    #   binaries/sentinext-backend-{target_triple}[.exe]
    # For --onedir, we need the whole directory plus rename the executable.
    tauri_binaries_dir.mkdir(parents=True, exist_ok=True)

    is_windows = "windows" in target_triple
    exe_suffix = ".exe" if is_windows else ""
    src_exe = pyinstaller_out / f"sentinext-backend{exe_suffix}"

    # Tauri sidecar naming: the executable itself must be named
    # sentinext-backend-{target_triple}[.exe]
    dest_exe_name = f"sentinext-backend-{target_triple}{exe_suffix}"
    dest_exe = tauri_binaries_dir / dest_exe_name

    if not src_exe.exists():
        print(f"ERROR: Executable not found at {src_exe}")
        sys.exit(1)

    # Copy the main executable with Tauri sidecar naming
    shutil.copy2(src_exe, dest_exe)

    # Copy all supporting files (shared libs, etc.) alongside the executable
    for item in pyinstaller_out.iterdir():
        if item.name == f"sentinext-backend{exe_suffix}":
            continue  # already copied with renamed name
        dest = tauri_binaries_dir / item.name
        if item.is_dir():
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    print(f"Sidecar binary: {dest_exe}")
    print(f"Supporting files copied to: {tauri_binaries_dir}")
    print("Build complete!")


if __name__ == "__main__":
    main()
