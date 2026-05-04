#!/usr/bin/env node
'use strict';

/**
 * Seed initial admin and sample accounts using a real bcrypt hash.
 *
 *   DATABASE_URL=...           (required)
 *   SEED_PASSWORD=ChangeMe123! (optional override)
 *
 *   node scripts/seed.js
 *
 * Idempotent: ON CONFLICT (email) DO NOTHING.
 */

const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');

const SEED_USERS = [
  { email: 'admin@trashdaymadeeasy.com',    full_name: 'TDME Admin',       role: 'admin' },
  { email: 'manager@trashdaymadeeasy.com',  full_name: 'Sample Manager',   role: 'manager' },
  { email: 'employee@trashdaymadeeasy.com', full_name: 'Sample Employee',  role: 'employee' },
];

// Earlier seeds wrote these typo'd addresses to live databases. Rename them
// in place before inserting so we don't create duplicate accounts side by side
// with the corrected ones.
const LEGACY_EMAIL_RENAMES = [
  { from: 'admin@trashdaymadeasy.com',    to: 'admin@trashdaymadeeasy.com'    },
  { from: 'manager@trashdaymadeasy.com',  to: 'manager@trashdaymadeeasy.com'  },
  { from: 'employee@trashdaymadeasy.com', to: 'employee@trashdaymadeeasy.com' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const password = process.env.SEED_PASSWORD || 'ChangeMe123!';
  const hash = await bcrypt.hash(password, 12);
  const sql = neon(url);

  for (const r of LEGACY_EMAIL_RENAMES) {
    const rows = await sql`
      UPDATE users SET email = ${r.to}
      WHERE email = ${r.from}
        AND NOT EXISTS (SELECT 1 FROM users WHERE email = ${r.to})
      RETURNING email
    `;
    if (rows.length) {
      console.log('renamed legacy email:', r.from, '->', r.to);
    }
  }

  for (const u of SEED_USERS) {
    await sql`
      INSERT INTO users (email, password_hash, full_name, role, is_active)
      VALUES (${u.email}, ${hash}, ${u.full_name}, ${u.role}, TRUE)
      ON CONFLICT (email) DO NOTHING
    `;
    console.log('seeded:', u.email, `(${u.role})`);
  }

  console.log('\nSeed complete.');
  console.log('Default password for all seeded users:', password);
  console.log('IMPORTANT: change every password after first login.');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
