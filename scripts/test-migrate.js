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

  // 7. Real schema parses to the expected statement count
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const real = splitSqlStatements(schema);
  // Expected: 1 EXTENSION + 2 CREATE TABLE + 7 CREATE INDEX + 1 CREATE FUNCTION
  // + 2 DROP TRIGGER + 2 CREATE TRIGGER = 15
  assert.strictEqual(real.length, 15, `schema split: got ${real.length}, expected 15`);
  const fnStmt = real.find(s => s.includes('CREATE OR REPLACE FUNCTION'));
  assert.ok(fnStmt, 'function statement found');
  assert.ok(fnStmt.includes('RETURN NEW;'), 'function body intact');
  assert.ok(fnStmt.includes('LANGUAGE plpgsql'), 'function language clause kept with body');

  console.log('splitter: OK (7 cases)');
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

(async () => {
  unitTests();
  await liveTest();
  console.log('\nAll tests passed.');
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
