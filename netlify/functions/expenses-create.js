'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

const VALID_CATEGORIES = new Set([
  'Fuel', 'Vehicle Maintenance', 'Supplies & Equipment',
  'Meals & Entertainment', 'Uniforms', 'Office Expenses', 'Marketing', 'Other',
]);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const expense_date = body.expense_date;
  const category    = body.category;
  const amount      = parseFloat(body.amount);
  const description = body.description ? String(body.description).slice(0, 1000) : null;
  const receipt_url = body.receipt_url ? String(body.receipt_url) : null;
  const receipt_storage = body.receipt_storage ? String(body.receipt_storage).slice(0, 16) : 'none';

  if (!expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) return badRequest('Valid expense_date (YYYY-MM-DD) required');
  if (!category || !VALID_CATEGORIES.has(category)) return badRequest('Invalid category');
  if (!amount || Number.isNaN(amount) || amount <= 0) return badRequest('Amount must be greater than 0');
  if (amount > 1_000_000) return badRequest('Amount too large');

  try {
    const userId = parseInt(session.sub, 10);
    const payee = (description || category).slice(0, 255);
    const rows = await sql()`
      INSERT INTO expenses
        (user_id, expense_date, date, payee, category, amount, description, receipt_url, receipt_storage, status)
      VALUES
        (${userId}, ${expense_date}::date, ${expense_date}, ${payee}, ${category}, ${amount}, ${description},
         ${receipt_url}, ${receipt_storage}, 'pending')
      RETURNING id, user_id, expense_date, category, amount, description, status, created_at
    `;
    return ok({ expense: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
