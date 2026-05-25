/* App — router, shell initialization, shared utilities */
'use strict';

const App = (() => {

  /* ── Shared helpers ─────────────────── */
  function fmt(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusBadge(s) {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
    const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
    return `<span class="badge ${map[s] || ''}">${label}</span>`;
  }

  function roleBadge(r) {
    const map = { employee: 'badge-employee', manager: 'badge-manager', admin: 'badge-admin' };
    const label = r ? r.charAt(0).toUpperCase() + r.slice(1) : '—';
    return `<span class="badge ${map[r] || ''}">${label}</span>`;
  }

  function receiptLink(url, storage) {
    if (!url) return '<span style="color:var(--text-hint);font-size:12px">—</span>';
    return `<span class="receipt-link" onclick="App.viewReceipt('${encodeURIComponent(url)}', '${storage || ''}')">📎 View</span>`;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function viewReceipt(encodedUrl, storage) {
    const url = decodeURIComponent(encodedUrl);
    const body = document.getElementById('receipt-modal-body');
    const modal = document.getElementById('receipt-modal');

    if (storage === 'db' || url.startsWith('data:')) {
      if (url.startsWith('data:image')) {
        body.innerHTML = `<img src="${url}" style="max-width:100%; border-radius:8px;">`;
      } else {
        body.innerHTML = `<a href="${url}" target="_blank" class="btn btn-navy">Open / Download Receipt</a>`;
      }
    } else {
      body.innerHTML = `<a href="${url}" target="_blank" class="btn btn-navy">Open Receipt</a>`;
    }
    modal.style.display = 'flex';
  }

  function buildPager(containerId, pagination, onPage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { total, page, pages, limit } = pagination;
    const start = (page - 1) * limit + 1;
    const end   = Math.min(page * limit, total);
    el.innerHTML = `
      <span>${total > 0 ? `Showing ${start}–${end} of ${total}` : '0 results'}</span>
      <div class="pager-btns">
        <button class="pager-btn" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">← Prev</button>
        <button class="pager-btn" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">Next →</button>
      </div>
    `;
    el.querySelectorAll('.pager-btn:not(:disabled)').forEach(b =>
      b.addEventListener('click', () => onPage(parseInt(b.dataset.p, 10)))
    );
  }

  /* ── Nav / view routing ──────────────── */
  let activeView = null;

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const el = document.getElementById('view-' + viewId);
    if (el) el.style.display = 'block';
    activeView = viewId;

    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.view === viewId);
    });

    const titles = {
      'emp-dashboard': 'Dashboard',
      'emp-submit':    'Submit Expense',
      'emp-history':   'My Expenses',
      'mgr-queue':     'Pending Approvals',
      'mgr-all':       'All Expenses',
      'mgr-import':    'Import Statement',
      'adm-users':     'User Management',
    };
    document.getElementById('topbar-title').textContent = titles[viewId] || '';

    // Lazy-load data for each view
    if (viewId === 'emp-dashboard')  loadEmpDashboard();
    if (viewId === 'emp-history')    loadHistory(1);
    if (viewId === 'mgr-queue')      loadQueue(1);
    if (viewId === 'mgr-all')        loadAllExpenses(1);
    if (viewId === 'mgr-import')     initImportView();
    if (viewId === 'adm-users')      loadUsers();
  }

  function setupNav(user) {
    const nav = document.getElementById('main-nav');
    nav.querySelectorAll('[data-roles]').forEach(el => {
      const roles = el.dataset.roles.split(',');
      el.style.display = roles.includes(user.role) ? '' : 'none';
    });

    nav.querySelectorAll('.nav-item').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        showView(a.dataset.view);
      });
    });

    // Nav links inside content
    document.querySelectorAll('.nav-link[data-view]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        showView(a.dataset.view);
      });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // Receipt modal close
    document.getElementById('receipt-close').addEventListener('click', () => {
      document.getElementById('receipt-modal').style.display = 'none';
    });
    document.getElementById('receipt-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    // Sidebar user info
    document.getElementById('sidebar-user-info').innerHTML =
      `<strong>${escHtml(user.name)}</strong>${roleBadge(user.role)} <span style="font-size:10px;display:block;margin-top:2px;">${escHtml(user.email)}</span>`;
  }

  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display    = 'none';
  }

  function showApp(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display    = 'flex';

    setupNav(user);

    // Default view by role
    if (user.role === 'admin' || user.role === 'manager') {
      showView('mgr-queue');
    } else {
      showView('emp-dashboard');
    }

    refreshPendingBadge();
  }

  async function refreshPendingBadge() {
    const user = Auth.getUser();
    if (!user || user.role === 'employee') return;
    try {
      const data = await API.getDashboard();
      const count = data.pending_queue || 0;
      const badge = document.getElementById('pending-badge');
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    } catch {}
  }

  /* ── Bootstrap ───────────────────────── */
  async function boot() {
    const user = await Auth.init();
    if (user) {
      showApp(user);
    } else {
      window.location.href = '/?login=required&returnTo=/apps/expense-tracker/';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    fmt, fmtDate, statusBadge, roleBadge, receiptLink, escHtml,
    showView, showLogin, showApp, viewReceipt, buildPager, refreshPendingBadge,
  };
})();

window.App = App;
