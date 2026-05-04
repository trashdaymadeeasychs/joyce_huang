#!/usr/bin/env node
'use strict';

/**
 * Run db/schema.sql against the configured DATABASE_URL.
 *
 *   DATABASE_URL=... node scripts/migrate.js
 *
 * The Neon HTTP driver only accepts ONE statement per call, so we split
 * the schema into individual statements (respecting dollar-quoted PL/pgSQL
 * function bodies, single/double-quoted strings, and comments) and apply
 * them one by one. The schema itself is idempotent (CREATE ... IF NOT
 * EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS) so re-runs
 * are safe.
 */

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

/**
 * Split a SQL script into individual statements.
 *
 * Aware of:
 *   - line comments      (-- ... \n)
 *   - block comments     (/* ... *\/)
 *   - single-quoted      ('...''...')
 *   - double-quoted      ("...""...")  (identifiers)
 *   - dollar-quoted      ($tag$ ... $tag$)  — used for PL/pgSQL bodies
 *
 * Statements are separated by top-level ';'. Empty / comment-only
 * fragments are dropped.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment
    if (ch === '-' && next === '-') {
      const eol = sql.indexOf('\n', i);
      const end = eol === -1 ? n : eol + 1;
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    // Single-quoted string (handles '' escapes)
    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < n) {
        const c = sql[i];
        current += c;
        i += 1;
        if (c === "'") {
          if (sql[i] === "'") { current += sql[i]; i += 1; continue; }
          break;
        }
      }
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      current += ch;
      i += 1;
      while (i < n) {
        const c = sql[i];
        current += c;
        i += 1;
        if (c === '"') {
          if (sql[i] === '"') { current += sql[i]; i += 1; continue; }
          break;
        }
      }
      continue;
    }

    // Dollar-quoted string ($tag$ ... $tag$)
    if (ch === '$') {
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        current += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    // Statement terminator
    if (ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  // Drop fragments that are only comments / whitespace
  return statements.filter(s => stripCommentsAndSpace(s).length > 0);
}

function stripCommentsAndSpace(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*\n?/g, '')
    .trim();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sqlText = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(sqlText);

  console.log(`Applying schema from ${schemaPath} (${statements.length} statements)…`);

  const sql = neon(url);
  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`  [${idx + 1}/${statements.length}] ${preview}${stmt.length > 80 ? '…' : ''}\n`);
    try {
      // Ordinary function-call form: neon(text, params?, opts?). One
      // statement per call — the HTTP endpoint rejects multi-statement
      // strings, which is why .query() / multi-statement input failed
      // before.
      await sql(stmt);
    } catch (err) {
      console.error(`\nStatement ${idx + 1} failed:\n${stmt}\n`);
      throw err;
    }
  }
  console.log('Migration complete.');
}

module.exports = { splitSqlStatements };

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
