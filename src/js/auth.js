/* Auth module — login form, session state */
'use strict';

const Auth = (() => {
  let currentUser = null;

  function getUser() { return currentUser; }
  function setUser(u) { currentUser = u; }
  function clearUser() { currentUser = null; }

  async function init() {
    const identity = window.netlifyIdentity;
    if (identity && identity.init) identity.init();
    let identityUser = identity && identity.currentUser && identity.currentUser();
    if (identity && !identityUser) {
      identityUser = await new Promise((resolve) => {
        identity.on('init', (user) => resolve(user || identity.currentUser()));
        setTimeout(() => resolve(identity.currentUser && identity.currentUser()), 1500);
      });
    }
    if (!identityUser) return null;

    try {
      const { user } = await API.me();
      setUser(user);
      return user;
    } catch {
      return null;
    }
  }

  async function logout() {
    try {
      if (window.netlifyIdentity) {
        window.netlifyIdentity.logout();
      } else {
        await API.logout();
      }
    } catch {}
    clearUser();
    window.location.href = '/';
  }

  function initLoginForm() {
    const form    = document.getElementById('login-form');
    const errEl   = document.getElementById('login-error');
    const btn     = document.getElementById('login-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Signing in…';

      try {
        const { user } = await API.login(email, password);
        setUser(user);
        App.showApp(user);
      } catch (err) {
        errEl.textContent = err.message || 'Login failed. Check your credentials.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  return { init, logout, getUser, setUser, clearUser, initLoginForm };
})();

window.Auth = Auth;
