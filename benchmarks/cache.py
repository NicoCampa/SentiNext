from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


@dataclass(frozen=True)
class CachedResponse:
    text: str
    raw_json: str | None
    latency_ms: int | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None


class SqliteCache:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_cache (
              key TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              model TEXT NOT NULL,
              temperature REAL NOT NULL,
              max_tokens INTEGER NOT NULL,
              prompt_sha TEXT NOT NULL,
              task TEXT NOT NULL,
              role TEXT NOT NULL,
              response_text TEXT NOT NULL,
              raw_json TEXT,
              latency_ms INTEGER,
              prompt_tokens INTEGER,
              completion_tokens INTEGER,
              total_tokens INTEGER,
              created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            )
            """
        )
        self._conn.commit()

    def get(self, key: str) -> Optional[CachedResponse]:
        with self._lock:
            cur = self._conn.execute(
                """
                SELECT response_text, raw_json, latency_ms, prompt_tokens, completion_tokens, total_tokens
                FROM llm_cache
                WHERE key = ?
                """,
                (key,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return CachedResponse(
            text=row[0],
            raw_json=row[1],
            latency_ms=row[2],
            prompt_tokens=row[3],
            completion_tokens=row[4],
            total_tokens=row[5],
        )

    def put(
        self,
        *,
        key: str,
        provider: str,
        model: str,
        temperature: float,
        max_tokens: int,
        prompt_sha: str,
        task: str,
        role: str,
        response_text: str,
        raw_json: str | None,
        latency_ms: int | None,
        prompt_tokens: int | None,
        completion_tokens: int | None,
        total_tokens: int | None,
    ) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO llm_cache (
                  key, provider, model, temperature, max_tokens, prompt_sha, task, role,
                  response_text, raw_json, latency_ms, prompt_tokens, completion_tokens, total_tokens
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    key,
                    provider,
                    model,
                    float(temperature),
                    int(max_tokens),
                    prompt_sha,
                    task,
                    role,
                    response_text,
                    raw_json,
                    latency_ms,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                ),
            )
            self._conn.commit()

