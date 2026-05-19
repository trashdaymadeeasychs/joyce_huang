/* Manager views: pending queue, all expenses, charts */
'use strict';

let queuePage   = 1;
let allExpPage  = 1;
let chartMgrMonthly  = null;
let chartMgrCategory = null;
let cachedUsers = [];

/* ════════════════════════════════════════
   SHARED: populate employee filter selects
════════════════════════════════════════ */
async function populateEmployeeFilters() {
  try {
    const { users } = await API.getUsers();
    cachedUsers = users;
    const selectors = ['#queue-emp', '#all-emp'];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const saved = el.value;
      while (el.options.length > 1) el.remove(1);
      users.forEach(u => {
        const opt = new Option(`${u.full_name} (${u.email})`, u.id);
        el.add(opt);
      });
      if (saved) el.value = saved;
    });
  } catch {}
}

/* ════════════════════════════════════════
   MANAGER STATS
════════════════════════════════════════ */
async function loadMgrStats() {
  const grid = document.getElementById('mgr-stat-grid');
  if (!grid) return;
  try {
    const data = await API.getDashboard();
    const st   = data.status_totals || {};
    const approved = st.approved || { count: 0, total: 0 };
    const pending  = st.pending  || { count: 0, total: 0 };
    const rejected = st.rejected || { count: 0, total: 0 };

    grid.innerHTML = `
      <div class="stat-card gold">
        <div class="stat-label">Pending Review</div>
        <div class="stat-value">${pending.count}</div>
        <div class="stat-sub">${App.fmt(pending.total)} awaiting</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Approved (YTD)</div>
        <div class="stat-value">${App.fmt(approved.total)}</div>
        <div class="stat-sub">${approved.count} expenses</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Rejected (YTD)</div>
        <div class="stat-value">${rejected.count}</div>
        <div class="stat-sub">${App.fmt(rejected.total)}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Total Submitted (YTD)</div>
        <div class="stat-value">${approved.count + pending.count + rejected.count}</div>
        <div class="stat-sub">${App.fmt(approved.total + pending.total + rejected.total)}</div>
      </div>
    `;
  } catch {}
}

/* ════════════════════════════════════════
   PENDING QUEUE
════════════════════════════════════════ */
async function loadQueue(page = 1) {
  queuePage = page;
  await loadMgrStats();
  await populateEmployeeFilters();

  const tbody    = document.getElementById('queue-tbody');
  const emptyEl  = document.getElementById('queue-empty');
  const tableWrap = document.getElementById('queue-table-wrap');

  tbody.innerHTML = '<tr class="spinner-row"><td colspan="7">Loading…</td></tr>';

  const params = {
    status: 'pending',
    page,
    limit: 20,
    user_id:  document.getElementById('queue-emp')?.value  || '',
    category: document.getElementById('queue-cat')?.value  || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const { expenses, pagination } = await API.getExpenses(params);

    if (!expenses.length) {
      emptyEl.style.display  = 'block';
      tableWrap.style.display = 'none';
      document.getElementById('queue-pager').innerHTML = '';
      return;
    }

    emptyEl.style.display  = 'none';
    tableWrap.style.display = '';

    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.fmtDate(e.expense_date)}</td>
        <td>
          <strong>${App.escHtml(e.employee_name)}</strong>
          <div style="font-size:11px;color:var(--text-hint)">${App.escHtml(e.employee_email)}</div>
        </td>
        <td>${App.escHtml(e.category)}</td>
        <td class="amount">${App.fmt(e.amount)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${App.escHtml(e.description)}">${App.escHtml(e.description) || '—'}</td>
        <td>${App.receiptLink(e.receipt_url, e.receipt_storage)}</td>
        <td>
          <button class="btn btn-sm btn-approve" onclick="openReviewModal(${e.id}, ${App.escHtml(JSON.stringify(e))})">
            Review
          </button>
        </td>
      </tr>
    `).join('');

    App.buildPager('queue-pager', pagination, loadQueue);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">Failed to load queue: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

/* ════════════════════════════════════════
   ALL EXPENSES VIEW
════════════════════════════════════════ */
async function loadAllExpenses(page = 1) {
  allExpPage = page;
  await populateEmployeeFilters();

  const tbody = document.getElementById('all-tbody');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="9">Loading…</td></tr>';

  const params = {
    page,
    limit: 25,
    status:    document.getElementById('all-status')?.value   || '',
    user_id:   document.getElementById('all-emp')?.value      || '',
    category:  document.getElementById('all-cat')?.value      || '',
    date_from: document.getElementById('all-from')?.value     || '',
    date_to:   document.getElementById('all-to')?.value       || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const { expenses, pagination } = await API.getExpenses(params);

    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📁</div><p>No expenses found.</p></div></td></tr>';
      document.getElementById('all-pager').innerHTML = '';
    } else {
      tbody.innerHTML = expenses.map(e => `
        <tr>
          <td>${App.fmtDate(e.expense_date)}</td>
          <td>${App.escHtml(e.employee_name)}</td>
          <td>${App.escHtml(e.category)}</td>
          <td class="amount">${App.fmt(e.amount)}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              title="${App.escHtml(e.description)}">${App.escHtml(e.description) || '—'}</td>
          <td>${App.statusBadge(e.status)}</td>
          <td style="font-size:12px">${e.reviewed_by_name ? App.escHtml(e.reviewed_by_name) : '—'}</td>
          <td style="font-size:12px;color:var(--text-muted)">${e.review_notes ? App.escHtml(e.review_notes) : '—'}</td>
          <td>${App.receiptLink(e.receipt_url, e.receipt_storage)}</td>
        </tr>
      `).join('');
      App.buildPager('all-pager', pagination, loadAllExpenses);
    }

    loadMgrCharts();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-error">Failed to load expenses: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

async function loadMgrCharts() {
  try {
    const data  = await API.getDashboard();
    const trend = data.monthly_trend || [];
    const cats  = data.category_totals || [];
    const labels = trend.map(r => r.month_label);

    const mCtx = document.getElementById('chart-mgr-monthly');
    if (chartMgrMonthly) chartMgrMonthly.destroy();
    chartMgrMonthly = new Chart(mCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Approved', data: trend.map(r => r.approved), backgroundColor: 'rgba(26,122,74,0.75)', borderRadius: 4 },
          { label: 'Pending',  data: trend.map(r => r.pending),  backgroundColor: 'rgba(232,160,32,0.7)', borderRadius: 4 },
          { label: 'Rejected', data: trend.map(r => r.rejected), backgroundColor: 'rgba(201,64,64,0.65)'
