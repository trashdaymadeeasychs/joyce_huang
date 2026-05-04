'use strict';

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function ok(body, extraHeaders) { return json(200, body, extraHeaders); }
function badRequest(msg)        { return json(400, { error: msg || 'Bad request' }); }
function unauthorized(msg)      { return json(401, { error: msg || 'Unauthorized' }); }
function forbidden(msg)         { return json(403, { error: msg || 'Forbidden' }); }
function notFound(msg)          { return json(404, { error: msg || 'Not found' }); }
function methodNotAllowed()     { return json(405, { error: 'Method not allowed' }); }
function serverError(err) {
  const msg = (err && err.message) || 'Internal error';
  console.error('[serverError]', err);
  return json(500, { error: msg });
}

module.exports = { json, ok, badRequest, unauthorized, forbidden, notFound, methodNotAllowed, serverError };
