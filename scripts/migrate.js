#!/usr/bin/env node
'use strict';

/**
 * Run db/schema.sql against the configured DATABASE_URL.
 *
 *   DATABASE_URL=... node scripts/migrate.js
 */

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sqlText = fs.readFileSync(schemaPath, 'utf8');

  const sql = neon(url);
  console.log('Applying schema from', schemaPath, '…');
  // The Neon serverless driver supports unsafe multi-statement strings via .query()
  // Fall back to splitting on semicolons if needed.
  if (typeof sql.query === 'function') {
    await sql.query(sqlText);
  } else {
    const statements = sqlText
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    for (const stmt of statements) {
      await sql([stmt + ';']);
    }
  }
  console.log('Migration complete.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
