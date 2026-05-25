#!/usr/bin/env node
'use strict';

/**
 * Seed the Joyce Huang user (id = 1) into a fresh database.
 *
 *   DATABASE_URL=... node scripts/seed.js
 *
 * IMPORTANT: Run this on a completely empty database (right after migrate)
 * so Joyce gets SERIAL id = 1. The app hardcodes user_id = 1 for all
 * data writes (single-user mode, site gated by Netlify password).
 *
 * Idempotent: ON CONFLICT (email) DO UPDATE — safe to re-run.
 */

const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌  DATABASE_URL is not set.');
    console.error('    Set it in your environment or create a .env file.');
    process.exit(1);
  }

  const sql = neon(url);

  // Password is never used for login (site uses Netlify's site password),
  // but the column is NOT NULL so we store a secure placeholder hash.
  const placeholderHash = await bcrypt.hash('netlify-site-password-used-instead', 10);

  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, role, is_active)
    VALUES (
      'joyce@placeholder.local',
      ${placeholderHash},
      'Joyce Huang',
      'admin',
      TRUE
    )
    ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          role      = EXCLUDED.role,
          is_active = EXCLUDED.is_active
    RETURNING id, full_name, role
  `;

  const user = rows[0];
  console.log(`✅  User ready: id=${user.id}  "${user.full_name}"  role=${user.role}`);

  if (user.id !== 1) {
    console.warn('');
    console.warn(`⚠️  User id is ${user.id}, not 1.`);
    console.warn('   The app hardcodes user_id = 1 for all data.');
    console.warn('   Run this seed on a fresh empty database (right after migrate,');
    console.warn('   before inserting any other rows) so the SERIAL starts at 1.');
  } else {
    console.log('   user_id = 1 confirmed — app is ready to use.');
  }
}

main().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
