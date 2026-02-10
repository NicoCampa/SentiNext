"""Check PostgreSQL connectivity for SentiNext."""
from __future__ import annotations

import os

from sqlalchemy import create_engine, text


def main() -> int:
    url = os.environ.get("DATABASE_URL", "")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    print(f"Using URL: {url[:30]}...")

    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("Connection successful:", result.fetchone())
            tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).fetchall()
            print("Tables:", [t[0] for t in tables])
        return 0
    except Exception as exc:
        print(f"Error: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
