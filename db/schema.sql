-- Joyce Huang — Canadian Realtor Expense Tracker — Schema
-- Target: Neon Postgres (15+)
-- Idempotent: safe to run multiple times on fresh or existing databases.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'employee'
                CHECK (role IN ('employee','manager','admin')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email         VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name     VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role          VARCHAR(16)  DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active     BOOLEAN      DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ  DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ  DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE c.relname = 'users' AND i.indisunique AND a.attname = 'email' AND array_length(i.indkey,1) = 1
  ) THEN
    BEGIN ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    EXCEPTION WHEN others THEN RAISE NOTICE 'users.email UNIQUE: %', SQLERRM; END;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_role_check') THEN
    BEGIN ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employee','manager','admin'));
    EXCEPTION WHEN others THEN RAISE NOTICE 'users_role_check: %', SQLERRM; END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);

-- ─── expenses ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expense_date     DATE          NOT NULL,
  tax_year         INTEGER       NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  category         VARCHAR(64)   NOT NULL,
  subcategory      VARCHAR(100),
  vendor           VARCHAR(255),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  gst_hst_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  pst_qst_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  province         VARCHAR(2),
  payment_method   VARCHAR(50),
  deductible_pct   NUMERIC(5,2)  NOT NULL DEFAULT 100,
  description      TEXT,
  business_purpose TEXT,
  client_property  VARCHAR(255),
  is_capital_asset BOOLEAN       NOT NULL DEFAULT FALSE,
  cca_class        VARCHAR(50),
  odometer_start   NUMERIC(10,1),
  odometer_end     NUMERIC(10,1),
  total_km         NUMERIC(10,1),
  business_km      NUMERIC(10,1),
  business_use_pct NUMERIC(5,2),
  status           VARCHAR(16)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  review_notes     TEXT,
  reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  receipt_url      TEXT,
  receipt_storage  VARCHAR(16)   NOT NULL DEFAULT 'none'
                   CHECK (receipt_storage IN ('none','blob','db','external')),
  gmail_message_id TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Safely add new Canadian-realtor columns to any existing expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_year         INTEGER       DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS subcategory      VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor           VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_hst_amount   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS pst_qst_amount   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS province         VARCHAR(2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method   VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deductible_pct   NUMERIC(5,2)  DEFAULT 100;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_purpose TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_property  VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_capital_asset BOOLEAN       DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cca_class        VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS odometer_start   NUMERIC(10,1);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS odometer_end     NUMERIC(10,1);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS total_km         NUMERIC(10,1);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_km      NUMERIC(10,1);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_use_pct NUMERIC(5,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url      TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_storage  VARCHAR(16)   DEFAULT 'none';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status           VARCHAR(16)   DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS review_notes     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_by      INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ   DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ   DEFAULT NOW();

-- Backfill NULLs so NOT NULL promotion succeeds
UPDATE expenses SET gst_hst_amount   = 0     WHERE gst_hst_amount   IS NULL;
UPDATE expenses SET pst_qst_amount   = 0     WHERE pst_qst_amount   IS NULL;
UPDATE expenses SET deductible_pct   = 100   WHERE deductible_pct   IS NULL;
UPDATE expenses SET is_capital_asset = FALSE WHERE is_capital_asset  IS NULL;
UPDATE expenses SET receipt_storage  = 'none' WHERE receipt_storage  IS NULL;
UPDATE expenses SET tax_year = EXTRACT(YEAR FROM COALESCE(expense_date, NOW())) WHERE tax_year IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='expenses'::regclass AND conname='expenses_amount_check') THEN
    BEGIN ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);
    EXCEPTION WHEN others THEN RAISE NOTICE 'expenses_amount_check: %', SQLERRM; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='expenses'::regclass AND conname='expenses_user_id_fkey') THEN
    BEGIN ALTER TABLE expenses ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
    EXCEPTION WHEN others THEN RAISE NOTICE 'expenses_user_id_fkey: %', SQLERRM; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='expenses'::regclass AND conname='expenses_reviewed_by_fkey') THEN
    BEGIN ALTER TABLE expenses ADD CONSTRAINT expenses_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN RAISE NOTICE 'expenses_reviewed_by_fkey: %', SQLERRM; END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_expenses_user        ON expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status      ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_year    ON expenses (tax_year);
CREATE INDEX IF NOT EXISTS idx_expenses_user_status ON expenses (user_id, status);

-- ─── income ─────────────────────────────────────────────────────────────
-- Commission income tracking, organized by month and tax year.
CREATE TABLE IF NOT EXISTS income (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  income_date        DATE,
  month              INTEGER       NOT NULL CHECK (month BETWEEN 1 AND 12),
  tax_year           INTEGER       NOT NULL,
  client_or_property VARCHAR(255),
  brokerage_source   VARCHAR(255),
  commission_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  gst_hst_collected  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gst_hst_collected >= 0),
  notes              TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE income ADD COLUMN IF NOT EXISTS user_id            INTEGER;
ALTER TABLE income ADD COLUMN IF NOT EXISTS income_date        DATE;
ALTER TABLE income ADD COLUMN IF NOT EXISTS month              INTEGER;
ALTER TABLE income ADD COLUMN IF NOT EXISTS tax_year           INTEGER;
ALTER TABLE income ADD COLUMN IF NOT EXISTS client_or_property VARCHAR(255);
ALTER TABLE income ADD COLUMN IF NOT EXISTS brokerage_source   VARCHAR(255);
ALTER TABLE income ADD COLUMN IF NOT EXISTS commission_amount  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE income ADD COLUMN IF NOT EXISTS gst_hst_collected  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE income ADD COLUMN IF NOT EXISTS notes              TEXT;
ALTER TABLE income ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ   DEFAULT NOW();
ALTER TABLE income ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ   DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='income'::regclass AND conname='income_user_id_fkey') THEN
    BEGIN ALTER TABLE income ADD CONSTRAINT income_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
    EXCEPTION WHEN others THEN RAISE NOTICE 'income_user_id_fkey: %', SQLERRM; END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='income'::regclass AND conname='income_month_check') THEN
    BEGIN ALTER TABLE income ADD CONSTRAINT income_month_check CHECK (month BETWEEN 1 AND 12);
    EXCEPTION WHEN others THEN RAISE NOTICE 'income_month_check: %', SQLERRM; END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_income_user     ON income (user_id);
CREATE INDEX IF NOT EXISTS idx_income_tax_year ON income (tax_year);
CREATE INDEX IF NOT EXISTS idx_income_month    ON income (tax_year, month);

-- ─── updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at    ON users;
CREATE TRIGGER users_set_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS income_set_updated_at   ON income;
CREATE TRIGGER income_set_updated_at   BEFORE UPDATE ON income   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
