"""Comprehensive diagnostic of backend functionality."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    print("=" * 60)
    print("SENTINEXT BACKEND DIAGNOSTIC TEST")
    print("=" * 60)

    # 1. Environment Variables
    print("\n[1] ENVIRONMENT VARIABLES")
    print("-" * 40)
    env_vars = [
        "DATABASE_URL",
        "SENTINEXT_ALLOWED_ORIGINS",
        "SENTINEXT_ENABLE_DESTRUCTIVE",
        "SENTINEXT_ADMIN_TOKEN",
        "GEMINI_API_KEY",
        "XAI_API_KEY",
        "OPENAI_API_KEY",
        "SENTINEXT_OLLAMA_BASE_URL",
    ]
    for var in env_vars:
        val = os.environ.get(var, "NOT SET")
        if val != "NOT SET" and len(val) > 30:
            val = val[:30] + "..."
        print(f"  {var}: {val}")

    # 2. Database Connection
    print("\n[2] DATABASE CONNECTION")
    print("-" * 40)
    try:
        from apps.api.senti_next import storage

        storage.init_db()
        print(f"  Using PostgreSQL: {storage.is_postgresql()}")
        print("  Database initialized: OK")
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return 1

    # 3. PostgreSQL Direct Connection Test
    print("\n[3] POSTGRESQL DIRECT CONNECTION")
    print("-" * 40)
    try:
        from sqlalchemy import create_engine, text

        url = os.environ.get("DATABASE_URL", "")
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            print("  Connection: OK")
            tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).fetchall()
            print(f"  Tables: {[t[0] for t in tables]}")
    except Exception as exc:
        print(f"  ERROR: {exc}")

    # 4. Storage Functions Test
    print("\n[4] STORAGE FUNCTIONS")
    print("-" * 40)
    try:
        result = storage.load_starred_games("test_user_123")
        print(f"  load_starred_games(): OK - returned {type(result).__name__} with {len(result)} items")
    except Exception as exc:
        print(f"  load_starred_games(): ERROR - {exc}")

    # 5. Table Counts
    print("\n[5] TABLE COUNTS")
    print("-" * 40)
    try:
        from apps.api.senti_next.db import get_engine
        from sqlalchemy import text

        engine = get_engine()
        with engine.connect() as conn:
            for table in ["reviews", "review_labels", "starred_games", "analysis_results", "progress"]:
                try:
                    count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                    print(f"  {table}: {count} rows")
                except Exception as exc:
                    print(f"  {table}: ERROR - {exc}")
    except Exception as exc:
        print(f"  ERROR: {exc}")

    # 6. API Endpoints Test (internal)
    print("\n[6] API ENDPOINT SIMULATION")
    print("-" * 40)
    try:
        entries = storage.load_starred_games("test_user")
        response = []
        for entry in entries:
            response.append(
                {
                    "app_id": entry.get("app_id"),
                    "name": entry.get("name"),
                    "metadata": entry.get("metadata"),
                    "insights": entry.get("insights"),
                    "sample": entry.get("sample"),
                    "genres": entry.get("genres"),
                    "categories": entry.get("categories"),
                    "updated_at": entry.get("updated_at"),
                }
            )
        print(f"  /starred simulation: OK - {len(response)} items")
        print(f"  Response JSON valid: {json.dumps(response, default=str) is not None}")
    except Exception as exc:
        print(f"  /starred simulation: ERROR - {exc}")

    # 7. Test Full Save/Load Cycle
    print("\n[7] SAVE/LOAD CYCLE TEST")
    print("-" * 40)
    test_user = "diagnostic_test_user"
    test_app_id = 99999

    try:
        try:
            storage.delete_starred_game(test_user, test_app_id)
            print("  Cleaned up existing test data")
        except Exception:
            pass

        storage.save_starred_game(
            user_id=test_user,
            app_id=test_app_id,
            name="Test Game",
            metadata={"header_image": "test.jpg", "app_id": test_app_id},
            insights={"summary": "test"},
            sample=[],
            genres=["Action", "RPG"],
            categories=["Single-player"],
        )
        print("  save_starred_game(): OK")

        games = storage.load_starred_games(test_user)
        test_game = next((g for g in games if g["app_id"] == test_app_id), None)

        if test_game:
            print("  load_starred_games(): OK - found test game")
            print(f"    - app_id: {test_game.get('app_id')} (type: {type(test_game.get('app_id')).__name__})")
            print(f"    - name: {test_game.get('name')} (type: {type(test_game.get('name')).__name__})")
            print(f"    - metadata: {type(test_game.get('metadata')).__name__}")
            print(f"    - insights: {type(test_game.get('insights')).__name__}")
            print(f"    - sample: {type(test_game.get('sample')).__name__}")
            print(f"    - genres: {test_game.get('genres')} (type: {type(test_game.get('genres')).__name__})")
            print(f"    - categories: {test_game.get('categories')} (type: {type(test_game.get('categories')).__name__})")

            try:
                json_str = json.dumps(test_game, default=str)
                print(f"  JSON serialization: OK ({len(json_str)} chars)")
            except Exception as exc:
                print(f"  JSON serialization: ERROR - {exc}")
        else:
            print("  load_starred_games(): ERROR - test game not found")

        storage.delete_starred_game(test_user, test_app_id)
        print("  Cleanup: OK")

    except Exception as exc:
        print(f"  ERROR: {exc}")

    # 8. Test Analysis Results
    print("\n[8] ANALYSIS RESULTS TEST")
    print("-" * 40)
    try:
        from apps.api.senti_next.db import get_engine
        from sqlalchemy import text

        engine = get_engine()
        with engine.connect() as conn:
            results = conn.execute(text("SELECT user_id, app_id, status FROM analysis_results LIMIT 5")).fetchall()
            print(f"  Found {len(results)} analysis results")
            for row in results:
                print(f"    - user={row[0][:20]}..., app_id={row[1]}, status={row[2]}")
    except Exception as exc:
        print(f"  ERROR: {exc}")

    # 9. CORS Configuration
    print("\n[9] CORS CONFIGURATION")
    print("-" * 40)
    try:
        from apps.api.main import ALLOWED_ORIGINS

        print(f"  Allowed origins: {ALLOWED_ORIGINS}")
    except Exception as exc:
        print(f"  ERROR: {exc}")

    # 10. Health Check
    print("\n[10] HEALTH CHECK")
    print("-" * 40)
    try:
        import requests

        response = requests.get("http://localhost:8000/health", timeout=5)
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.json()}")
    except Exception as exc:
        print(f"  ERROR (server might not be running): {exc}")

    print("\n" + "=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
