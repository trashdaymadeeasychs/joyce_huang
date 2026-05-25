'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = await requireAuth(event, ['manager', 'admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  try {
    const rows = await sql()`
      SELECT id, email, full_name, role, is_active, created_at, last_login_at
        FROM users
       WHERE is_active = true
       ORDER BY full_name ASC
    `;
    return ok({ users: rows });
  } catch (err) {
    return serverError(err);
  }
};
