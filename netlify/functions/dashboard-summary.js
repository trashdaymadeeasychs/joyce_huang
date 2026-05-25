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
  const userFilter = session.role === 'employee' ? parseInt(session.sub, 10) : null;

  try {
    const db = sql();

    // Status totals
    const totalsRows = await db`
      SELECT status,
             COUNT(*)::int AS count,
             COALESCE(SUM(amount), 0)::float AS total
        FROM expenses
       WHERE tax_year = ${year}
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY status
    `;
    const status_totals = {};
    for (const r of totalsRows) {
      status_totals[r.status] = { count: r.count, total: parseFloat(r.total) };
    }

    // Monthly trend
    const monthly = await db`
      SELECT TO_CHAR(date_trunc('month', expense_date), 'Mon') AS month_label,
             EXTRACT(MONTH FROM expense_date)::int AS month_num,
             COALESCE(SUM(amount) FILTER (WHERE status='approved'), 0)::float AS approved,
             COALESCE(SUM(amount) FILTER (WHERE status='pending'),  0)::float AS pending,
             COALESCE(SUM(amount) FILTER (WHERE status='rejected'), 0)::float AS rejected
        FROM expenses
       WHERE tax_year = ${year}
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY 1, 2
       ORDER BY 2
    `;

    // Category totals (approved only)
    const cats = await db`
      SELECT category,
             COALESCE(SUM(amount), 0)::float AS total,
             COUNT(*)::int AS count
        FROM expenses
       WHERE tax_year = ${year}
         AND status = 'approved'
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
       GROUP BY category
       ORDER BY total DESC
    `;

    // GST/HST total (all approved expenses)
    const gstRow = await db`
      SELECT COALESCE(SUM(gst_hst_amount), 0)::float AS gst_total,
             COALESCE(SUM(pst_qst_amount), 0)::float AS pst_total
        FROM expenses
       WHERE tax_year = ${year}
         AND status = 'approved'
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
    `;

    // Deductible total (approved, summing deductible_amount)
    const deductRow = await db`
      SELECT COALESCE(SUM(
               ROUND((amount + COALESCE(gst_hst_amount,0) + COALESCE(pst_qst_amount,0)) * COALESCE(deductible_pct,100) / 100, 2)
             ), 0)::float AS deductible_total
        FROM expenses
       WHERE tax_year = ${year}
         AND status = 'approved'
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
    `;

    // Income total for the year
    const incomeRow = await db`
      SELECT COALESCE(SUM(commission_amount), 0)::float AS income_total,
             COALESCE(SUM(gst_hst_collected), 0)::float AS income_gst_total
        FROM income
       WHERE tax_year = ${year}
         AND (${userFilter}::int IS NULL OR user_id = ${userFilter}::int)
    `;

    // Pending queue count (managers/admins only)
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
        month_num:   r.month_num,
        approved:    parseFloat(r.approved),
        pending:     parseFloat(r.pending),
        rejected:    parseFloat(r.rejected),
      })),
      category_totals: cats.map(c => ({
        category: c.category, total: parseFloat(c.total), count: c.count,
      })),
      gst_hst_total:    parseFloat(gstRow[0]?.gst_total)       || 0,
      pst_qst_total:    parseFloat(gstRow[0]?.pst_total)        || 0,
      deductible_total: parseFloat(deductRow[0]?.deductible_total) || 0,
      income_total:     parseFloat(incomeRow[0]?.income_total)  || 0,
      income_gst_total: parseFloat(incomeRow[0]?.income_gst_total) || 0,
      pending_queue,
    });
  } catch (err) {
    return serverError(err);
  }
};
