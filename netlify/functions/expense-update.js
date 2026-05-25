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

  const category    = body.category          ? String(body.category).slice(0, 100)    : null;
  const description = body.description       ? String(body.description).slice(0, 500) : null;
  const gmailMsgId  = body.gmail_message_id  ? String(body.gmail_message_id)          : null;
  const userId      = body.user_id           ? parseInt(body.user_id, 10)             : null;

  try {
    const rows = await sql()`
      UPDATE expenses
         SET category         = COALESCE(${category}::text,    category),
             description      = COALESCE(${description}::text, description),
             gmail_message_id = COALESCE(${gmailMsgId}::text,  gmail_message_id),
             user_id          = COALESCE(${userId}::int,        user_id)
       WHERE id = ${expenseId}
       RETURNING id, category, description, gmail_message_id, user_id
    `;
    if (!rows.length) return notFound('Expense not found');
    return ok({ expense: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
