'use strict';

const bcrypt = require('bcryptjs');
const { sql } = require('./_shared/db');
const { signSession, buildCookie } = require('./_shared/auth');
const { ok, badRequest, unauthorized, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) return badRequest('Email and password are required');

  try {
    const rows = await sql()`
      SELECT id, email, full_name, role, password_hash, is_active
        FROM users
       WHERE lower(email) = ${email}
       LIMIT 1
    `;

    const user = rows[0];
    if (!user || !user.is_active) return unauthorized('Invalid credentials');

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) return unauthorized('Invalid credentials');

    await sql()`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;

    const token = signSession(user);

    return ok(
      {
        user: { id: user.id, email: user.email, name: user.full_name, role: user.role },
      },
      { 'Set-Cookie': buildCookie(token) },
    );
  } catch (err) {
    return serverError(err);
  }
};
