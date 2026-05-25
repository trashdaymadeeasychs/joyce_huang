/* Auth module — single-user, no login required.
   Site access is controlled by Netlify's site-wide password. */
'use strict';

const Auth = (() => {
  const STATIC_USER = { id: 1, name: 'Joyce Huang', role: 'admin', email: '' };
  let currentUser = STATIC_USER;

  function getUser()   { return currentUser; }
  function setUser(u)  { currentUser = u; }
  function clearUser() { currentUser = STATIC_USER; }

  // Always resolves immediately — no server round-trip needed
  async function init() { return currentUser; }

  // No-op: sign-out is handled by Netlify's site password at the browser level
  async function logout() {}

  // No login form in single-user mode
  function initLoginForm() {}

  return { init, logout, getUser, setUser, clearUser, initLoginForm };
})();

window.Auth = Auth;
