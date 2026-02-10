from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


def _parse_line(raw_line: str) -> tuple[str, str] | None:
    line = raw_line.strip()
    if not line or line.startswith("#"):
        return None
    if line.startswith("export "):
        line = line[len("export ") :].strip()
    if "=" not in line:
        return None
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip()
    if not key:
        return None
    if value and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return key, value


def load_env_files(paths: Iterable[Path]) -> None:
    """Load .env-style files without overriding existing os.environ keys."""
    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for raw_line in content.splitlines():
            parsed = _parse_line(raw_line)
            if not parsed:
                continue
            key, value = parsed
            if key in os.environ:
                continue
            os.environ[key] = value

