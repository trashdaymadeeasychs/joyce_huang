'use strict';

// Single-user mode — site is protected by Netlify's site-wide password.
// All API calls are treated as Joyce Huang (user_id = 1, role = admin).
// No JWT or cookie auth required.

const STATIC_SESSION = {
  sub:   '1',
  role:  'admin',
  name:  'Joyce Huang',
  email: '',
};

function requireAuth(_event, _allowedRoles) {
  return { session: STATIC_SESSION };
}

function getSessionFromEvent(_event) {
  return STATIC_SESSION;
}

module.exports = {
  requireAuth,
  getSessionFromEvent,
  // stubs kept so any unused helper imports don't crash
  signSession:  () => '',
  verifySession: () => STATIC_SESSION,
  buildCookie:  () => '',
  clearCookie:  () => '',
  COOKIE_NAME:  '',
};
