'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event, ['manager', 'admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const expenseId = parseInt(body.expense_id, 10);
  if (!expenseId) return badRequest('expense_id is required');

  try {
    const rows = await sql()`DELETE FROM expenses WHERE id = ${expenseId} RETURNING id`;
    if (!rows.length) return notFound('Expense not found');
    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
};
