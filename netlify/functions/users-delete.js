'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event, ['admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const userId = parseInt(body.user_id, 10);
  if (!userId) return badRequest('user_id is required');

  if (userId === parseInt(session.sub, 10)) {
    return badRequest('You cannot delete your own account');
  }

  try {
    const rows = await sql()`
      UPDATE users SET is_active = false WHERE id = ${userId} RETURNING id
    `;
    if (!rows.length) return notFound('User not found');
    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
};
