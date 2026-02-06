from __future__ import annotations

from pathlib import Path

from benchmarks.cache import SqliteCache


def test_sqlite_cache_roundtrip(tmp_path: Path) -> None:
    db = tmp_path / "cache.sqlite"
    cache = SqliteCache(db)
    cache.put(
        key="k",
        provider="mock",
        model="m",
        temperature=0.2,
        max_tokens=10,
        prompt_sha="p",
        task="t",
        role="candidate",
        response_text="hello",
        raw_json=None,
        latency_ms=1,
        prompt_tokens=2,
        completion_tokens=3,
        total_tokens=5,
    )
    got = cache.get("k")
    assert got is not None
    assert got.text == "hello"
    assert got.total_tokens == 5

