"""Test starred games API response format."""
import json
from backend.senti_next import storage

# Initialize the database
storage.init_db()
print(f"Using PostgreSQL: {storage.is_postgresql()}")

# Test load_starred_games
result = storage.load_starred_games("test_user")
print(f"Result type: {type(result)}")
print(f"Result length: {len(result)}")

if result:
    print(f"First item: {json.dumps(result[0], indent=2, default=str)}")
else:
    print("No starred games found (empty list)")

# Test saving a starred game to verify full round trip
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
    storage.save_starred_game("test_user", test_payload)
    print("Save succeeded")
except Exception as e:
    print(f"Save failed: {e}")

# Load again
result = storage.load_starred_games("test_user")
print(f"After save, result length: {len(result)}")
if result:
    print(f"First item keys: {list(result[0].keys())}")
    for key, val in result[0].items():
        print(f"  {key}: {type(val).__name__} = {str(val)[:100]}")
