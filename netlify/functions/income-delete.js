'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const incomeId = parseInt(body.income_id, 10);
  if (!incomeId) return badRequest('income_id required');

  try {
    const userId = parseInt(session.sub, 10);

    // Employees can only delete their own records
    let ownerCheck = null;
    if (session.role === 'employee') ownerCheck = userId;

    const rows = await sql()`
      DELETE FROM income
       WHERE id = ${incomeId}
         AND (${ownerCheck}::int IS NULL OR user_id = ${ownerCheck}::int)
       RETURNING id
    `;
    if (!rows.length) return notFound('Income record not found');
    return ok({ deleted_id: rows[0].id });
  } catch (err) {
    return serverError(err);
  }
};
