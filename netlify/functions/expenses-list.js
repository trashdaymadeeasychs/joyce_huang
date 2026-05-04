'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, serverError, methodNotAllowed } = require('./_shared/response');

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  const params = event.queryStringParameters || {};
  const page  = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit || '20', 10) || 20));
  const offset = (page - 1) * limit;

  const status   = params.status && ALLOWED_STATUSES.has(params.status) ? params.status : null;
  const category = params.category || null;
  const dateFrom = params.date_from || null;
  const dateTo   = params.date_to || null;

  let userIdFilter = null;
  if (session.role === 'employee') {
    userIdFilter = parseInt(session.sub, 10);
  } else if (params.user_id) {
    const parsed = parseInt(params.user_id, 10);
    if (!Number.isNaN(parsed)) userIdFilter = parsed;
  }

  try {
    const db = sql();

    const rows = await db`
      SELECT e.id, e.user_id, e.expense_date, e.category, e.amount, e.description,
             e.status, e.review_notes, e.receipt_url, e.receipt_storage,
             e.created_at, e.reviewed_at,
             u.full_name AS employee_name, u.email AS employee_email,
             r.full_name AS reviewed_by_name,
             COUNT(*) OVER() AS total_count
        FROM expenses e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN users r ON r.id = e.reviewed_by
       WHERE (${userIdFilter}::int IS NULL OR e.user_id = ${userIdFilter}::int)
         AND (${status}::text IS NULL OR e.status = ${status}::text)
         AND (${category}::text IS NULL OR e.category = ${category}::text)
         AND (${dateFrom}::date IS NULL OR e.expense_date >= ${dateFrom}::date)
         AND (${dateTo}::date IS NULL OR e.expense_date <= ${dateTo}::date)
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows.length ? parseInt(rows[0].total_count, 10) : 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    const expenses = rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      employee_name: r.employee_name,
      employee_email: r.employee_email,
      expense_date: r.expense_date,
      category: r.category,
      amount: parseFloat(r.amount),
      description: r.description,
      status: r.status,
      review_notes: r.review_notes,
      reviewed_by_name: r.reviewed_by_name,
      reviewed_at: r.reviewed_at,
      receipt_url: r.receipt_url,
      receipt_storage: r.receipt_storage,
      created_at: r.created_at,
    }));

    return ok({ expenses, pagination: { total, page, pages, limit } });
  } catch (err) {
    return serverError(err);
  }
};
