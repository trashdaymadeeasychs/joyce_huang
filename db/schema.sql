-- TDME Expense Tracker — Schema
-- Target: Neon Postgres (15+)
-- Idempotent: safe to run multiple times against:
--   * a fresh database
--   * a database where these tables already exist with the expected shape
--   * a database where these tables exist but are missing columns / indexes /
--     constraints (e.g. an older partial deployment). In that case the
--     ALTER blocks below bring the table up to the current contract without
--     dropping any user data.
--
-- Design notes:
--   * CREATE TABLE IF NOT EXISTS is a no-op when the table already exists,
--     even if its column list differs. To stay compatible with partial
--     legacy tables we follow each CREATE with explicit
--     ALTER TABLE ... ADD COLUMN IF NOT EXISTS for every required column.
--   * For NOT NULL columns we add the column nullable first (so we never
--     fail on a populated legacy table), backfill a sensible default where
--     one exists, then promote to NOT NULL only when the column has no
--     NULLs. Columns we genuinely cannot backfill (user_id FK) stay
--     nullable on legacy data — we log a NOTICE rather than blow up.
--   * CHECK / FK constraints are added inside DO blocks that first probe
--     pg_constraint, so re-runs are safe.
--
-- This file is the single source of truth for `npm run db:migrate`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── users ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  role            VARCHAR(16)  NOT NULL DEFAULT 'employee'
                  CHECK (role IN ('employee', 'manager', 'admin')),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

-- Bring an older/partial users table up to the current column set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email         VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name     VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role          VARCHAR(16)  DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active     BOOLEAN      DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ  DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ  DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Promote NOT NULL where the data allows. Each block is independent and
-- non-fatal so a partial legacy table cannot abort the whole migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE role IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN role SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE is_active IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN is_active SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE created_at IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN created_at SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE updated_at IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE email IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN email SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE password_hash IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE full_name IS NULL) THEN
    BEGIN ALTER TABLE users ALTER COLUMN full_name SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
END$$;

-- users.email UNIQUE — only added if it isn't already enforced (PK / unique
-- index / unique constraint). Probes pg_index so it works regardless of how
-- the constraint was originally created.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
     WHERE c.relname = 'users'
       AND i.indisunique
       AND a.attname = 'email'
       AND array_length(i.indkey, 1) = 1
  ) THEN
    BEGIN
      ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    EXCEPTION WHEN others THEN
      -- e.g. duplicate data — leave the constraint off rather than abort.
      RAISE NOTICE 'users.email UNIQUE not added: %', SQLERRM;
    END;
  END IF;
END$$;

-- users.role CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass AND conname = 'users_role_check'
  ) THEN
    BEGIN
      ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('employee', 'manager', 'admin'));
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'users_role_check not added: %', SQLERRM;
    END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);

-- ─── expenses ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expense_date     DATE     NOT NULL,
  category         VARCHAR(64)  NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description      TEXT,
  status           VARCHAR(16)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes     TEXT,
  reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  receipt_url      TEXT,
  receipt_storage  VARCHAR(16)  NOT NULL DEFAULT 'none'
                   CHECK (receipt_storage IN ('none', 'blob', 'db', 'external')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bring an older/partial expenses table up to the current column set.
-- All columns are added nullable here; NOT NULL is promoted below only if
-- the existing data allows it.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id         INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date    DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category        VARCHAR(64);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount          NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status          VARCHAR(16) DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS review_notes    TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_by     INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_at     TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_storage    VARCHAR(16) DEFAULT 'none';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gmail_message_id   TEXT;

-- Promote NOT NULL where the data allows. Each block is independent and
-- non-fatal so a partial legacy table cannot abort the whole migration.
-- user_id has no safe backfill default, so it stays nullable if the legacy
-- table has rows without one — a NOTICE is raised so the operator knows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE user_id IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  ELSE
    RAISE NOTICE 'expenses.user_id has NULL rows; leaving column nullable. Backfill these rows manually before promoting to NOT NULL.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM expenses WHERE expense_date IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN expense_date SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE category IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN category SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE amount IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN amount SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE status IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN status SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE receipt_storage IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN receipt_storage SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE created_at IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN created_at SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE updated_at IS NULL) THEN
    BEGIN ALTER TABLE expenses ALTER COLUMN updated_at SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  END IF;
END$$;

-- expenses.user_id FK → users(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'expenses'::regclass AND conname = 'expenses_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'expenses_user_id_fkey not added: %', SQLERRM;
    END;
  END IF;
END$$;

-- expenses.reviewed_by FK → users(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'expenses'::regclass AND conname = 'expenses_reviewed_by_fkey'
  ) THEN
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_reviewed_by_fkey
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'expenses_reviewed_by_fkey not added: %', SQLERRM;
    END;
  END IF;
END$$;

-- expenses.amount > 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'expenses'::regclass AND conname = 'expenses_amount_check'
  ) THEN
    BEGIN
      ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'expenses_amount_check not added: %', SQLERRM;
    END;
  END IF;
END$$;

-- expenses.status CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'expenses'::regclass AND conname = 'expenses_status_check'
  ) THEN
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'));
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'expenses_status_check not added: %', SQLERRM;
    END;
  END IF;
END$$;

-- expenses.receipt_storage CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'expenses'::regclass AND conname = 'expenses_receipt_storage_check'
  ) THEN
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_receipt_storage_check
        CHECK (receipt_storage IN ('none', 'blob', 'db', 'external'));
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'expenses_receipt_storage_check not added: %', SQLERRM;
    END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_expenses_user        ON expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status      ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_user_status ON expenses (user_id, status);

-- ─── updated_at trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at    ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
