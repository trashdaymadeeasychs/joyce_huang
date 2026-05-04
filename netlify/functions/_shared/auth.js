'use strict';

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'tdme_session';
const SESSION_DAYS = 7;

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET is not set or too short (need 32+ chars)');
  }
  return s;
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function signSession(user) {
  const payload = {
    sub: String(user.id),
    email: user.email,
    name: user.full_name,
    role: user.role,
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: `${SESSION_DAYS}d`,
    issuer: 'tdme-expenses',
  });
}

function verifySession(token) {
  try {
    return jwt.verify(token, getJwtSecret(), { issuer: 'tdme-expenses' });
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx === -1) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function buildCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isProd()) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProd()) parts.push('Secure');
  return parts.join('; ');
}

function getSessionFromEvent(event) {
  const cookieHeader =
    (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

function requireAuth(event, allowedRoles) {
  const session = getSessionFromEvent(event);
  if (!session) {
    return { error: { statusCode: 401, body: { error: 'Not authenticated' } } };
  }
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(session.role)) {
    return { error: { statusCode: 403, body: { error: 'Forbidden' } } };
  }
  return { session };
}

module.exports = {
  COOKIE_NAME,
  signSession,
  verifySession,
  buildCookie,
  clearCookie,
  getSessionFromEvent,
  requireAuth,
};
