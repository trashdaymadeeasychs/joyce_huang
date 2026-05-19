/* Manager views: pending queue, all expenses, charts */
'use strict';

let queuePage   = 1;
let allExpPage  = 1;
let chartMgrMonthly  = null;
let chartMgrCategory = null;
let cachedUsers = [];

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
      users.forEach(u => { const opt = new Option(`${u.full_name} (${u.email})`, u.id); el.add(opt); });
      if (saved) el.value = saved;
    });
  } catch {}
}

async function loadMgrStats() {
  const grid = document.getElementById('mgr-stat-grid');
  if (!grid) return;
  try {
    const data = await API.getDashboard();
    const st = data.status_totals || {};
    const approved = st.approved || { count: 0, total: 0 };
    const pending  = st.pending  || { count: 0, total: 0 };
    const rejected = st.rejected || { count: 0, total: 0 };
    grid.innerHTML = `
      <div class="stat-card gold"><div class="stat-label">Pending Review</div><div class="stat-value">${pending.count}</div><div class="stat-sub">${App.fmt(pending.total)} awaiting</div></div>
      <div class="stat-card green"><div class="stat-label">Approved (YTD)</div><div class="stat-value">${App.fmt(approved.total)}</div><div class="stat-sub">${approved.count} expenses</div></div>
      <div class="stat-card red"><div class="stat-label">Rejected (YTD)</div><div class="stat-value">${rejected.count}</div><div class="stat-sub">${App.fmt(rejected.total)}</div></div>
      <div class="stat-card blue"><div class="stat-label">Total Submitted (YTD)</div><div class="stat-value">${approved.count + pending.count + rejected.count}</div><div class="stat-sub">${App.fmt(approved.total + pending.total + rejected.total)}</div></div>
    `;
  } catch {}
}

async function loadQueue(page = 1) {
  queuePage = page;
  await loadMgrStats();
  await populateEmployeeFilters();
  const tbody = document.getElementById('queue-tbody');
  const emptyEl = document.getElementById('queue-empty');
  const tableWrap = document.getElementById('queue-table-wrap');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="7">Loading...</td></tr>';
  const params = { status: 'pending', page, limit: 20, user_id: document.getElementById('queue-emp')?.value || '', category: document.getElementById('queue-cat')?.value || '' };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  try {
    const { expenses, pagination } = await API.getExpenses(params);
    if (!expenses.length) { emptyEl.style.display = 'block'; tableWrap.style.display = 'none'; document.getElementById('queue-pager').innerHTML = ''; return; }
    emptyEl.style.display = 'none'; tableWrap.style.display = '';
    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.fmtDate(e.expense_date)}</td>
        <td><strong>${App.escHtml(e.employee_name)}</strong><div style="font-size:11px;color:var(--text-hint)">${App.escHtml(e.employee_email)}</div></td>
        <td>${App.escHtml(e.category)}</td>
        <td class="amount">${App.fmt(e.amount)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escHtml(e.description)}">${App.escHtml(e.description) || '—'}</td>
        <td>${e.gmail_message_id || e.receipt_url ? '<span style="color:var(--success)">📎 Yes</span>' : '—'}</td>
        <td><button class="btn btn-sm btn-approve" onclick="openReviewModal(${e.id}, ${App.escHtml(JSON.stringify(e))})">Review</button></td>
      </tr>
    `).join('');
    App.buildPager('queue-pager', pagination, loadQueue);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">Failed to load queue: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

async function loadAllExpenses(page = 1) {
  allExpPage = page;
  await populateEmployeeFilters();
  const tbody = document.getElementById('all-tbody');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="9">Loading...</td></tr>';
  const params = { page, limit: 25, status: document.getElementById('all-status')?.value || '', user_id: document.getElementById('all-emp')?.value || '', category: document.getElementById('all-cat')?.value || '', date_from: document.getElementById('all-from')?.value || '', date_to: document.getElementById('all-to')?.value || '' };
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
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escHtml(e.description)}">${App.escHtml(e.description) || '—'}</td>
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
    const data = await API.getDashboard();
    const trend = data.monthly_trend || [];
    const cats = data.category_totals || [];
    const labels = trend.map(r => r.month_label);
    const mCtx = document.getElementById('chart-mgr-monthly');
    if (chartMgrMonthly) chartMgrMonthly.destroy();
    chartMgrMonthly = new Chart(mCtx, { type: 'bar', data: { labels, datasets: [{ label: 'Approved', data: trend.map(r => r.approved), backgroundColor: 'rgba(26,122,74,0.75)', borderRadius: 4 }, { label: 'Pending', data: trend.map(r => r.pending), backgroundColor: 'rgba(232,160,32,0.7)', borderRadius: 4 }, { label: 'Rejected', data: trend.map(r => r.rejected), backgroundColor: 'rgba(201,64,64,0.65)', borderRadius: 4 }] }, options: { responsive: true, plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 11 } } }, y: { stacked: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() } } } } });
    const cCtx = document.getElementById('chart-mgr-category');
    if (chartMgrCategory) chartMgrCategory.destroy();
    const COLORS = ['#1a2a4a','#e8a020','#1a7a4a','#c94040','#3b7dd8','#7c3aed','#0891b2','#64748b'];
    chartMgrCategory = new Chart(cCtx, { type: 'doughnut', data: { labels: cats.map(c => c.category), datasets: [{ data: cats.map(c => c.total), backgroundColor: COLORS, borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}` } } } } });
  } catch {}
}

async function loadGmailReceipt(messageId, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Loading receipt...</span>';
  try {
    const data = await API.getGmailReceipt(messageId);
    if (data.type === 'attachment') {
      if (data.mimeType === 'application/pdf') {
        el.innerHTML = `<a href="data:application/pdf;base64,${data.data}" download="${App.escHtml(data.filename)}" class="btn btn-sm" style="margin-top:4px">Download PDF Receipt</a>`;
      } else {
        el.innerHTML = `<img src="data:${data.mimeType};base64,${data.data}" style="max-width:100%;max-height:320px;border-radius:6px;border:1px solid var(--border);margin-top:4px" alt="Receipt">`;
      }
    } else if (data.type === 'html') {
      el.innerHTML = `<iframe srcdoc="${App.escHtml(data.content)}" style="width:100%;height:280px;border:1px solid var(--border);border-radius:6px;margin-top:4px" sandbox="allow-same-origin"></iframe>`;
    } else if (data.type === 'text') {
      el.innerHTML = `<pre style="font-size:11px;max-height:200px;overflow:auto;background:var(--surface);padding:8px;border-radius:6px;margin-top:4px;white-space:pre-wrap">${App.escHtml(data.content)}</pre>`;
    } else {
      el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">No receipt image found in this email.</span>';
    }
  } catch (err) {
    el.innerHTML = `<span style="color:var(--text-muted);font-size:12px">Could not load receipt: ${App.escHtml(err.message)}</span>`;
  }
}

let pickerExpenseId = null;
let pickerSelectedMsgId = null;

async function openGmailPicker(expenseId) {
  pickerExpenseId = expenseId;
  pickerSelectedMsgId = null;
  const picker = document.getElementById('gmail-picker');
  const list = document.getElementById('gmail-picker-list');
  if (!picker || !list) return;
  picker.style.display = 'block';
  list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">Loading Gmail receipts...</div>';
  try {
    const { receipts } = await API.searchGmailReceipts();
    if (!receipts || !receipts.length) { list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">No Gmail receipts found.</div>'; return; }
    list.innerHTML = receipts.map(r => `
      <div class="gmail-receipt-item" data-msg-id="${App.escHtml(r.messageId)}" onclick="selectGmailReceipt('${App.escHtml(r.messageId)}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s">
        <div style="font-weight:600;font-size:13px">${App.escHtml(r.sender)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${App.escHtml(r.subject)}</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:2px">${App.escHtml(r.snippet)}</div>
        ${r.amountGuess ? `<div style="font-size:12px;font-weight:600;color:var(--primary);margin-top:3px">${App.fmt(r.amountGuess)}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="padding:12px;color:var(--error);font-size:13px">Failed to load: ${App.escHtml(err.message)}</div>`;
  }
}

function selectGmailReceipt(messageId) {
  pickerSelectedMsgId = messageId;
  document.querySelectorAll('.gmail-receipt-item').forEach(el => { el.style.background = el.dataset.msgId === messageId ? 'var(--surface-hover, #f0f4ff)' : ''; });
  document.getElementById('gmail-picker-confirm').disabled = false;
}

async function confirmGmailLink() {
  if (!pickerSelectedMsgId || !pickerExpenseId) return;
  const btn = document.getElementById('gmail-picker-confirm');
  btn.disabled = true; btn.textContent = 'Linking...';
  try {
    await API.updateExpenseStatus({ expense_id: pickerExpenseId, status: 'pending', review_notes: null, gmail_message_id: pickerSelectedMsgId });
    document.getElementById('gmail-picker').style.display = 'none';
    const receiptEl = document.getElementById('modal-receipt-display');
    if (receiptEl) loadGmailReceipt(pickerSelectedMsgId, 'modal-receipt-display');
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Link Receipt';
  }
}

let reviewingExpenseId = null;

function buildUserOptions() {
  return cachedUsers.map(u => `<option value="${u.id}">${App.escHtml(u.full_name)} (${App.escHtml(u.email)})</option>`).join('');
}

function buildReceiptSection(e) {
  if (e.gmail_message_id) {
    return `<div id="modal-receipt-display" style="margin-top:4px"><span style="color:var(--text-muted);font-size:12px">Loading...</span></div>`;
  }
  if (e.receipt_url) return App.receiptLink(e.receipt_url, e.receipt_storage);
  return `
    <span style="color:var(--text-muted);font-size:12px">No receipt attached.</span>
    <button class="btn btn-sm" style="margin-left:8px" onclick="openGmailPicker(${e.id})">Search Gmail</button>
    <div id="gmail-picker" style="display:none;margin-top:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:300px;overflow-y:auto">
      <div style="padding:8px 12px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600;font-size:13px">Select Gmail Receipt</span>
        <div>
          <button id="gmail-picker-confirm" class="btn btn-sm btn-approve" disabled onclick="confirmGmailLink()">Link Receipt</button>
          <button class="btn btn-sm" style="margin-left:4px" onclick="document.getElementById('gmail-picker').style.display='none'">Cancel</button>
        </div>
      </div>
      <div id="gmail-picker-list"></div>
    </div>
  `;
}

function openReviewModal(expenseId, expense) {
  reviewingExpenseId = expenseId;
  pickerExpenseId = expenseId;
  const e = typeof expense === 'string' ? JSON.parse(expense) : expense;
  const isUnknown = !e.user_id;
  const employeeField = isUnknown
    ? `<select id="review-assign-user" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;"><option value="">— Select employee —</option>${buildUserOptions()}</select>`
    : `${App.escHtml(e.employee_name)} <span style="color:var(--text-hint);font-size:11px">${App.escHtml(e.employee_email)}</span>`;
  document.getElementById('review-modal-body').innerHTML = `
    <div class="modal-detail">
      <span class="lbl">Employee</span><span>${employeeField}</span>
      <span class="lbl">Date</span><span>${App.fmtDate(e.expense_date)}</span>
      <span class="lbl">Category</span><span>${App.escHtml(e.category)}</span>
      <span class="lbl">Amount</span><span class="amount">${App.fmt(e.amount)}</span>
      <span class="lbl">Description</span><span>${App.escHtml(e.description) || '—'}</span>
      <span class="lbl">Submitted</span><span>${App.fmtDate(e.created_at)}</span>
      <span class="lbl" style="align-self:flex-start;padding-top:4px">Receipt</span><span>${buildReceiptSection(e)}</span>
    </div>
  `;
  document.getElementById('review-notes').value = '';
  document.getElementById('review-error').style.display = 'none';
  document.getElementById('review-modal').style.display = 'flex';
  if (e.gmail_message_id) loadGmailReceipt(e.gmail_message_id, 'modal-receipt-display');
}

async function submitReview(status) {
  const notes = document.getElementById('review-notes').value.trim();
  const errEl = document.getElementById('review-error');
  const assignSelect = document.getElementById('review-assign-user');
  const userId = assignSelect ? (parseInt(assignSelect.value, 10) || null) : null;
  if (status === 'rejected' && !notes) { errEl.textContent = 'Please provide a reason for rejection.'; errEl.style.display = 'block'; return; }
  if (assignSelect && !userId) { errEl.textContent = 'Please select an employee before approving or rejecting.'; errEl.style.display = 'block'; return; }
  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn = document.getElementById('reject-btn');
  approveBtn.disabled = rejectBtn.disabled = true;
  try {
    await API.updateExpenseStatus({ expense_id: reviewingExpenseId, status, review_notes: notes || null, user_id: userId });
    document.getElementById('review-modal').style.display = 'none';
    loadQueue(queuePage);
    App.refreshPendingBadge();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to update status.';
    errEl.style.display = 'block';
    approveBtn.disabled = rejectBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('approve-btn')?.addEventListener('click', () => submitReview('approved'));
  document.getElementById('reject-btn')?.addEventListener('click', () => submitReview('rejected'));
  document.getElementById('review-close')?.addEventListener('click', () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-cancel')?.addEventListener('click', () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-modal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });
  document.getElementById('queue-filter-btn')?.addEventListener('click', () => loadQueue(1));
  document.getElementById('all-filter-btn')?.addEventListener('click', () => loadAllExpenses(1));
});

window.loadQueue = loadQueue;
window.loadAllExpenses = loadAllExpenses;
window.openReviewModal = openReviewModal;
window.openGmailPicker = openGmailPicker;
window.selectGmailReceipt = selectGmailReceipt;
window.confirmGmailLink = confirmGmailLink;