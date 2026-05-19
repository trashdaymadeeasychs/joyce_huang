'use strict';

const { sql } = require('./_shared/db');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);
const MAX_BYTES = 5 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const contentType = String(body.content_type || 'application/octet-stream');
  const dataBase64  = String(body.data_base64 || '');
  const expenseId   = body.expense_id ? parseInt(body.expense_id, 10) : null;

  if (!dataBase64) return badRequest('data_base64 is required');
  if (!ALLOWED_TYPES.has(contentType)) return badRequest('Unsupported file type');

  const buf = Buffer.from(dataBase64, 'base64');
  if (buf.length > MAX_BYTES) return badRequest('File exceeds 5 MB limit');
  if (buf.length === 0) return badRequest('Empty file');

  const dataUrl = `data:${contentType};base64,${dataBase64}`;

  try {
    if (expenseId) {
      await sql()`
        UPDATE expenses
           SET receipt_url     = ${dataUrl},
               receipt_storage = 'db'
         WHERE id = ${expenseId}
      `;
    }
    return ok({ receipt_url: dataUrl, storage: 'db' });
  } catch (err) {
    return serverError(err);
  }
};
