#!/usr/bin/env python3
"""Build the SentiNext backend sidecar binary using PyInstaller.

Usage:
    python build.py [--target-triple TARGET] [--no-venv]

A clean virtual environment is created (in pyinstaller/.venv/) and only the
packages listed in requirements-desktop.txt are installed.  This prevents the
host conda/system env from leaking large unused packages (tensorflow, torch,
etc.) into the binary.

The output is copied to src-tauri/binaries/ with Tauri's naming convention:
    sentinext-backend-{target_triple}[.exe]

PyInstaller runs in --onefile mode, producing a single self-contained executable.
"""
from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import venv
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


def ensure_venv(script_dir: Path) -> Path:
    """Create a clean venv and install desktop requirements. Returns the venv python path."""
    venv_dir = script_dir / ".venv"
    requirements = script_dir / "requirements-desktop.txt"

    is_windows = sys.platform == "win32"
    venv_python = venv_dir / ("Scripts" if is_windows else "bin") / ("python.exe" if is_windows else "python")

    if not venv_python.is_file():
        print(f"Creating clean build venv at {venv_dir} ...")
        venv.create(str(venv_dir), with_pip=True, clear=True)

    # Always sync requirements (fast no-op when already satisfied)
    print("Installing desktop requirements ...")
    subprocess.run(
        [str(venv_python), "-m", "pip", "install", "-q", "-r", str(requirements)],
        check=True,
    )

    return venv_python


def main() -> None:
    parser = argparse.ArgumentParser(description="Build SentiNext sidecar")
    parser.add_argument("--target-triple", default=None, help="Override target triple")
    parser.add_argument("--no-venv", action="store_true", help="Skip venv, use current Python (not recommended)")
    args = parser.parse_args()

    target_triple = args.target_triple or detect_target_triple()

    script_dir = Path(__file__).resolve().parent
    desktop_dir = script_dir.parent
    repo_root = desktop_dir.parent.parent
    tauri_binaries_dir = desktop_dir / "src-tauri" / "binaries"
    spec_file = script_dir / "sentinext-backend.spec"

    dist_dir = script_dir / "dist"
    build_dir = script_dir / "build"

    # Determine which python to use
    if args.no_venv:
        python = sys.executable
        print("Using current Python (--no-venv)")
    else:
        python = str(ensure_venv(script_dir))

    print(f"Building for target: {target_triple}")
    print(f"Python: {python}")
    print(f"Spec file: {spec_file}")

    # Run PyInstaller
    cmd = [
        python, "-m", "PyInstaller",
        "--distpath", str(dist_dir),
        "--workpath", str(build_dir),
        "--noconfirm",
        str(spec_file),
    ]
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=str(repo_root))

    # --onefile output is a single executable at dist/sentinext-backend[.exe]
    is_windows = "windows" in target_triple
    exe_suffix = ".exe" if is_windows else ""
    src_exe = dist_dir / f"sentinext-backend{exe_suffix}"

    if not src_exe.is_file():
        print(f"ERROR: Build output not found at {src_exe}")
        sys.exit(1)

    # Copy to Tauri binaries dir with sidecar naming convention
    tauri_binaries_dir.mkdir(parents=True, exist_ok=True)
    dest_exe_name = f"sentinext-backend-{target_triple}{exe_suffix}"
    dest_exe = tauri_binaries_dir / dest_exe_name

    shutil.copy2(src_exe, dest_exe)

    # On macOS, re-sign the sidecar with entitlements to allow PyInstaller's
    # extracted Python framework (which has a different Team ID) to load.
    # Without this, hardened runtime's library validation rejects the dylib.
    # We use ad-hoc signing here; Tauri re-signs with the real identity at bundle time.
    if sys.platform == "darwin":
        entitlements = script_dir / "entitlements.plist"
        print(f"Signing sidecar with entitlements: {entitlements}")
        subprocess.run(
            [
                "codesign", "--force", "--sign", "-",
                "--entitlements", str(entitlements),
                "--options", "runtime",
                str(dest_exe),
            ],
            check=True,
        )

    print(f"Sidecar binary: {dest_exe}")
    print(f"Size: {dest_exe.stat().st_size / (1024 * 1024):.1f} MB")
    print("Build complete!")


if __name__ == "__main__":
    main()
