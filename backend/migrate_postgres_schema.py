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

    # Fix review_labels column names to match current schema
    print("\nFixing review_labels table...")

    # Check existing columns in review_labels
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'review_labels'
    """))
    labels_columns = {row[0] for row in result.fetchall()}

    # Rename model_id to model if needed
    if 'model_id' in labels_columns and 'model' not in labels_columns:
        print("Renaming model_id to model...")
        conn.execute(text("""
            ALTER TABLE review_labels RENAME COLUMN model_id TO model
        """))
        conn.commit()
        print("✓ Renamed model_id to model")

    # Rename label_payload to payload if needed
    if 'label_payload' in labels_columns and 'payload' not in labels_columns:
        print("Renaming label_payload to payload...")
        conn.execute(text("""
            ALTER TABLE review_labels RENAME COLUMN label_payload TO payload
        """))
        conn.commit()
        print("✓ Renamed label_payload to payload")

    # Rename context_hash to review_hash if needed
    if 'context_hash' in labels_columns and 'review_hash' not in labels_columns:
        print("Renaming context_hash to review_hash...")
        conn.execute(text("""
            ALTER TABLE review_labels RENAME COLUMN context_hash TO review_hash
        """))
        conn.commit()
        print("✓ Renamed context_hash to review_hash")

    # Change created_at to updated_at and make it BIGINT
    if 'created_at' in labels_columns and 'updated_at' not in labels_columns:
        print("Renaming created_at to updated_at and changing type...")
        # First add the new column
        conn.execute(text("""
            ALTER TABLE review_labels ADD COLUMN updated_at BIGINT
        """))
        # Extract epoch from timestamp and populate
        conn.execute(text("""
            UPDATE review_labels SET updated_at = EXTRACT(EPOCH FROM created_at)::BIGINT
        """))
        # Drop the old column
        conn.execute(text("""
            ALTER TABLE review_labels DROP COLUMN created_at
        """))
        conn.commit()
        print("✓ Renamed created_at to updated_at (BIGINT)")

    print("\nMigration complete!")
