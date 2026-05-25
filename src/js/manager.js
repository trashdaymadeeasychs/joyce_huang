/* Manager views: pending queue, all expenses, charts, import */
'use strict';

/* Canadian realtor main categories (flat list for dropdowns & import guessing) */
const CATEGORIES = [
  'Vehicle', 'Marketing', 'Professional', 'Technology',
  'Office', 'Travel', 'Client Relations', 'Capital Assets',
];

let queuePage        = 1;
let allExpPage       = 1;
let chartMgrMonthly  = null;
let chartMgrCategory = null;
let cachedUsers      = [];

async function populateEmployeeFilters() {
  try {
    const { users } = await API.getUsers();
    cachedUsers = users;
    ['#queue-emp','#all-emp'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const saved = el.value;
      while (el.options.length > 1) el.remove(1);
      users.forEach(u => el.add(new Option(`${u.full_name} (${u.email})`, u.id)));
      if (saved) el.value = saved;
    });
  } catch {}
}

async function loadMgrStats() {
  const grid = document.getElementById('mgr-stat-grid');
  if (!grid) return;
  try {
    const data = await API.getDashboard();
    const st   = data.status_totals || {};
    const a    = st.approved || { count: 0, total: 0 };
    const p    = st.pending  || { count: 0, total: 0 };
    const r    = st.rejected || { count: 0, total: 0 };
    const inc  = data.income_total || 0;
    grid.innerHTML = `
      <div class="stat-card gold"><div class="stat-label">Pending Review</div><div class="stat-value">${p.count}</div><div class="stat-sub">${App.fmt(p.total)} awaiting</div></div>
      <div class="stat-card green"><div class="stat-label">Approved (YTD)</div><div class="stat-value">${App.fmt(a.total)}</div><div class="stat-sub">${a.count} expenses</div></div>
      <div class="stat-card blue"><div class="stat-label">Income (YTD)</div><div class="stat-value">${App.fmt(inc)}</div><div class="stat-sub">Commission income</div></div>
      <div class="stat-card"><div class="stat-label">Total Submitted (YTD)</div><div class="stat-value">${a.count + p.count + r.count}</div><div class="stat-sub">${App.fmt(a.total + p.total + r.total)}</div></div>
    `;
  } catch {}
}

async function loadQueue(page = 1) {
  queuePage = page;
  await loadMgrStats();
  await populateEmployeeFilters();
  const tbody     = document.getElementById('queue-tbody');
  const emptyEl   = document.getElementById('queue-empty');
  const tableWrap = document.getElementById('queue-table-wrap');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="7">Loading...</td></tr>';
  const params = {
    status: 'pending', page, limit: 20,
    user_id:  document.getElementById('queue-emp')?.value  || '',
    category: document.getElementById('queue-cat')?.value  || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  try {
    const { expenses, pagination } = await API.getExpenses(params);
    if (!expenses.length) {
      emptyEl.style.display = 'block'; tableWrap.style.display = 'none';
      document.getElementById('queue-pager').innerHTML = ''; return;
    }
    emptyEl.style.display = 'none'; tableWrap.style.display = '';
    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.fmtDate(e.expense_date)}</td>
        <td><strong>${App.escHtml(e.employee_name)}</strong><div style="font-size:11px;color:var(--text-hint)">${App.escHtml(e.employee_email)}</div></td>
        <td>${App.escHtml(e.category)}${e.subcategory ? `<div style="font-size:11px;color:var(--text-muted)">${App.escHtml(e.subcategory)}</div>` : ''}</td>
        <td class="amount">${App.fmt(e.amount)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escHtml(e.business_purpose || e.description)}">${App.escHtml(e.business_purpose || e.description) || '—'}</td>
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
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="10">Loading...</td></tr>';
  const params = {
    page, limit: 25,
    status:    document.getElementById('all-status')?.value  || '',
    user_id:   document.getElementById('all-emp')?.value     || '',
    category:  document.getElementById('all-cat')?.value     || '',
    date_from: document.getElementById('all-from')?.value    || '',
    date_to:   document.getElementById('all-to')?.value      || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  try {
    const { expenses, pagination } = await API.getExpenses(params);
    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📁</div><p>No expenses found.</p></div></td></tr>';
      document.getElementById('all-pager').innerHTML = '';
    } else {
      tbody.innerHTML = expenses.map(e => `
        <tr>
          <td>${App.fmtDate(e.expense_date)}</td>
          <td>${App.escHtml(e.employee_name)}</td>
          <td>${App.escHtml(e.category)}${e.subcategory ? `<br><span style="font-size:11px;color:var(--text-muted)">${App.escHtml(e.subcategory)}</span>` : ''}</td>
          <td class="amount">${App.fmt(e.amount)}</td>
          <td style="font-size:12px">${e.gst_hst_amount > 0 ? App.fmt(e.gst_hst_amount) : '—'}</td>
          <td style="color:var(--green);font-weight:600;font-size:12px">${App.fmt(e.deductible_amount || e.amount)}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escHtml(e.business_purpose || e.description)}">${App.escHtml(e.business_purpose || e.description) || '—'}</td>
          <td>${App.statusBadge(e.status)}</td>
          <td>${App.receiptLink(e.receipt_url, e.receipt_storage)}</td>
          <td><button class="btn btn-sm" onclick="openReviewModal(${e.id}, ${App.escHtml(JSON.stringify(e))})">Edit</button></td>
        </tr>
      `).join('');
      App.buildPager('all-pager', pagination, loadAllExpenses);
    }
    loadMgrCharts();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="alert alert-error">Failed: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

async function loadMgrCharts() {
  try {
    const data   = await API.getDashboard();
    const trend  = data.monthly_trend || [];
    const cats   = data.category_totals || [];
    const labels = trend.map(r => r.month_label);
    const COLORS = ['#1a2a4a','#e8a020','#1a7a4a','#c94040','#3b7dd8','#7c3aed','#0891b2','#64748b'];
    const mCtx = document.getElementById('chart-mgr-monthly');
    if (chartMgrMonthly) chartMgrMonthly.destroy();
    chartMgrMonthly = new Chart(mCtx, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Approved', data: trend.map(r => r.approved), backgroundColor: 'rgba(26,122,74,0.75)', borderRadius: 4 },
        { label: 'Pending',  data: trend.map(r => r.pending),  backgroundColor: 'rgba(232,160,32,0.7)', borderRadius: 4 },
        { label: 'Rejected', data: trend.map(r => r.rejected), backgroundColor: 'rgba(201,64,64,0.65)', borderRadius: 4 },
      ]},
      options: { responsive: true, plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 11 } } }, y: { stacked: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString('en-CA') } } } },
    });
    const cCtx = document.getElementById('chart-mgr-category');
    if (chartMgrCategory) chartMgrCategory.destroy();
    chartMgrCategory = new Chart(cCtx, {
      type: 'doughnut',
      data: { labels: cats.map(c => c.category), datasets: [{ data: cats.map(c => c.total), backgroundColor: COLORS, borderWidth: 2 }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${App.fmt(ctx.raw)}` } } } },
    });
  } catch {}
}

/* ── Gmail Sync ──────────────────────────────────────── */
async function syncGmail() {
  const btn = document.getElementById('sync-gmail-btn');
  if (!btn) return;
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Syncing...';
  const statusEl = document.getElementById('sync-gmail-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }
  try {
    const result = await API.syncGmail();
    if (statusEl) {
      statusEl.textContent = result.message || 'Sync complete.';
      statusEl.className = 'alert alert-success'; statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 6000);
    }
    if (result.created > 0) { loadQueue(1); App.refreshPendingBadge(); }
  } catch (err) {
    if (statusEl) { statusEl.textContent = 'Sync failed: ' + err.message; statusEl.className = 'alert alert-error'; statusEl.style.display = 'block'; }
  } finally { btn.disabled = false; btn.textContent = orig; }
}

/* ── Gmail Receipt Viewer ───────────────────────────── */
async function loadGmailReceipt(messageId, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Loading receipt...</span>';
  try {
    const data = await API.getGmailReceipt(messageId);
    if (data.type === 'attachment') {
      if (data.mimeType === 'application/pdf') {
        el.innerHTML = `<a href="data:application/pdf;base64,${data.data}" download="${App.escHtml(data.filename)}" class="btn btn-sm">Download PDF Receipt</a>`;
      } else {
        el.innerHTML = `<img src="data:${data.mimeType};base64,${data.data}" style="max-width:100%;max-height:320px;border-radius:6px;border:1px solid var(--border);margin-top:4px" alt="Receipt">`;
      }
    } else if (data.type === 'html') {
      el.innerHTML = `<iframe srcdoc="${App.escHtml(data.content)}" style="width:100%;height:280px;border:1px solid var(--border);border-radius:6px;margin-top:4px" sandbox="allow-same-origin"></iframe>`;
    } else {
      el.innerHTML = `<pre style="font-size:11px;max-height:200px;overflow:auto;background:var(--surface);padding:8px;border-radius:6px;margin-top:4px;white-space:pre-wrap">${App.escHtml(data.content)}</pre>`;
    }
  } catch (err) {
    el.innerHTML = `<span style="color:var(--text-muted);font-size:12px">Could not load receipt: ${App.escHtml(err.message)}</span>`;
  }
}

let pickerExpenseId = null, pickerSelectedMsgId = null;

async function openGmailPicker(expenseId) {
  pickerExpenseId = expenseId; pickerSelectedMsgId = null;
  const picker = document.getElementById('gmail-picker');
  const list   = document.getElementById('gmail-picker-list');
  if (!picker || !list) return;
  picker.style.display = 'block';
  list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">Loading Gmail receipts...</div>';
  try {
    const { receipts } = await API.searchGmailReceipts();
    if (!receipts || !receipts.length) { list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">No Gmail receipts found.</div>'; return; }
    list.innerHTML = receipts.map(r => `
      <div class="gmail-receipt-item" data-msg-id="${App.escHtml(r.messageId)}" onclick="selectGmailReceipt('${App.escHtml(r.messageId)}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="font-weight:600;font-size:13px">${App.escHtml(r.sender)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${App.escHtml(r.subject)}</div>
        ${r.amountGuess ? `<div style="font-size:12px;font-weight:600;color:var(--primary)">${App.fmt(r.amountGuess)}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="padding:12px;color:var(--error);font-size:13px">Failed: ${App.escHtml(err.message)}</div>`;
  }
}

function selectGmailReceipt(messageId) {
  pickerSelectedMsgId = messageId;
  document.querySelectorAll('.gmail-receipt-item').forEach(el => {
    el.style.background = el.dataset.msgId === messageId ? 'var(--navy-light)' : '';
  });
  document.getElementById('gmail-picker-confirm').disabled = false;
}

async function confirmGmailLink() {
  if (!pickerSelectedMsgId || !pickerExpenseId) return;
  const btn = document.getElementById('gmail-picker-confirm');
  btn.disabled = true; btn.textContent = 'Linking...';
  try {
    await API.updateExpense({ expense_id: pickerExpenseId, gmail_message_id: pickerSelectedMsgId });
    document.getElementById('gmail-picker').style.display = 'none';
    const receiptEl = document.getElementById('modal-receipt-display');
    if (receiptEl) loadGmailReceipt(pickerSelectedMsgId, 'modal-receipt-display');
  } catch { btn.disabled = false; btn.textContent = 'Link Receipt'; }
}

/* ── Review Modal ───────────────────────────────────── */
let reviewingExpenseId = null;

function buildUserOptions() {
  return cachedUsers.map(u => `<option value="${u.id}">${App.escHtml(u.full_name)} (${App.escHtml(u.email)})</option>`).join('');
}

function buildCategorySelect(currentCategory) {
  const opts = CATEGORIES.map(c =>
    `<option value="${App.escHtml(c)}"${c === currentCategory ? ' selected' : ''}>${App.escHtml(c)}</option>`
  ).join('');
  return `<select id="review-category" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;min-width:180px">${opts}</select>`;
}

function buildReceiptSection(e) {
  if (e.gmail_message_id) {
    return `<div id="modal-receipt-display" style="margin-top:4px"><span style="color:var(--text-muted);font-size:12px">Loading...</span></div>`;
  }
  if (e.receipt_url) return App.receiptLink(e.receipt_url, e.receipt_storage);
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="color:var(--text-muted);font-size:12px">No receipt.</span>
        <button class="btn btn-sm" onclick="openGmailPicker(${e.id})">Search Gmail</button>
      </div>
      <div id="modal-upload-zone" ondragover="event.preventDefault();this.style.borderColor='var(--primary)'" ondragleave="this.style.borderColor='var(--border)'" ondrop="handleModalReceiptDrop(event,${e.id})" onclick="document.getElementById('modal-upload-input').click()" style="border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;font-size:12px;color:var(--text-muted)">
        Drop PDF or image here, or click to browse
        <input type="file" id="modal-upload-input" accept="image/*,application/pdf" style="display:none" onchange="handleModalReceiptDrop({dataTransfer:{files:this.files}},${e.id})">
      </div>
      <div id="modal-upload-status"></div>
    </div>
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
  reviewingExpenseId = expenseId; pickerExpenseId = expenseId;
  const e = typeof expense === 'string' ? JSON.parse(expense) : expense;
  const isUnknown = !e.user_id;
  const employeeField = isUnknown
    ? `<select id="review-assign-user" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;"><option value="">— Select user —</option>${buildUserOptions()}</select>`
    : `${App.escHtml(e.employee_name)} <span style="color:var(--text-hint);font-size:11px">${App.escHtml(e.employee_email)}</span>`;

  document.getElementById('review-modal-body').innerHTML = `
    <div class="modal-detail">
      <span class="lbl">User</span><span>${employeeField}</span>
      <span class="lbl">Date</span><span><input type="date" id="review-date" value="${(e.expense_date||'').slice(0,10)}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px"></span>
      <span class="lbl">Category</span><span>${buildCategorySelect(e.category)}</span>
      <span class="lbl">Subcategory</span><span style="font-size:13px">${App.escHtml(e.subcategory)||'—'}</span>
      <span class="lbl">Vendor</span><span style="font-size:13px">${App.escHtml(e.vendor)||'—'}</span>
      <span class="lbl">Amount</span><span class="amount">${App.fmt(e.amount)}</span>
      <span class="lbl">GST/HST</span><span style="font-size:13px">${e.gst_hst_amount > 0 ? App.fmt(e.gst_hst_amount) : '—'}</span>
      <span class="lbl">Deductible</span><span style="color:var(--green);font-weight:600">${App.fmt(e.deductible_amount||e.amount)} (${e.deductible_pct||100}%)</span>
      <span class="lbl">Business Purpose</span><span><textarea id="review-description" rows="2" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;resize:vertical">${App.escHtml(e.business_purpose||e.description)||''}</textarea></span>
      <span class="lbl">Client / Property</span><span style="font-size:13px">${App.escHtml(e.client_property)||'—'}</span>
      <span class="lbl">Province</span><span style="font-size:13px">${App.escHtml(e.province)||'—'}</span>
      <span class="lbl">Submitted</span><span>${App.fmtDate(e.created_at)}</span>
      <span class="lbl" style="align-self:flex-start;padding-top:4px">Receipt</span><span>${buildReceiptSection(e)}</span>
    </div>
  `;
  document.getElementById('review-notes').value = '';
  document.getElementById('review-error').style.display = 'none';
  document.getElementById('approve-btn').disabled = false;
  document.getElementById('reject-btn').disabled  = false;
  document.getElementById('delete-expense-btn').disabled = false;
  document.getElementById('review-modal').style.display = 'flex';
  if (e.gmail_message_id) loadGmailReceipt(e.gmail_message_id, 'modal-receipt-display');
}

async function submitReview(status) {
  const notes        = document.getElementById('review-notes').value.trim();
  const errEl        = document.getElementById('review-error');
  const assignSelect = document.getElementById('review-assign-user');
  const userId       = assignSelect ? (parseInt(assignSelect.value,10)||null) : null;
  const category     = document.getElementById('review-category')?.value || null;
  const description  = document.getElementById('review-description')?.value.trim() || null;
  const expenseDate  = document.getElementById('review-date')?.value || null;

  if (status === 'rejected' && !notes) { errEl.textContent = 'Please provide a reason for rejection.'; errEl.style.display = 'block'; return; }
  if (assignSelect && !userId) { errEl.textContent = 'Please select a user.'; errEl.style.display = 'block'; return; }

  const approveBtn = document.getElementById('approve-btn');
  const rejectBtn  = document.getElementById('reject-btn');
  approveBtn.disabled = rejectBtn.disabled = true;
  try {
    await API.updateExpenseStatus({ expense_id: reviewingExpenseId, status, review_notes: notes||null, user_id: userId, category, description, expense_date: expenseDate });
    approveBtn.disabled = rejectBtn.disabled = false;
    document.getElementById('review-modal').style.display = 'none';
    loadQueue(queuePage);
    App.refreshPendingBadge();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to update status.'; errEl.style.display = 'block';
    approveBtn.disabled = rejectBtn.disabled = false;
  }
}

/* ── CSV Import ─────────────────────────────────────── */
function guessCategory(vendor) {
  const v = (vendor || '').toLowerCase();
  if (/perplexity|anthropic|openai|claude|canva|adobe|figma|notion|slack|zoom|microsoft|google|zoom|crm|software|app|saas/.test(v)) return 'Technology';
  if (/restaurant|cafe|doordash|ubereats|starbucks|mcdonalds|bar|sushi|pizza|grill|diner|coffee|chipotle|panera|client meal/.test(v)) return 'Client Relations';
  if (/fuel|gas|shell|exxon|chevron|bp|petro|esso|pioneer|speedway/.test(v)) return 'Vehicle';
  if (/autozone|midas|jiffy|tire|mechanic|oil change|vehicle|car wash/.test(v)) return 'Vehicle';
  if (/facebook|instagram|linkedin|google ads|mailchimp|marketing|advertising|photo|signs/.test(v)) return 'Marketing';
  if (/amazon|staples|office depot|costco|fedex|ups|usps|postage|supplies/.test(v)) return 'Office';
  if (/realtor|mls|board|brokerage|crea|orea|licensing|cpa|accountant|lawyer|legal/.test(v)) return 'Professional';
  if (/airfare|hotel|westin|marriott|hilton|via rail|uber|lyft|parking|conference/.test(v)) return 'Travel';
  return 'Office';
}

function parseRelayCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const header   = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  const idxDate  = header.indexOf('Date');
  const idxPayee = header.indexOf('Payee');
  const idxType  = header.indexOf('Transaction Type');
  const idxAmt   = header.indexOf('Amount');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g) || lines[i].split(',');
    const clean = cols.map(c => c.trim().replace(/^"|"$/g,''));
    const txType = clean[idxType] || '';
    const amtStr = (clean[idxAmt]||'').replace(/[^0-9.\-]/g,'');
    const amount = parseFloat(amtStr);
    if (!txType.toLowerCase().includes('spend')) continue;
    if (isNaN(amount) || amount >= 0) continue;
    const rawDate = clean[idxDate] || '';
    const parts   = rawDate.split('/');
    let expenseDate = rawDate;
    if (parts.length === 3) {
      const [m, d, y] = parts;
      expenseDate = `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    const payee    = clean[idxPayee] || 'Unknown';
    const category = guessCategory(payee);
    rows.push({ expense_date: expenseDate, amount: Math.abs(amount), category, business_purpose: payee });
  }
  return rows;
}

function initImportView() {
  const dropzone  = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('import-file-input');
  const preview   = document.getElementById('import-preview');
  const importBtn = document.getElementById('import-confirm-btn');
  const statusEl  = document.getElementById('import-status');
  let parsedRows  = [];
  if (!dropzone) return;

  function handleFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      statusEl.textContent = 'Please upload a CSV file.'; statusEl.className = 'alert alert-error'; statusEl.style.display = 'block'; return;
    }
    const reader = new FileReader();
    reader.onload = (e) => { parsedRows = parseRelayCSV(e.target.result); renderPreview(parsedRows); };
    reader.readAsText(file);
  }

  function renderPreview(rows) {
    statusEl.style.display = 'none';
    if (!rows.length) {
      preview.innerHTML = '<p style="color:var(--text-muted);padding:16px">No spend rows found. Make sure you\'re uploading a Relay bank statement CSV.</p>';
      importBtn.style.display = 'none'; return;
    }
    preview.innerHTML = `
      <p style="margin-bottom:8px;font-size:13px;color:var(--text-muted)">${rows.length} expense(s) found:</p>
      <table>
        <thead><tr><th>Date</th><th>Payee / Business Purpose</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr>
            <td>${App.escHtml(r.expense_date)}</td>
            <td>${App.escHtml(r.business_purpose)}</td>
            <td><select onchange="updateImportCategory(${i},this.value)" style="font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:4px">
              ${CATEGORIES.map(c => `<option value="${App.escHtml(c)}"${c===r.category?' selected':''}>${App.escHtml(c)}</option>`).join('')}
            </select></td>
            <td class="amount">${App.fmt(r.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
    importBtn.style.display = 'inline-block';
  }

  window.updateImportCategory = (idx, val) => { if (parsedRows[idx]) parsedRows[idx].category = val; };

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  importBtn.addEventListener('click', async () => {
    if (!parsedRows.length) return;
    importBtn.disabled = true; importBtn.textContent = 'Importing...';
    try {
      const result = await API.importExpenses(parsedRows);
      statusEl.textContent = result.message || 'Import complete.'; statusEl.className = 'alert alert-success'; statusEl.style.display = 'block';
      preview.innerHTML = ''; importBtn.style.display = 'none'; parsedRows = [];
      App.refreshPendingBadge();
    } catch (err) {
      statusEl.textContent = 'Import failed: ' + err.message; statusEl.className = 'alert alert-error'; statusEl.style.display = 'block';
      importBtn.disabled = false; importBtn.textContent = 'Import Expenses';
    }
  });
}

/* ── Modal receipt upload ───────────────────────────── */
async function handleModalReceiptDrop(event, expenseId) {
  event.preventDefault && event.preventDefault();
  const zone = document.getElementById('modal-upload-zone');
  if (zone) zone.style.borderColor = 'var(--border)';
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const statusEl = document.getElementById('modal-upload-status');
  if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.style.color = 'var(--text-muted)'; }
  try {
    const result = await API.uploadReceipt(file, expenseId);
    if (statusEl) statusEl.textContent = '';
    const z = document.getElementById('modal-upload-zone');
    if (z) {
      if (file.type.startsWith('image/')) {
        z.innerHTML = `<img src="${App.escHtml(result.receipt_url||result.url||'')}" style="max-width:100%;max-height:200px;border-radius:6px">`;
      } else {
        z.innerHTML = `<span style="font-size:12px;color:var(--success)">✓ Receipt uploaded: ${App.escHtml(file.name)}</span>`;
      }
    }
  } catch (err) {
    if (statusEl) { statusEl.textContent = 'Upload failed: ' + err.message; statusEl.style.color = 'var(--error)'; }
  }
}

async function deleteExpense() {
  if (!reviewingExpenseId) return;
  if (!confirm('Permanently delete this expense?')) return;
  const btn = document.getElementById('delete-expense-btn');
  btn.disabled = true;
  try {
    await API.deleteExpense(reviewingExpenseId);
    document.getElementById('review-modal').style.display = 'none';
    loadQueue(queuePage);
    App.refreshPendingBadge();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
    btn.disabled = false;
  }
}

/* ── Event listeners ────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('approve-btn')?.addEventListener('click', () => submitReview('approved'));
  document.getElementById('reject-btn')?.addEventListener('click',  () => submitReview('rejected'));
  document.getElementById('delete-expense-btn')?.addEventListener('click', deleteExpense);
  document.getElementById('review-close')?.addEventListener('click',  () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-cancel')?.addEventListener('click', () => { document.getElementById('review-modal').style.display = 'none'; });
  document.getElementById('review-modal')?.addEventListener('click',  (e) => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });
  document.getElementById('queue-filter-btn')?.addEventListener('click', () => loadQueue(1));
  document.getElementById('all-filter-btn')?.addEventListener('click', () => loadAllExpenses(1));
  document.getElementById('sync-gmail-btn')?.addEventListener('click', syncGmail);
});

window.loadQueue         = loadQueue;
window.loadAllExpenses   = loadAllExpenses;
window.openReviewModal   = openReviewModal;
window.openGmailPicker   = openGmailPicker;
window.selectGmailReceipt= selectGmailReceipt;
window.confirmGmailLink  = confirmGmailLink;
window.initImportView    = initImportView;
