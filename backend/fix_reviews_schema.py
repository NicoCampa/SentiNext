"""Fix reviews table schema to match storage.py expectations."""
import os
from sqlalchemy import create_engine, text

def get_database_url():
    """Get PostgreSQL database URL from environment."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url
    raise RuntimeError("DATABASE_URL environment variable is required")

def main():
    """Run migration to fix reviews table schema."""
    url = get_database_url()
    engine = create_engine(url)

    with engine.connect() as conn:
        print("Fixing reviews table schema...")

        # Add missing columns if they don't exist
        try:
            conn.execute(text("""
                ALTER TABLE reviews
                ADD COLUMN IF NOT EXISTS timestamp_created BIGINT
            """))
            conn.commit()
            print("✓ Added timestamp_created column")
        except Exception as e:
            print(f"⚠ timestamp_created: {e}")
            conn.rollback()

        try:
            conn.execute(text("""
                ALTER TABLE reviews
                ADD COLUMN IF NOT EXISTS timestamp_updated BIGINT
            """))
            conn.commit()
            print("✓ Added timestamp_updated column")
        except Exception as e:
            print(f"⚠ timestamp_updated: {e}")
            conn.rollback()

        # Migrate data from created_at to timestamp_created if needed
        try:
            conn.execute(text("""
                UPDATE reviews
                SET timestamp_created = EXTRACT(EPOCH FROM created_at)::BIGINT
                WHERE timestamp_created IS NULL AND created_at IS NOT NULL
            """))
            conn.commit()
            print("✓ Migrated created_at to timestamp_created")
        except Exception as e:
            print(f"⚠ Data migration: {e}")
            conn.rollback()

        # Drop old unique constraint and add new one
        try:
            conn.execute(text("""
                ALTER TABLE reviews
                DROP CONSTRAINT IF EXISTS reviews_app_id_review_id_key
            """))
            conn.commit()
            print("✓ Dropped old constraint")
        except Exception as e:
            print(f"⚠ Drop constraint: {e}")
            conn.rollback()

        # Add unique constraint on review_id only
        try:
            conn.execute(text("""
                ALTER TABLE reviews
                ADD CONSTRAINT reviews_review_id_unique UNIQUE (review_id)
            """))
            conn.commit()
            print("✓ Added unique constraint on review_id")
        except Exception as e:
            print(f"⚠ Add constraint: {e}")
            conn.rollback()

        # Verify final schema
        result = conn.execute(text("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'reviews'
            ORDER BY ordinal_position
        """))
        print("\nFinal reviews table schema:")
        for row in result:
            print(f"  {row.column_name}: {row.data_type}")

        print("\n✅ Migration complete!")

if __name__ == "__main__":
    main()
