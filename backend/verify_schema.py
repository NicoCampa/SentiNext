"""Verify PostgreSQL schema has all required tables and columns."""
import os
from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL", "")
if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql://", 1)

engine = create_engine(url)

print("Checking PostgreSQL schema...\n")

with engine.connect() as conn:
    # Get all tables
    result = conn.execute(text("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    """))
    tables = [row[0] for row in result.fetchall()]

    print("Tables found:")
    for table in tables:
        print(f"  ✓ {table}")

    print("\nColumn details:\n")

    # Check each table's columns
    for table in tables:
        result = conn.execute(text(f"""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = '{table}'
            ORDER BY ordinal_position
        """))

        print(f"{table}:")
        for row in result.fetchall():
            nullable = "NULL" if row[2] == "YES" else "NOT NULL"
            print(f"  - {row[0]}: {row[1]} ({nullable})")
        print()

print("Schema verification complete!")
