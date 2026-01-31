"""Add timestamp columns to PostgreSQL reviews table."""
import os
from sqlalchemy import create_engine, text

# Get DATABASE_URL from environment
url = os.getenv("DATABASE_URL", "")
if url.startswith("postgres://"):
    url = url.replace("postgres://", "postgresql://", 1)

if not url or not url.startswith("postgresql://"):
    print("ERROR: DATABASE_URL not set or not PostgreSQL")
    exit(1)

print(f"Connecting to: {url[:50]}...")

engine = create_engine(url)

with engine.connect() as conn:
    # Check if columns exist
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'reviews'
        AND column_name IN ('timestamp_created', 'timestamp_updated')
    """))
    existing_columns = {row[0] for row in result.fetchall()}

    # Add timestamp_created if missing
    if 'timestamp_created' not in existing_columns:
        print("Adding timestamp_created column...")
        conn.execute(text("""
            ALTER TABLE reviews
            ADD COLUMN timestamp_created BIGINT
        """))
        conn.commit()
        print("✓ Added timestamp_created")
    else:
        print("✓ timestamp_created already exists")

    # Add timestamp_updated if missing
    if 'timestamp_updated' not in existing_columns:
        print("Adding timestamp_updated column...")
        conn.execute(text("""
            ALTER TABLE reviews
            ADD COLUMN timestamp_updated BIGINT
        """))
        conn.commit()
        print("✓ Added timestamp_updated")
    else:
        print("✓ timestamp_updated already exists")

    # Create index on timestamp_created for better query performance
    print("Creating index on timestamp_created...")
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_reviews_timestamp
        ON reviews(app_id, timestamp_created DESC)
    """))
    conn.commit()
    print("✓ Created index")

    print("\nMigration complete!")
