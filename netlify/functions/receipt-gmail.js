'use strict';

const { requireAuth } = require('./_shared/auth');
const { methodNotAllowed, serverError } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const auth = requireAuth(event);
  if (auth.error) return { statusCode: auth.error.statusCode, body: JSON.stringify(auth.error.body) };

  const messageId = (event.queryStringParameters || {}).message_id;
  if (!messageId) return { statusCode: 400, body: JSON.stringify({ error: 'message_id is required' }) };

  const railwayUrl = process.env.RAILWAY_API_URL;
  const railwayPassword = process.env.RAILWAY_APP_PASSWORD;

  if (!railwayUrl) return { statusCode: 500, body: JSON.stringify({ error: 'RAILWAY_API_URL not configured' }) };

  try {
    const response = await fetch(`${railwayUrl}/receipt-email/${encodeURIComponent(messageId)}`, {
      headers: railwayPassword ? { 'Authorization': `Bearer ${railwayPassword}` } : {}
    });
    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return serverError(err);
  }
};