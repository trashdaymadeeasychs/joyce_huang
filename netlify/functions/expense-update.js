'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, notFound, methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = await requireAuth(event, ['manager','admin']);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const expenseId      = parseInt(body.expense_id, 10);
  if (!expenseId)       return badRequest('expense_id required');

  const gmailMsgId     = body.gmail_message_id ? String(body.gmail_message_id) : null;
  const category       = body.category         ? String(body.category).slice(0, 64)    : null;
  const subcategory    = body.subcategory       ? String(body.subcategory).slice(0, 100): null;
  const vendor         = body.vendor            ? String(body.vendor).slice(0, 255)     : null;
  const description    = body.description       ? String(body.description).slice(0, 1000):null;
  const bizPurpose     = body.business_purpose  ? String(body.business_purpose).slice(0,1000):null;
  const clientProp     = body.client_property   ? String(body.client_property).slice(0,255):null;
  const expenseDate    = body.expense_date       ? String(body.expense_date).slice(0, 10): null;
  const province       = body.province           ? String(body.province).slice(0, 2).toUpperCase() : null;
  const paymentMethod  = body.payment_method     ? String(body.payment_method).slice(0,50):null;
  const deductPct      = body.deductible_pct != null ? Math.min(100, Math.max(0, parseFloat(body.deductible_pct)||100)) : null;
  const gstHst         = body.gst_hst_amount != null ? Math.max(0, parseFloat(body.gst_hst_amount)||0) : null;
  const pstQst         = body.pst_qst_amount != null ? Math.max(0, parseFloat(body.pst_qst_amount)||0) : null;
  const receiptUrl     = body.receipt_url    != null ? String(body.receipt_url)          : undefined;
  const receiptStorage = body.receipt_storage!= null ? String(body.receipt_storage).slice(0,16) : undefined;

  try {
    const rows = await sql()`
      UPDATE expenses
         SET gmail_message_id = COALESCE(${gmailMsgId}::text,        gmail_message_id),
             category         = COALESCE(${category}::text,           category),
             subcategory      = COALESCE(${subcategory}::text,        subcategory),
             vendor           = COALESCE(${vendor}::text,             vendor),
             description      = COALESCE(${description}::text,        description),
             business_purpose = COALESCE(${bizPurpose}::text,         business_purpose),
             client_property  = COALESCE(${clientProp}::text,         client_property),
             expense_date     = COALESCE(${expenseDate}::date,        expense_date),
             province         = COALESCE(${province}::text,           province),
             payment_method   = COALESCE(${paymentMethod}::text,      payment_method),
             deductible_pct   = COALESCE(${deductPct}::numeric,       deductible_pct),
             gst_hst_amount   = COALESCE(${gstHst}::numeric,          gst_hst_amount),
             pst_qst_amount   = COALESCE(${pstQst}::numeric,          pst_qst_amount),
             receipt_url      = CASE WHEN ${receiptUrl !== undefined}::boolean THEN ${receiptUrl||null}::text ELSE receipt_url END,
             receipt_storage  = CASE WHEN ${receiptStorage !== undefined}::boolean THEN ${receiptStorage||'none'}::varchar ELSE receipt_storage END
       WHERE id = ${expenseId}
       RETURNING id, category, subcategory, vendor, expense_date, status, updated_at
    `;
    if (!rows.length) return notFound('Expense not found');
    return ok({ expense: rows[0] });
  } catch (err) {
    return serverError(err);
  }
};
