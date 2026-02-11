#!/usr/bin/env python3
"""Build the SentiNext backend sidecar binary using PyInstaller.

Usage:
    python build.py [--target-triple TARGET]

The output is copied to src-tauri/binaries/ with Tauri's naming convention:
    sentinext-backend-{target_triple}
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

    print(f"Building for target: {target_triple}")
    print(f"Spec file: {spec_file}")

    # Run PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--distpath", str(script_dir / "dist"),
        "--workpath", str(script_dir / "build"),
        "--noconfirm",
        str(spec_file),
    ]
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=str(repo_root))

    # Copy output to Tauri binaries directory
    dist_dir = script_dir / "dist" / "sentinext-backend"
    if not dist_dir.exists():
        print(f"ERROR: Build output not found at {dist_dir}")
        sys.exit(1)

    tauri_binaries_dir.mkdir(parents=True, exist_ok=True)
    target_dir = tauri_binaries_dir / f"sentinext-backend-{target_triple}"

    if target_dir.exists():
        shutil.rmtree(target_dir)
    shutil.copytree(dist_dir, target_dir)

    # Also copy the main executable with the Tauri sidecar naming
    exe_name = "sentinext-backend.exe" if "windows" in target_triple else "sentinext-backend"
    src_exe = target_dir / exe_name
    dest_name = f"sentinext-backend-{target_triple}" + (".exe" if "windows" in target_triple else "")
    dest_exe = tauri_binaries_dir / dest_name

    if src_exe.exists():
        shutil.copy2(src_exe, dest_exe)
        print(f"Sidecar binary: {dest_exe}")

    print("Build complete!")


if __name__ == "__main__":
    main()
