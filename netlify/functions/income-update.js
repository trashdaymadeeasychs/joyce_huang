'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const incomeId = parseInt(body.income_id, 10);
  if (!incomeId)  return badRequest('income_id required');

  const income_date        = body.income_date && /^\d{4}-\d{2}-\d{2}$/.test(body.income_date) ? body.income_date : null;
  const client_or_property = body.client_or_property != null ? String(body.client_or_property).slice(0, 255) : null;
  const brokerage_source   = body.brokerage_source   != null ? String(body.brokerage_source).slice(0, 255)   : null;
  const commission_amount  = body.commission_amount  != null ? Math.max(0, parseFloat(body.commission_amount) || 0) : null;
  const gst_hst_collected  = body.gst_hst_collected  != null ? Math.max(0, parseFloat(body.gst_hst_collected) || 0) : null;
  const notes              = body.notes              != null ? String(body.notes).slice(0, 1000)             : null;

  try {
    const userId = parseInt(session.sub, 10);

    // Employees can only edit their own records
    let ownerCheck = null;
    if (session.role === 'employee') ownerCheck = userId;

    const rows = await sql()`
      UPDATE income
         SET income_date        = COALESCE(${income_date}::date,        income_date),
             client_or_property = COALESCE(${client_or_property}::text, client_or_property),
             brokerage_source   = COALESCE(${brokerage_source}::text,   brokerage_source),
             commission_amount  = COALESCE(${commission_amount}::numeric,commission_amount),
             gst_hst_collected  = COALESCE(${gst_hst_collected}::numeric,gst_hst_collected),
             notes              = COALESCE(${notes}::text,               notes)
       WHERE id = ${incomeId}
         AND (${ownerCheck}::int IS NULL OR user_id = ${ownerCheck}::int)
       RETURNING *
    `;
    if (!rows.length) return notFound('Income record not found');
    return ok({ record: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
