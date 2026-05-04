#!/usr/bin/env node
'use strict';

/**
 * Local validation for the migration splitter and the schema itself.
 *
 *   node scripts/test-migrate.js                 # splitter unit tests only
 *   PG_TEST_URL=postgres://... node scripts/test-migrate.js   # also apply
 *                                                              # schema to a
 *                                                              # real Postgres
 *
 * No Neon connection required — uses node-postgres for the live test.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { splitSqlStatements } = require('./migrate');

function unitTests() {
  // 1. Plain statements
  let stmts = splitSqlStatements('CREATE TABLE a (id int); CREATE TABLE b (id int);');
  assert.strictEqual(stmts.length, 2, 'plain split');

  // 2. Semicolons inside dollar-quoted bodies must NOT split
  stmts = splitSqlStatements(`
    CREATE OR REPLACE FUNCTION f() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TABLE t (id int);
  `);
  assert.strictEqual(stmts.length, 2, 'dollar-quoted body kept whole');
  assert.ok(stmts[0].includes('RETURN NEW;'), 'function body preserved');
  assert.ok(stmts[0].includes('LANGUAGE plpgsql'));
  assert.ok(stmts[1].startsWith('CREATE TABLE t'));

  // 3. Tagged dollar quotes
  stmts = splitSqlStatements(`SELECT $body$ a;b;c $body$; SELECT 1;`);
  assert.strictEqual(stmts.length, 2);
  assert.ok(stmts[0].includes('a;b;c'));

  // 4. Single-quoted strings with embedded semicolons / escaped quotes
  stmts = splitSqlStatements(`INSERT INTO t VALUES ('a;b', 'it''s'); SELECT 1;`);
  assert.strictEqual(stmts.length, 2);

  // 5. Line and block comments are not statement separators
  stmts = splitSqlStatements(`
    -- a comment with ; semicolon
    /* block ; comment */
    SELECT 1;
    -- trailing comment
  `);
  assert.strictEqual(stmts.length, 1);

  // 6. Comment-only input -> no statements
  stmts = splitSqlStatements('-- nothing here\n/* still nothing */\n');
  assert.strictEqual(stmts.length, 0);

  // 7. Real schema parses cleanly. Don't pin an exact count — the ALTER /
  //    DO compatibility blocks added for partial-table recovery legitimately
  //    move that number around. Just assert that the splitter kept each
  //    DO $$ ... $$ block as one statement and produced more than the bare
  //    CREATEs we used to ship.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const real = splitSqlStatements(schema);
  assert.ok(real.length >= 15, `schema split too small: ${real.length}`);
  const fnStmt = real.find(s => s.includes('CREATE OR REPLACE FUNCTION'));
  assert.ok(fnStmt, 'function statement found');
  assert.ok(fnStmt.includes('RETURN NEW;'), 'function body intact');
  assert.ok(fnStmt.includes('LANGUAGE plpgsql'), 'function language clause kept with body');

  // Every DO $$ ... $$ block must survive as exactly one statement, and
  // none of the embedded ';' separators inside should have caused a split.
  const doBlocks = real.filter(s => /\bDO\s+\$\$/i.test(s));
  assert.ok(doBlocks.length >= 5, `expected idempotency DO blocks; got ${doBlocks.length}`);
  for (const d of doBlocks) {
    assert.ok(/\$\$\s*$/.test(d), `DO block not closed cleanly: ${d.slice(0, 60)}…`);
  }

  // 8. Dollar-quoted block with embedded BEGIN/END semicolons stays intact
  const stmts8 = splitSqlStatements(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1) THEN
        BEGIN ALTER TABLE t ALTER COLUMN c SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
      END IF;
    END$$;
    SELECT 1;
  `);
  assert.strictEqual(stmts8.length, 2, 'DO block with nested BEGIN/END kept whole');
  assert.ok(stmts8[0].includes('SET NOT NULL'));

  console.log('splitter: OK (8 cases)');
}

async function liveTest() {
  const url = process.env.PG_TEST_URL;
  if (!url) {
    console.log('PG_TEST_URL not set — skipping live Postgres test.');
    return;
  }
  const { Client } = require('pg');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const stmts = splitSqlStatements(schema);

  const client = new Client({ connectionString: url });
  await client.connect();

  // Reset to a clean slate for the test
  await client.query('DROP TABLE IF EXISTS expenses CASCADE');
  await client.query('DROP TABLE IF EXISTS users CASCADE');
  await client.query('DROP FUNCTION IF EXISTS set_updated_at() CASCADE');

  // Run twice to confirm idempotency
  for (const pass of [1, 2]) {
    for (const s of stmts) {
      await client.query(s);
    }
    console.log(`live: pass ${pass} applied ${stmts.length} statements`);
  }

  // Verify objects exist
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`
  );
  const names = tables.rows.map(r => r.table_name);
  assert.deepStrictEqual(names, ['expenses', 'users'], `tables: ${names}`);

  const triggers = await client.query(
    `SELECT trigger_name FROM information_schema.triggers
     WHERE trigger_schema='public' ORDER BY trigger_name`
  );
  const trigNames = [...new Set(triggers.rows.map(r => r.trigger_name))];
  assert.deepStrictEqual(trigNames, ['expenses_set_updated_at', 'users_set_updated_at']);

  // Insert and confirm trigger updates updated_at on UPDATE
  await client.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ('t@x', 'h', 'T') ON CONFLICT (email) DO NOTHING`
  );
  const before = await client.query(`SELECT updated_at FROM users WHERE email='t@x'`);
  await new Promise(r => setTimeout(r, 50));
  await client.query(`UPDATE users SET full_name='T2' WHERE email='t@x'`);
  const after = await client.query(`SELECT updated_at FROM users WHERE email='t@x'`);
  assert.ok(after.rows[0].updated_at > before.rows[0].updated_at, 'trigger fired');

  await client.end();
  console.log('live: OK (idempotent x2, tables/triggers verified, updated_at trigger fires)');
}

// Reproduce the user-reported regression: an existing `expenses` table that
// was created by an older deployment and is missing `user_id` (and other
// columns). With `CREATE TABLE IF NOT EXISTS` alone, applying the schema
// blew up at `CREATE INDEX ... (user_id)` with `column "user_id" does not
// exist`. The compatibility ALTERs in db/schema.sql must heal this in place
// without dropping any existing rows.
async function partialTableTest() {
  const url = process.env.PG_TEST_URL;
  if (!url) return;

  const { Client } = require('pg');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const stmts = splitSqlStatements(schema);

  const client = new Client({ connectionString: url });
  await client.connect();

  // Wipe and seed the kind of "partial legacy" state the user has in Neon:
  //   * users exists with the bare minimum columns
  //   * expenses exists but only has id/amount — none of the columns the
  //     app actually queries (user_id, expense_date, status, …)
  await client.query('DROP TABLE IF EXISTS expenses CASCADE');
  await client.query('DROP TABLE IF EXISTS users CASCADE');
  await client.query('DROP FUNCTION IF EXISTS set_updated_at() CASCADE');

  await client.query(`
    CREATE TABLE users (
      id    SERIAL PRIMARY KEY,
      email VARCHAR(255)
    )
  `);
  await client.query(`
    CREATE TABLE expenses (
      id     SERIAL PRIMARY KEY,
      amount NUMERIC(12,2)
    )
  `);
  // Seed one row in each so we can prove the ALTERs don't drop data.
  await client.query(`INSERT INTO users (email) VALUES ('legacy@x') RETURNING id`);
  await client.query(`INSERT INTO expenses (amount) VALUES (12.34)`);

  // Apply the new schema. This is what `npm run db:migrate` does in prod.
  for (const s of stmts) {
    await client.query(s);
  }

  // Every column the app reads/writes must now exist.
  const expectedExpenseCols = [
    'id', 'user_id', 'expense_date', 'category', 'amount', 'description',
    'status', 'review_notes', 'reviewed_by', 'reviewed_at', 'receipt_url',
    'receipt_storage', 'created_at', 'updated_at',
  ];
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='expenses'`
  );
  const have = new Set(cols.rows.map(r => r.column_name));
  for (const c of expectedExpenseCols) {
    assert.ok(have.has(c), `expenses.${c} missing after compat migration`);
  }

  // The expense indexes (incl. the one that was failing — idx_expenses_user)
  // must all exist now.
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename='expenses'`
  );
  const idxNames = new Set(idx.rows.map(r => r.indexname));
  for (const n of [
    'idx_expenses_user', 'idx_expenses_status', 'idx_expenses_date',
    'idx_expenses_category', 'idx_expenses_user_status',
  ]) {
    assert.ok(idxNames.has(n), `index ${n} missing`);
  }

  // The legacy rows survived.
  const u = await client.query(`SELECT COUNT(*)::int AS c FROM users`);
  const e = await client.query(`SELECT COUNT(*)::int AS c FROM expenses`);
  assert.strictEqual(u.rows[0].c, 1, 'legacy user row preserved');
  assert.strictEqual(e.rows[0].c, 1, 'legacy expense row preserved');

  // user_id was added nullable on the legacy row (no safe backfill), so it
  // must NOT have been promoted to NOT NULL. Confirm the column is still
  // nullable AND that a fresh INSERT through the app's normal contract
  // works once we backfill the legacy row.
  const nullable = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='expenses' AND column_name='user_id'`
  );
  assert.strictEqual(nullable.rows[0].is_nullable, 'YES',
    'expenses.user_id should stay nullable while a NULL row exists');

  // Backfill the orphan row, then re-run the schema — NOT NULL should
  // promote on the second pass and the FK should hold.
  await client.query(`UPDATE expenses SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL`);
  await client.query(`UPDATE expenses SET expense_date = CURRENT_DATE WHERE expense_date IS NULL`);
  await client.query(`UPDATE expenses SET category = 'Other' WHERE category IS NULL`);
  for (const s of stmts) await client.query(s);
  const nullable2 = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='expenses' AND column_name='user_id'`
  );
  assert.strictEqual(nullable2.rows[0].is_nullable, 'NO',
    'expenses.user_id should be NOT NULL once data is clean');

  // The exact INSERT shape used by netlify/functions/expenses-create.js
  // works against the healed table.
  await client.query(`
    INSERT INTO expenses
      (user_id, expense_date, category, amount, description, receipt_url, receipt_storage, status)
    VALUES
      ((SELECT id FROM users LIMIT 1), CURRENT_DATE, 'Fuel', 42.00, 'test', NULL, 'none', 'pending')
  `);

  await client.end();
  console.log('live: OK (partial legacy table healed; data preserved; FK + NOT NULL promoted after backfill)');
}

(async () => {
  unitTests();
  await liveTest();
  await partialTableTest();
  console.log('\nAll tests passed.');
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
