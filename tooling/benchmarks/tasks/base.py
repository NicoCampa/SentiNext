from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Protocol, Sequence


_DANGEROUS_PATTERNS = [
    re.compile(r"<<<\s*END\s*REVIEW", re.IGNORECASE),
    re.compile(r"<<<\s*BEGIN\s*REVIEW", re.IGNORECASE),
    re.compile(r"IGNORE\s+(?:PREVIOUS|ABOVE|ALL)\s+INSTRUCTIONS", re.IGNORECASE),
    re.compile(r"DISREGARD\s+(?:PREVIOUS|ABOVE|ALL)", re.IGNORECASE),
    re.compile(r"^SYSTEM\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^ASSISTANT\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^USER\s*:", re.IGNORECASE | re.MULTILINE),
]


import unicodedata


# Unicode punctuation → ASCII equivalents for fuzzy matching
_UNICODE_PUNCT_MAP = str.maketrans({
    "\u2018": "'", "\u2019": "'",  # left/right single quotes
    "\u201C": '"', "\u201D": '"',  # left/right double quotes
    "\u2013": "-", "\u2014": "-",  # en/em dashes
    "\u2026": "...",               # ellipsis
    "\u00A0": " ",                 # non-breaking space
})


def _fuzzy_evidence_match(quote: str, review_text: str) -> bool:
    """Check if a quote appears in review text with graduated normalization.

    1. Exact match after whitespace normalization
    2. Normalize Unicode punctuation → ASCII equivalents
    3. Alphanumeric-only containment (strip all non-alnum, lowercase)
    """
    q = re.sub(r"\s+", " ", quote).strip()
    r = re.sub(r"\s+", " ", review_text).strip()

    # Level 1: whitespace-normalized exact match
    if q in r:
        return True

    # Level 2: Unicode punctuation normalization
    q2 = q.translate(_UNICODE_PUNCT_MAP)
    r2 = r.translate(_UNICODE_PUNCT_MAP)
    if q2 in r2:
        return True

    # Level 3: alphanumeric-only containment
    q3 = re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKC", q).lower())
    r3 = re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKC", r).lower())
    if q3 and q3 in r3:
        return True

    return False


def sanitize_text(text: str, *, max_chars: int) -> str:
    if not text:
        return ""
    sanitized = text
    for pat in _DANGEROUS_PATTERNS:
        sanitized = pat.sub("[FILTERED]", sanitized)
    sanitized = re.sub(r"\n{3,}", "\n\n", sanitized)
    sanitized = sanitized.strip()
    if len(sanitized) > max_chars:
        sanitized = sanitized[:max_chars]
    return sanitized


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


@dataclass(frozen=True)
class Dataset:
    root: Path
    manifest: dict[str, Any]
    games: dict[int, dict[str, Any]]
    reviews: list[dict[str, Any]]


def load_dataset(path: Path) -> Dataset:
    root = path
    if root.is_file():
        root = root.parent
    manifest_path = root / "manifest.json"
    games_path = root / "games.json"
    reviews_path = root / "reviews.jsonl"
    if not (manifest_path.exists() and games_path.exists() and reviews_path.exists()):
        raise ValueError(f"Dataset directory must contain manifest.json, games.json, reviews.jsonl: {root}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    games_raw = json.loads(games_path.read_text(encoding="utf-8"))
    if not isinstance(games_raw, dict):
        raise ValueError("games.json must be a dict keyed by app_id")
    games: dict[int, dict[str, Any]] = {}
    for k, v in games_raw.items():
        try:
            app_id = int(k)
        except Exception:
            continue
        if isinstance(v, dict):
            games[app_id] = v
    reviews = _read_jsonl(reviews_path)
    return Dataset(root=root, manifest=manifest, games=games, reviews=reviews)


@dataclass(frozen=True)
class TaskItem:
    id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    errors: list[str]
    parsed: dict[str, Any] | None = None


class Task(Protocol):
    name: str
    expected_schema: str
    constraints: str
    response_mime_type: str | None
    response_json_schema: dict[str, Any] | None

    def build_items(
        self,
        *,
        dataset: Dataset,
        suite: str,
        rng: random.Random,
        reference_labels: dict[str, dict[str, Any]] | None = None,
    ) -> list[TaskItem]: ...
    def build_prompt(self, *, item: TaskItem, dataset: Dataset) -> str: ...
    def validate(self, *, output_text: str, item: TaskItem, dataset: Dataset) -> ValidationResult: ...

    def get_response_json_schema(self, item: TaskItem) -> dict[str, Any] | None:
        """Return the JSON schema for this specific item. Override for per-item schemas."""
        return self.response_json_schema


def prompt_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "prompts"


def read_prompt_file(filename: str) -> str:
    path = prompt_dir() / filename
    return path.read_text(encoding="utf-8")


def review_key(review: Mapping[str, Any]) -> tuple:
    return (
        int(review.get("app_id") or 0),
        str(review.get("language") or ""),
        bool(review.get("voted_up")),
        str(review.get("review_id") or ""),
    )


def select_balanced_reviews(
    reviews: Sequence[Mapping[str, Any]],
    *,
    n: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Deterministically select up to n reviews with rough balance across app/language/sentiment."""
    buckets: dict[tuple[int, str, bool], list[dict[str, Any]]] = {}
    for r in reviews:
        try:
            app_id = int(r.get("app_id") or 0)
        except Exception:
            continue
        lang = str(r.get("language") or "unknown")
        voted_up = bool(r.get("voted_up"))
        buckets.setdefault((app_id, lang, voted_up), []).append(dict(r))

    # Deterministic order inside buckets.
    for k in list(buckets.keys()):
        buckets[k].sort(key=lambda x: str(x.get("review_id") or ""))

    keys = sorted(buckets.keys())
    rng.shuffle(keys)  # seeded, to avoid always starting from same bucket

    selected: list[dict[str, Any]] = []
    idx = 0
    while len(selected) < n and keys:
        k = keys[idx % len(keys)]
        bucket = buckets.get(k) or []
        if bucket:
            selected.append(bucket.pop(0))
        else:
            keys.remove(k)
            if not keys:
                break
            idx = idx % len(keys)
            continue
        idx += 1

    return selected


def format_game_context(game: Mapping[str, Any]) -> str:
    name = str(game.get("name") or "Unknown")
    game_type = str(game.get("type") or "game")
    genres = game.get("genres") or []
    categories = game.get("categories") or []
    short_description = str(game.get("short_description") or "")
    return (
        f"Name: {name}\n"
        f"Type: {game_type}\n"
        f"Genres: {', '.join(genres) if isinstance(genres, list) else str(genres)}\n"
        f"Categories: {', '.join(categories) if isinstance(categories, list) else str(categories)}\n"
        f"Description: {short_description[:400]}\n"
    )
