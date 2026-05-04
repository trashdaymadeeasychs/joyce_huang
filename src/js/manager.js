/* Manager views: pending queue, all expenses, charts */
'use strict';

let queuePage   = 1;
let allExpPage  = 1;
let chartMgrMonthly  = null;
let chartMgrCategory = null;

/* ════════════════════════════════════════
   SHARED: populate employee filter selects
════════════════════════════════════════ */
async function populateEmployeeFilters() {
  try {
    const { users } = await API.getUsers();
    const selectors = ['#queue-emp', '#all-emp'];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const saved = el.value;
      // Keep first option (All Employees), rebuild rest
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

    // Also refresh charts
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

    // Monthly bar
    const mCtx = document.getElementById('chart-mgr-monthly');
    if (chartMgrMonthly) chartMgrMonthly.destroy();
    chartMgrMonthly = new Chart(mCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Approved', data: trend.map(r => r.approved), backgroundColor: 'rgba(26,122,74,0.75)', borderRadius: 4 },
          { label: 'Pending',  data: trend.map(r => r.pending),  backgroundColor: 'rgba(232,160,32,0.7)', borderRadius: 4 },
          { label: 'Rejected', data: trend.map(r => r.rejected), backgroundColor: 'rgba(201,64,64,0.65)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { font: { size: 11 } } },
          y: { stacked: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() } },
        },
      },
    });

    // Category doughnut
    const cCtx = document.getElementById('chart-mgr-category');
    if (chartMgrCategory) chartMgrCategory.destroy();
    const COLORS = ['#1a2a4a','#e8a020','#1a7a4a','#c94040','#3b7dd8','#7c3aed','#0891b2','#64748b'];
    chartMgrCategory = new Chart(cCtx, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.category),
        datasets: [{ data: cats.map(c => c.total), backgroundColor: COLORS, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}` } },
        },
      },
    });
  } catch {}
}

/* ════════════════════════════════════════
   REVIEW MODAL
════════════════════════════════════════ */
let reviewingExpenseId = null;

function openReviewModal(expenseId, expense) {
  reviewingExpenseId = expenseId;

  const e = typeof expense === 'string' ? JSON.parse(expense) : expense;

  document.getElementById('review-modal-body').innerHTML = `
    <div class="modal-detail">
      <span class="lbl">Employee</span>  <span>${App.escHtml(e.employee_name)} <span style="color:var(--text-hint);font-size:11px">${App.escHtml(e.employee_email)}</span></span>
      <span class="lbl">Date</span>      <span>${App.fmtDate(e.expense_date)}</span>
      <span class="lbl">Category</span>  <span>${App.escHtml(e.category)}</span>
      <span class="lbl">Amount</span>    <span class="amount">${App.fmt(e.amount)}</span>
      <span class="lbl">Description</span><span>${App.escHtml(e.description) || '—'}</span>
      <span class="lbl">Receipt</span>   <span>${App.receiptLink(e.receipt_url, e.receipt_storage)}</span>
      <span class="lbl">Submitted</span> <span>${App.fmtDate(e.created_at)}</span>
    </div>
  `;

  document.getElementById('review-notes').value = '';
  document.getElementById('review-error').style.display = 'none';
  document.getElementById('review-modal').style.display = 'flex';
}

async function submitReview(status) {
  const notes = document.getElementById('review-notes').value.trim();
  const errEl = document.getElementById('review-error');

  if (status === 'rejected' && !notes) {
    errEl.textContent = 'Please provide a reason for rejection.';
    errEl.style.display = 'block';
    return;
  }

  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn  = document.getElementById('reject-btn');
  approveBtn.disabled = rejectBtn.disabled = true;

  try {
    await API.updateExpenseStatus({
      expense_id:   reviewingExpenseId,
      status,
      review_notes: notes || null,
    });

    document.getElementById('review-modal').style.display = 'none';
    loadQueue(queuePage);
    App.refreshPendingBadge();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to update status.';
    errEl.style.display = 'block';
    approveBtn.disabled = rejectBtn.disabled = false;
  }
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('approve-btn')?.addEventListener('click', () => submitReview('approved'));
  document.getElementById('reject-btn')?.addEventListener('click',  () => submitReview('rejected'));
  document.getElementById('review-close')?.addEventListener('click',  () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-cancel')?.addEventListener('click', () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  document.getElementById('queue-filter-btn')?.addEventListener('click', () => loadQueue(1));
  document.getElementById('all-filter-btn')?.addEventListener('click',   () => loadAllExpenses(1));
});

window.loadQueue        = loadQueue;
window.loadAllExpenses  = loadAllExpenses;
window.openReviewModal  = openReviewModal;
