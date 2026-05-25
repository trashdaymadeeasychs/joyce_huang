'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  const params  = event.queryStringParameters || {};
  const year    = parseInt(params.year || String(new Date().getFullYear()), 10);
  const month   = params.month ? parseInt(params.month, 10) : null;
  // Employees only see their own income; managers/admins see all
  const userFilter = session.role === 'employee' ? parseInt(session.sub, 10) : null;

  try {
    const db   = sql();
    const rows = await db`
      SELECT i.*, u.full_name AS user_name
        FROM income i
        LEFT JOIN users u ON u.id = i.user_id
       WHERE i.tax_year = ${year}
         AND (${month}::int      IS NULL OR i.month   = ${month}::int)
         AND (${userFilter}::int IS NULL OR i.user_id = ${userFilter}::int)
       ORDER BY i.month ASC, i.income_date ASC NULLS LAST, i.id ASC
    `;

    const records = rows.map(r => ({
      id:                 r.id,
      user_id:            r.user_id,
      user_name:          r.user_name,
      income_date:        r.income_date,
      month:              r.month,
      tax_year:           r.tax_year,
      client_or_property: r.client_or_property,
      brokerage_source:   r.brokerage_source,
      commission_amount:  parseFloat(r.commission_amount) || 0,
      gst_hst_collected:  parseFloat(r.gst_hst_collected) || 0,
      notes:              r.notes,
      created_at:         r.created_at,
      updated_at:         r.updated_at,
    }));

    return ok({ records });
  } catch (err) {
    return serverError(err);
  }
};
