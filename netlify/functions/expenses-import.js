'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event, ['manager', 'admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const { expenses } = body;
  if (!Array.isArray(expenses) || !expenses.length) return badRequest('expenses array is required');
  if (expenses.length > 500) return badRequest('Maximum 500 rows per import');

  let created = 0;
  try {
    for (const row of expenses) {
      const date     = String(row.expense_date || '').slice(0, 10);
      const amount   = parseFloat(row.amount);
      const category = String(row.category || 'Other').slice(0, 100);
      const desc     = String(row.description || '').slice(0, 500);

      if (!date || isNaN(amount) || amount <= 0) continue;

      await sql()`
        INSERT INTO expenses (expense_date, category, amount, description, status)
        VALUES (${date}, ${category}, ${amount}, ${desc}, 'pending')
      `;
      created++;
    }
    return ok({ created, message: `Imported ${created} expense(s).` });
  } catch (err) {
    return serverError(err);
  }
};
