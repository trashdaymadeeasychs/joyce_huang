-- TDME Expense Tracker — Schema
-- Target: Neon Postgres (15+)
-- Idempotent: safe to run multiple times.

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
