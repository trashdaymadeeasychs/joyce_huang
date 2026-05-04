'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event, ['manager', 'admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const expenseId = parseInt(body.expense_id, 10);
  const status = body.status;
  const notes = body.review_notes ? String(body.review_notes).slice(0, 1000) : null;

  if (!expenseId) return badRequest('expense_id is required');
  if (status !== 'approved' && status !== 'rejected') return badRequest('status must be approved or rejected');
  if (status === 'rejected' && !notes) return badRequest('review_notes is required when rejecting');

  try {
    const reviewerId = parseInt(session.sub, 10);
    const rows = await sql()`
      UPDATE expenses
         SET status = ${status},
             review_notes = ${notes},
             reviewed_by = ${reviewerId},
             reviewed_at = NOW()
       WHERE id = ${expenseId}
       RETURNING id, status, reviewed_at
    `;
    if (!rows.length) return notFound('Expense not found');
    return ok({ expense: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
