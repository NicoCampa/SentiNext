"""Starred games storage diagnostic."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.senti_next import storage


def main() -> int:
    storage.init_db()
    print(f"Using PostgreSQL: {storage.is_postgresql()}")

    result = storage.load_starred_games("test_user")
    print(f"Result type: {type(result)}")
    print(f"Result length: {len(result)}")

    if result:
        print(f"First item: {json.dumps(result[0], indent=2, default=str)}")
    else:
        print("No starred games found (empty list)")

    print("\n--- Testing save and load ---")
    test_payload = {
        "app_id": 12345,
        "name": "Test Game",
        "metadata": {"header_image": "test.jpg", "genres": ["Action"]},
        "insights": None,
        "sample": [],
        "genres": ["Action"],
        "categories": ["Single-player"],
    }

    try:
        storage.save_starred_game(
            user_id="test_user",
            app_id=test_payload["app_id"],
            name=test_payload["name"],
            metadata=test_payload["metadata"],
            insights=test_payload["insights"],
            sample=test_payload["sample"],
            genres=test_payload["genres"],
            categories=test_payload["categories"],
        )
        print("Save succeeded")
    except Exception as exc:
        print(f"Save failed: {exc}")

    result = storage.load_starred_games("test_user")
    print(f"After save, result length: {len(result)}")
    if result:
        print(f"First item keys: {list(result[0].keys())}")
        for key, val in result[0].items():
            print(f"  {key}: {type(val).__name__} = {str(val)[:100]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
