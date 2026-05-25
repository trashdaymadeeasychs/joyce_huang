'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const month    = parseInt(body.month, 10);
  const tax_year = parseInt(body.tax_year, 10) || new Date().getFullYear();

  if (!month || month < 1 || month > 12) return badRequest('month (1–12) is required');
  if (!tax_year || tax_year < 2000)       return badRequest('Valid tax_year is required');

  const commission_amount = Math.max(0, parseFloat(body.commission_amount) || 0);
  const gst_hst_collected = Math.max(0, parseFloat(body.gst_hst_collected) || 0);
  const income_date       = body.income_date && /^\d{4}-\d{2}-\d{2}$/.test(body.income_date) ? body.income_date : null;
  const client_or_property= body.client_or_property ? String(body.client_or_property).slice(0, 255) : null;
  const brokerage_source  = body.brokerage_source   ? String(body.brokerage_source).slice(0, 255)   : null;
  const notes             = body.notes              ? String(body.notes).slice(0, 1000)             : null;

  try {
    const userId = parseInt(session.sub, 10);
    const rows   = await sql()`
      INSERT INTO income (
        user_id, income_date, month, tax_year,
        client_or_property, brokerage_source,
        commission_amount, gst_hst_collected, notes
      ) VALUES (
        ${userId}, ${income_date}::date, ${month}, ${tax_year},
        ${client_or_property}, ${brokerage_source},
        ${commission_amount}, ${gst_hst_collected}, ${notes}
      )
      RETURNING *
    `;
    return ok({ record: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
