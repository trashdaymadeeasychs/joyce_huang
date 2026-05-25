'use strict';

const bcrypt = require('bcryptjs');
const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

const VALID_ROLES = new Set(['employee', 'manager', 'admin']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event, ['admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const full_name = String(body.full_name || '').trim();
  const role = body.role || 'employee';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Valid email required');
  if (!full_name) return badRequest('Full name required');
  if (!VALID_ROLES.has(role)) return badRequest('Invalid role');
  if (!password || password.length < 8) return badRequest('Password must be at least 8 characters');

  try {
    const existing = await sql()`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
    if (existing.length) return badRequest('A user with this email already exists');

    const hash = await bcrypt.hash(password, 12);

    const rows = await sql()`
      INSERT INTO users (email, password_hash, full_name, role, is_active)
      VALUES (${email}, ${hash}, ${full_name}, ${role}, TRUE)
      RETURNING id, email, full_name, role, is_active, created_at
    `;
    return ok({ user: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
