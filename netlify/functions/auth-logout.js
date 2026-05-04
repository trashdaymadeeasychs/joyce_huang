'use strict';

const { clearCookie } = require('./_shared/auth');
const { ok, methodNotAllowed } = require('./_shared/response');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();
  return ok({ ok: true }, { 'Set-Cookie': clearCookie() });
};
