"""Integration tests for key API endpoints.

These tests use FastAPI's TestClient with mocked storage/db layers
so they run without a real database or Redis.
"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Patch heavy dependencies before importing the app
_db_mock = MagicMock()
_db_mock.check_db_health.return_value = True
_db_mock.init_postgresql_schema.return_value = None
_db_mock.get_connection.return_value.__enter__ = MagicMock()
_db_mock.get_connection.return_value.__exit__ = MagicMock()
_db_mock.close_engine.return_value = None

with patch.dict("os.environ", {
    "XAI_API_KEY": "test-key",
    "DATABASE_URL": "sqlite:///:memory:",
    "SENTINEXT_LOG_FILE": "/tmp/sentinext-backend.log",
}):
    with patch("apps.api.senti_next.db.init_postgresql_schema"):
        with patch("apps.api.senti_next.db.check_db_health", return_value=True):
            from fastapi.testclient import TestClient
            from apps.api.main import app

client = TestClient(app, raise_server_exceptions=False)

# Mark startup as complete so the startup gate middleware doesn't block
# test requests with 503.  In production this is set by the background
# init thread inside the lifespan; in tests we skip that entirely.
from apps.api.senti_next import db as _db_mod
_db_mod.startup_complete.set()


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        with patch("apps.api.senti_next.db.check_db_health", return_value=True):
            resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "timestamp" in body

    def test_health_returns_503_when_db_down(self):
        with patch("apps.api.senti_next.db.check_db_health", return_value=False):
            resp = client.get("/health")
        assert resp.status_code == 503
        assert resp.json()["status"] == "unhealthy"


class TestSearchEndpoint:
    def test_search_requires_query(self):
        resp = client.get("/search?query=a")
        assert resp.status_code == 400

    def test_search_valid_query(self):
        mock_item = MagicMock()
        mock_item.appid = 123
        mock_item.name = "Test Game"
        mock_item.price = None
        mock_item.url = "https://store.steampowered.com/app/123"
        mock_item.image_url = None
        with patch("apps.api.senti_next.routes.games.search_applications", return_value=[mock_item]):
            resp = client.get("/search?query=test+game")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["appid"] == 123


class TestGlobalExceptionHandler:
    def test_unhandled_error_returns_generic_500(self):
        """Verify that unhandled exceptions don't leak stack traces."""
        with patch("apps.api.senti_next.db.check_db_health", side_effect=RuntimeError("boom")):
            resp = client.get("/health")
        assert resp.status_code == 500
        body = resp.json()
        assert body["detail"] == "Internal server error."
        assert "boom" not in str(body)


class TestCORSHeaders:
    def test_cors_preflight(self):
        resp = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        allowed_methods = resp.headers.get("access-control-allow-methods", "")
        assert "GET" in allowed_methods
        # Verify wildcard is NOT used
        assert allowed_methods != "*"

    def test_cors_allowed_headers(self):
        resp = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        allowed_headers = resp.headers.get("access-control-allow-headers", "")
        assert "content-type" in allowed_headers.lower()


class TestDestructiveEndpoints:
    def test_database_clear_works_without_auth(self):
        """Destructive endpoints no longer require admin tokens."""
        with patch("apps.api.senti_next.storage.clear_entire_database", return_value={"reviews": 0}):
            resp = client.delete("/database/clear")
        assert resp.status_code == 200
        assert resp.json().get("scope") == "entire_database"
