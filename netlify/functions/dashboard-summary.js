'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  const params = event.queryStringParameters || {};
  const year = parseInt(params.year || String(new Date().getFullYear()), 10);

  // Employees only see their own; managers/admins see everything
  const userFilter = session.role === 'employee' ? parseInt(session.sub, 10) : null;

  try {
    const db = sql();

    const totalsRows = await db`
      SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total
        FROM expenses
       WHERE EXTRACT(YEAR FROM expense_date) = ${year}
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY status
    `;

    const status_totals = {};
    for (const r of totalsRows) {
      status_totals[r.status] = { count: r.count, total: parseFloat(r.total) };
    }

    const monthly = await db`
      SELECT TO_CHAR(date_trunc('month', expense_date), 'Mon') AS month_label,
             EXTRACT(MONTH FROM expense_date)::int AS month_num,
             COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::float AS approved,
             COALESCE(SUM(amount) FILTER (WHERE status = 'pending'),  0)::float AS pending,
             COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'), 0)::float AS rejected
        FROM expenses
       WHERE EXTRACT(YEAR FROM expense_date) = ${year}
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY 1, 2
       ORDER BY 2
    `;

    const cats = await db`
      SELECT category, COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
        FROM expenses
       WHERE EXTRACT(YEAR FROM expense_date) = ${year}
         AND status = 'approved'
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY category
       ORDER BY total DESC
    `;

    let pending_queue = 0;
    if (session.role === 'manager' || session.role === 'admin') {
      const pq = await db`SELECT COUNT(*)::int AS c FROM expenses WHERE status = 'pending'`;
      pending_queue = pq[0]?.c || 0;
    }

    return ok({
      year,
      status_totals,
      monthly_trend: monthly.map(r => ({
        month_label: r.month_label,
        month_num: r.month_num,
        approved: parseFloat(r.approved),
        pending: parseFloat(r.pending),
        rejected: parseFloat(r.rejected),
      })),
      category_totals: cats.map(c => ({ category: c.category, total: parseFloat(c.total), count: c.count })),
      pending_queue,
    });
  } catch (err) {
    return serverError(err);
  }
};
