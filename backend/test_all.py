"""Comprehensive test of all backend functionality."""
import json
import os
import sys

print("=" * 60)
print("SENTINEXT BACKEND DIAGNOSTIC TEST")
print("=" * 60)

# 1. Environment Variables
print("\n[1] ENVIRONMENT VARIABLES")
print("-" * 40)
env_vars = [
    "DATABASE_URL",
    "SENTINEXT_ALLOWED_ORIGINS",
    "SENTINEXT_AUTH_ENABLED",
    "SENTINEXT_AUTH_JWKS_URL",
    "GEMINI_API_KEY",
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
    from backend.senti_next import storage
    storage.init_db()
    print(f"  Using PostgreSQL: {storage.is_postgresql()}")
    print(f"  Database initialized: OK")
except Exception as e:
    print(f"  ERROR: {e}")
    sys.exit(1)

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
        result = conn.execute(text("SELECT 1"))
        print(f"  Connection: OK")
        tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).fetchall()
        print(f"  Tables: {[t[0] for t in tables]}")
except Exception as e:
    print(f"  ERROR: {e}")

# 4. Storage Functions Test
print("\n[4] STORAGE FUNCTIONS")
print("-" * 40)

# Test load_starred_games
try:
    result = storage.load_starred_games("test_user_123")
    print(f"  load_starred_games(): OK - returned {type(result).__name__} with {len(result)} items")
except Exception as e:
    print(f"  load_starred_games(): ERROR - {e}")

# Test get table counts
print("\n[5] TABLE COUNTS")
print("-" * 40)
try:
    from backend.senti_next.db import get_engine
    engine = get_engine()
    with engine.connect() as conn:
        for table in ['reviews', 'review_labels', 'starred_games', 'analysis_results', 'progress']:
            try:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                print(f"  {table}: {count} rows")
            except Exception as e:
                print(f"  {table}: ERROR - {e}")
except Exception as e:
    print(f"  ERROR: {e}")

# 6. API Endpoints Test (internal)
print("\n[6] API ENDPOINT SIMULATION")
print("-" * 40)

# Simulate /starred endpoint
try:
    entries = storage.load_starred_games("test_user")
    response = []
    for entry in entries:
        response.append({
            "app_id": entry.get("app_id"),
            "name": entry.get("name"),
            "metadata": entry.get("metadata"),
            "insights": entry.get("insights"),
            "sample": entry.get("sample"),
            "genres": entry.get("genres"),
            "categories": entry.get("categories"),
            "updated_at": entry.get("updated_at"),
        })
    print(f"  /starred simulation: OK - {len(response)} items")
    print(f"  Response JSON valid: {json.dumps(response, default=str) is not None}")
except Exception as e:
    print(f"  /starred simulation: ERROR - {e}")

# 7. Test Full Save/Load Cycle
print("\n[7] SAVE/LOAD CYCLE TEST")
print("-" * 40)
test_user = "diagnostic_test_user"
test_app_id = 99999

try:
    # First, try to delete any existing test data
    try:
        storage.delete_starred_game(test_user, test_app_id)
        print(f"  Cleaned up existing test data")
    except:
        pass

    # Save a test game
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
    print(f"  save_starred_game(): OK")

    # Load it back
    games = storage.load_starred_games(test_user)
    test_game = next((g for g in games if g["app_id"] == test_app_id), None)

    if test_game:
        print(f"  load_starred_games(): OK - found test game")
        print(f"    - app_id: {test_game.get('app_id')} (type: {type(test_game.get('app_id')).__name__})")
        print(f"    - name: {test_game.get('name')} (type: {type(test_game.get('name')).__name__})")
        print(f"    - metadata: {type(test_game.get('metadata')).__name__}")
        print(f"    - insights: {type(test_game.get('insights')).__name__}")
        print(f"    - sample: {type(test_game.get('sample')).__name__}")
        print(f"    - genres: {test_game.get('genres')} (type: {type(test_game.get('genres')).__name__})")
        print(f"    - categories: {test_game.get('categories')} (type: {type(test_game.get('categories')).__name__})")

        # Test JSON serialization
        try:
            json_str = json.dumps(test_game, default=str)
            print(f"  JSON serialization: OK ({len(json_str)} chars)")
        except Exception as e:
            print(f"  JSON serialization: ERROR - {e}")
    else:
        print(f"  load_starred_games(): ERROR - test game not found")

    # Cleanup
    storage.delete_starred_game(test_user, test_app_id)
    print(f"  Cleanup: OK")

except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()

# 8. Test Analysis Results
print("\n[8] ANALYSIS RESULTS TEST")
print("-" * 40)
try:
    # Check if there are any analysis results
    from backend.senti_next.db import get_engine
    engine = get_engine()
    with engine.connect() as conn:
        results = conn.execute(text("SELECT user_id, app_id, status FROM analysis_results LIMIT 5")).fetchall()
        print(f"  Found {len(results)} analysis results")
        for r in results:
            print(f"    - user={r[0][:20]}..., app_id={r[1]}, status={r[2]}")
except Exception as e:
    print(f"  ERROR: {e}")

# 9. CORS Configuration
print("\n[9] CORS CONFIGURATION")
print("-" * 40)
try:
    from backend.main import ALLOWED_ORIGINS
    print(f"  Allowed origins: {ALLOWED_ORIGINS}")
except Exception as e:
    print(f"  ERROR: {e}")

# 10. Health Check
print("\n[10] HEALTH CHECK")
print("-" * 40)
try:
    import requests
    response = requests.get("http://localhost:8000/health", timeout=5)
    print(f"  Status: {response.status_code}")
    print(f"  Response: {response.json()}")
except Exception as e:
    print(f"  ERROR (server might not be running): {e}")

print("\n" + "=" * 60)
print("DIAGNOSTIC TEST COMPLETE")
print("=" * 60)
