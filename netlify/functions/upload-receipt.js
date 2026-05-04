'use strict';

const { getStore } = require('@netlify/blobs');
const { requireAuth } = require('./_shared/auth');
const { ok, json, badRequest, methodNotAllowed, serverError } = require('./_shared/response');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);
const MAX_BYTES = 5 * 1024 * 1024;

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return json(auth.error.statusCode, auth.error.body);
  const { session } = auth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return badRequest('Invalid JSON'); }

  const filename     = safeName(body.filename || 'receipt');
  const contentType  = String(body.content_type || 'application/octet-stream');
  const dataBase64   = String(body.data_base64 || '');

  if (!dataBase64) return badRequest('data_base64 is required');
  if (!ALLOWED_TYPES.has(contentType)) return badRequest('Unsupported file type');

  const buf = Buffer.from(dataBase64, 'base64');
  if (buf.length > MAX_BYTES) return badRequest('File exceeds 5 MB limit');
  if (buf.length === 0) return badRequest('Empty file');

  const mode = (process.env.UPLOAD_STORAGE_MODE || 'blob').toLowerCase();

  try {
    if (mode === 'db') {
      const dataUrl = `data:${contentType};base64,${dataBase64}`;
      return ok({ receipt_url: dataUrl, storage: 'db' });
    }

    // Default: Netlify Blobs
    const store = getStore({ name: 'receipts', consistency: 'strong' });
    const userId = session.sub;
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const key = `u${userId}/${ts}-${rand}-${filename}`;

    await store.set(key, buf, { metadata: { contentType, uploadedBy: userId, uploadedAt: new Date().toISOString() } });

    const url = `/.netlify/functions/receipt-view?key=${encodeURIComponent(key)}`;
    return ok({ receipt_url: url, storage: 'blob', key });
  } catch (err) {
    return serverError(err);
  }
};
