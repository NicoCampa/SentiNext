"""Migrate PostgreSQL schema to latest version.

Run this script to update the database schema in any environment.
"""
import os
import sys
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
    """Run all schema migrations."""
    try:
        url = get_database_url()
        engine = create_engine(url)
        print("Connected to database")
        print("=" * 60)

        with engine.connect() as conn:
            # Migration 1: Fix reviews table
            print("\n[1/2] Migrating reviews table...")

            try:
                # Add timestamp columns
                conn.execute(text("""
                    ALTER TABLE reviews
                    ADD COLUMN IF NOT EXISTS timestamp_created BIGINT
                """))
                conn.execute(text("""
                    ALTER TABLE reviews
                    ADD COLUMN IF NOT EXISTS timestamp_updated BIGINT
                """))
                conn.commit()
                print("  ✓ Added timestamp columns")
            except Exception as e:
                print(f"  ⚠ Timestamp columns: {e}")
                conn.rollback()

            try:
                # Migrate data from created_at
                conn.execute(text("""
                    UPDATE reviews
                    SET timestamp_created = EXTRACT(EPOCH FROM created_at)::BIGINT,
                        timestamp_updated = EXTRACT(EPOCH FROM created_at)::BIGINT
                    WHERE timestamp_created IS NULL AND created_at IS NOT NULL
                """))
                conn.commit()
                print("  ✓ Migrated timestamp data")
            except Exception as e:
                print(f"  ⚠ Data migration: {e}")
                conn.rollback()

            try:
                # Drop old composite constraint
                conn.execute(text("""
                    ALTER TABLE reviews
                    DROP CONSTRAINT IF EXISTS reviews_app_id_review_id_key
                """))
                conn.commit()
                print("  ✓ Dropped old constraint")
            except Exception as e:
                print(f"  ⚠ Drop constraint: {e}")
                conn.rollback()

            try:
                # Add unique constraint on review_id only
                conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'reviews_review_id_unique'
                        ) THEN
                            ALTER TABLE reviews ADD CONSTRAINT reviews_review_id_unique UNIQUE (review_id);
                        END IF;
                    END $$;
                """))
                conn.commit()
                print("  ✓ Added unique constraint on review_id")
            except Exception as e:
                print(f"  ⚠ Add constraint: {e}")
                conn.rollback()

            # Migration 2: Rename classification_progress to progress (if needed)
            print("\n[2/2] Checking progress table...")

            try:
                # Check if old table exists
                result = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'classification_progress'
                    )
                """))
                has_old_table = result.scalar()

                if has_old_table:
                    print("  → Renaming classification_progress to progress...")
                    conn.execute(text("""
                        ALTER TABLE classification_progress RENAME TO progress
                    """))
                    conn.commit()
                    print("  ✓ Renamed table")
                else:
                    print("  ✓ Progress table already correct")
            except Exception as e:
                print(f"  ⚠ Progress table: {e}")
                conn.rollback()

            # Verify final schema
            print("\n" + "=" * 60)
            print("Final schema verification:")
            print("=" * 60)

            # Check reviews table
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'reviews'
                ORDER BY ordinal_position
            """))
            print("\nreviews table:")
            for row in result:
                nullable = "NULL" if row.is_nullable == "YES" else "NOT NULL"
                print(f"  {row.column_name:25} {row.data_type:20} {nullable}")

            # Check constraints
            result = conn.execute(text("""
                SELECT conname, contype
                FROM pg_constraint
                WHERE conrelid = 'reviews'::regclass
                ORDER BY conname
            """))
            print("\nConstraints:")
            for row in result:
                constraint_type = {'p': 'PRIMARY KEY', 'u': 'UNIQUE', 'f': 'FOREIGN KEY'}.get(row.contype, row.contype)
                print(f"  {row.conname:40} {constraint_type}")

            print("\n" + "=" * 60)
            print("✅ Migration completed successfully!")
            print("=" * 60)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
