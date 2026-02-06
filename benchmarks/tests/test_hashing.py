from __future__ import annotations

from benchmarks.hashing import sha256_text, stable_json_dumps


def test_stable_json_dumps_is_deterministic() -> None:
    a = {"b": 2, "a": 1, "c": {"z": 0, "y": 1}}
    b = {"c": {"y": 1, "z": 0}, "a": 1, "b": 2}
    assert stable_json_dumps(a) == stable_json_dumps(b)


def test_sha256_text() -> None:
    assert sha256_text("x") == sha256_text("x")
    assert sha256_text("x") != sha256_text("y")

