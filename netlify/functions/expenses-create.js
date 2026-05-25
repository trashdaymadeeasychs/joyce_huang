'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

const VALID_CATEGORIES = new Set([
  'Vehicle', 'Marketing', 'Professional', 'Technology',
  'Office', 'Travel', 'Client Relations', 'Capital Assets',
]);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  // Required fields
  const expense_date = body.expense_date;
  const category     = body.category;
  const amount       = parseFloat(body.amount);

  if (!expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) return badRequest('Valid expense_date (YYYY-MM-DD) required');
  if (!category || !VALID_CATEGORIES.has(category)) return badRequest(`Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
  if (!amount || Number.isNaN(amount) || amount <= 0) return badRequest('Amount must be greater than 0');
  if (amount > 1_000_000) return badRequest('Amount too large');

  // Optional fields
  const tax_year        = parseInt(body.tax_year)  || new Date().getFullYear();
  const subcategory     = body.subcategory     ? String(body.subcategory).slice(0, 100)  : null;
  const vendor          = body.vendor          ? String(body.vendor).slice(0, 255)       : null;
  const gst_hst_amount  = Math.max(0, parseFloat(body.gst_hst_amount)  || 0);
  const pst_qst_amount  = Math.max(0, parseFloat(body.pst_qst_amount)  || 0);
  const province        = body.province        ? String(body.province).slice(0, 2).toUpperCase() : null;
  const payment_method  = body.payment_method  ? String(body.payment_method).slice(0, 50) : null;
  const deductible_pct  = Math.min(100, Math.max(0, parseFloat(body.deductible_pct ?? 100) || 100));
  const description     = body.description     ? String(body.description).slice(0, 1000)  : null;
  const business_purpose= body.business_purpose? String(body.business_purpose).slice(0,1000): null;
  const client_property = body.client_property ? String(body.client_property).slice(0, 255): null;
  const is_capital_asset= Boolean(body.is_capital_asset);
  const cca_class       = body.cca_class       ? String(body.cca_class).slice(0, 50)       : null;
  const receipt_url     = body.receipt_url     ? String(body.receipt_url)                  : null;
  const receipt_storage = body.receipt_storage ? String(body.receipt_storage).slice(0, 16) : 'none';

  // Vehicle KM fields
  const odometer_start  = body.odometer_start  != null ? parseFloat(body.odometer_start)  || null : null;
  const odometer_end    = body.odometer_end    != null ? parseFloat(body.odometer_end)    || null : null;
  const total_km        = body.total_km        != null ? parseFloat(body.total_km)        || null : null;
  const business_km     = body.business_km     != null ? parseFloat(body.business_km)     || null : null;
  const business_use_pct= body.business_use_pct!= null ? parseFloat(body.business_use_pct)|| null : null;

  try {
    const userId = parseInt(session.sub, 10);
    const rows = await sql()`
      INSERT INTO expenses (
        user_id, expense_date, tax_year, category, subcategory, vendor,
        amount, gst_hst_amount, pst_qst_amount,
        province, payment_method, deductible_pct,
        description, business_purpose, client_property,
        is_capital_asset, cca_class,
        odometer_start, odometer_end, total_km, business_km, business_use_pct,
        receipt_url, receipt_storage, status
      ) VALUES (
        ${userId}, ${expense_date}::date, ${tax_year}, ${category}, ${subcategory}, ${vendor},
        ${amount}, ${gst_hst_amount}, ${pst_qst_amount},
        ${province}, ${payment_method}, ${deductible_pct},
        ${description}, ${business_purpose}, ${client_property},
        ${is_capital_asset}, ${cca_class},
        ${odometer_start}, ${odometer_end}, ${total_km}, ${business_km}, ${business_use_pct},
        ${receipt_url}, ${receipt_storage}, 'pending'
      )
      RETURNING *
    `;
    return ok({ expense: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
