'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, serverError, methodNotAllowed } = require('./_shared/response');

const ALLOWED_STATUSES = new Set(['pending','approved','rejected']);

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  const params = event.queryStringParameters || {};
  const page   = Math.max(1, parseInt(params.page  || '1',  10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(params.limit || '20', 10) || 20));
  const offset = (page - 1) * limit;

  const status   = params.status && ALLOWED_STATUSES.has(params.status) ? params.status : null;
  const category = params.category || null;
  const dateFrom = params.date_from || null;
  const dateTo   = params.date_to   || null;
  const taxYear  = params.tax_year  ? parseInt(params.tax_year, 10) : null;

  let userIdFilter = null;
  if (session.role === 'employee') {
    userIdFilter = parseInt(session.sub, 10);
  } else if (params.user_id) {
    const parsed = parseInt(params.user_id, 10);
    if (!Number.isNaN(parsed)) userIdFilter = parsed;
  }

  try {
    const db   = sql();
    const rows = await db`
      SELECT e.id, e.user_id, e.expense_date, e.tax_year,
             e.category, e.subcategory, e.vendor,
             e.amount, e.gst_hst_amount, e.pst_qst_amount,
             (e.amount + COALESCE(e.gst_hst_amount,0) + COALESCE(e.pst_qst_amount,0)) AS total_amount,
             ROUND((e.amount + COALESCE(e.gst_hst_amount,0) + COALESCE(e.pst_qst_amount,0)) * COALESCE(e.deductible_pct,100) / 100, 2) AS deductible_amount,
             e.deductible_pct, e.province, e.payment_method,
             e.description, e.business_purpose, e.client_property,
             e.is_capital_asset, e.cca_class,
             e.odometer_start, e.odometer_end, e.total_km, e.business_km, e.business_use_pct,
             e.status, e.review_notes, e.receipt_url, e.receipt_storage, e.gmail_message_id,
             e.created_at, e.reviewed_at,
             u.full_name AS employee_name, u.email AS employee_email,
             r.full_name AS reviewed_by_name,
             COUNT(*) OVER() AS total_count
        FROM expenses e
        LEFT JOIN users u ON u.id = e.user_id
        LEFT JOIN users r ON r.id = e.reviewed_by
       WHERE (${userIdFilter}::int  IS NULL OR e.user_id   = ${userIdFilter}::int)
         AND (${status}::text       IS NULL OR e.status    = ${status}::text)
         AND (${category}::text     IS NULL OR e.category  = ${category}::text)
         AND (${dateFrom}::date     IS NULL OR e.expense_date >= ${dateFrom}::date)
         AND (${dateTo}::date       IS NULL OR e.expense_date <= ${dateTo}::date)
         AND (${taxYear}::int       IS NULL OR e.tax_year  = ${taxYear}::int)
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows.length ? parseInt(rows[0].total_count, 10) : 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    const expenses = rows.map(r => ({
      id:               r.id,
      user_id:          r.user_id,
      employee_name:    r.employee_name  || 'Unknown',
      employee_email:   r.employee_email || '—',
      expense_date:     r.expense_date,
      tax_year:         r.tax_year,
      category:         r.category,
      subcategory:      r.subcategory,
      vendor:           r.vendor,
      amount:           parseFloat(r.amount),
      gst_hst_amount:   parseFloat(r.gst_hst_amount) || 0,
      pst_qst_amount:   parseFloat(r.pst_qst_amount) || 0,
      total_amount:     parseFloat(r.total_amount)   || parseFloat(r.amount),
      deductible_pct:   parseFloat(r.deductible_pct) || 100,
      deductible_amount:parseFloat(r.deductible_amount) || parseFloat(r.amount),
      province:         r.province,
      payment_method:   r.payment_method,
      description:      r.description,
      business_purpose: r.business_purpose,
      client_property:  r.client_property,
      is_capital_asset: r.is_capital_asset,
      cca_class:        r.cca_class,
      odometer_start:   r.odometer_start ? parseFloat(r.odometer_start) : null,
      odometer_end:     r.odometer_end   ? parseFloat(r.odometer_end)   : null,
      total_km:         r.total_km       ? parseFloat(r.total_km)       : null,
      business_km:      r.business_km    ? parseFloat(r.business_km)    : null,
      business_use_pct: r.business_use_pct ? parseFloat(r.business_use_pct) : null,
      status:           r.status,
      review_notes:     r.review_notes,
      reviewed_by_name: r.reviewed_by_name,
      reviewed_at:      r.reviewed_at,
      receipt_url:      r.receipt_url,
      receipt_storage:  r.receipt_storage,
      gmail_message_id: r.gmail_message_id || null,
      created_at:       r.created_at,
    }));

    return ok({ expenses, pagination: { total, page, pages, limit } });
  } catch (err) {
    return serverError(err);
  }
};
