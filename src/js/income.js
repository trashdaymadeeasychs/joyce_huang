/* Income tab — monthly commission tracking */
'use strict';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const DEFAULT_ROWS_PER_MONTH = 6;

let incomeYear    = new Date().getFullYear();
let incomeRecords = [];   // flat array of all saved records for the year

/* ══════════════════════════════════════════════════
   LOAD & RENDER INCOME PAGE
══════════════════════════════════════════════════ */
async function loadIncomePage() {
  const summaryWrap = document.getElementById('income-summary-wrap');
  const contentWrap = document.getElementById('income-content-wrap');
  if (!contentWrap) return;

  // Build the year selector bar once (first visit)
  if (!document.getElementById('income-year')) {
    const now = new Date().getFullYear();
    let opts = '';
    for (let y = now; y >= now - 4; y--) {
      opts += `<option value="${y}"${y === now ? ' selected' : ''}>${y}</option>`;
    }
    contentWrap.innerHTML = `
      <div class="income-year-bar" style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:var(--text-muted)">Tax Year</label>
        <select id="income-year" onchange="loadIncomePage()">${opts}</select>
      </div>
      <div id="income-months-container"></div>
    `;
  }

  const yr = parseInt(document.getElementById('income-year')?.value) || incomeYear;
  incomeYear = yr;

  const container = document.getElementById('income-months-container');
  if (!container) return;

  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-hint)">Loading income data…</div>';
  if (summaryWrap) summaryWrap.innerHTML = '';

  try {
    const { records } = await API.getIncome({ year: yr });
    incomeRecords = records || [];
    renderIncomeSummary(summaryWrap);
    renderMonths(container);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">Failed to load income: ${App.escHtml(err.message)}</div>`;
  }
}

function renderIncomeSummary(el) {
  if (!el) return;
  const totalIncome = incomeRecords.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
  const totalGst    = incomeRecords.reduce((s, r) => s + (parseFloat(r.gst_hst_collected)  || 0), 0);
  el.innerHTML = `
    <div class="stat-grid income-summary-grid" style="margin-bottom:20px">
      <div class="stat-card green">
        <div class="stat-label">Total Commission Income</div>
        <div class="stat-value">${App.fmt(totalIncome)}</div>
        <div class="stat-sub">${incomeYear} · ${incomeRecords.length} entries</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">GST/HST Collected</div>
        <div class="stat-value">${App.fmt(totalGst)}</div>
        <div class="stat-sub">Remit to CRA if registered</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Tax Year</div>
        <div class="stat-value">${incomeYear}</div>
        <div class="stat-sub">Use the selector below to switch years</div>
      </div>
    </div>
  `;
}

function renderMonths(container) {
  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = [];
  incomeRecords.forEach(r => {
    const m = parseInt(r.month);
    if (m >= 1 && m <= 12) byMonth[m].push(r);
  });

  container.innerHTML = MONTHS.map((name, idx) => {
    const m        = idx + 1;
    const saved    = byMonth[m];
    const subtotal = saved.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
    return `
      <div class="card" style="margin-bottom:16px" id="income-month-${m}">
        <div class="card-header">
          <span class="card-title">${name} ${incomeYear}</span>
          <span style="font-size:13px;color:var(--text-muted)">
            Subtotal: <strong class="month-subtotal" style="color:var(--green)">${App.fmt(subtotal)}</strong>
          </span>
        </div>
        <div style="overflow-x:auto">
          <table class="income-table">
            <thead><tr>
              <th data-label="Date">Date Received</th>
              <th data-label="Client/Property">Client / Property</th>
              <th data-label="Brokerage">Brokerage / Source</th>
              <th data-label="Commission">Commission (CAD)</th>
              <th data-label="GST/HST">GST/HST Collected</th>
              <th data-label="Notes">Notes</th>
              <th style="width:80px"></th>
            </tr></thead>
            <tbody id="income-tbody-${m}">
              ${renderIncomeRows(m, saved)}
            </tbody>
          </table>
        </div>
        <div style="padding:8px 12px;border-top:1px solid var(--border)">
          <button class="btn btn-sm" onclick="addIncomeRow(${m})">+ Add Row</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderIncomeRows(month, saved) {
  const blanks = Math.max(0, DEFAULT_ROWS_PER_MONTH - saved.length);
  let html = saved.map(r => buildSavedRow(r)).join('');
  for (let i = 0; i < blanks; i++) html += buildBlankRow(month);
  return html;
}

function buildSavedRow(r) {
  return `
    <tr id="income-row-${r.id}" data-income-id="${r.id}" data-month="${r.month}">
      <td data-label="Date"><input type="date" class="income-input" value="${(r.income_date||'').slice(0,10)}" onchange="markDirty(${r.id})"></td>
      <td data-label="Client/Property"><input type="text" class="income-input" placeholder="Client or property" value="${App.escHtml(r.client_or_property||'')}" onchange="markDirty(${r.id})"></td>
      <td data-label="Brokerage"><input type="text" class="income-input" placeholder="Brokerage / source" value="${App.escHtml(r.brokerage_source||'')}" onchange="markDirty(${r.id})"></td>
      <td data-label="Commission"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" value="${parseFloat(r.commission_amount)||''}" onchange="markDirty(${r.id})"></td>
      <td data-label="GST/HST"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" value="${parseFloat(r.gst_hst_collected)||''}" onchange="markDirty(${r.id})"></td>
      <td data-label="Notes"><input type="text" class="income-input" placeholder="Notes" value="${App.escHtml(r.notes||'')}" onchange="markDirty(${r.id})"></td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-approve" id="income-save-${r.id}" onclick="saveIncomeRow(${r.id})" style="display:none">Save</button>
        <button class="btn btn-sm btn-reject"  onclick="deleteIncomeRow(${r.id})" title="Delete">✕</button>
      </td>
    </tr>
  `;
}

function buildBlankRow(month) {
  const tempId = `new_${month}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  return `
    <tr id="income-row-${tempId}" data-income-id="${tempId}" data-month="${month}">
      <td data-label="Date"><input type="date" class="income-input" oninput="showNewRowSave('${tempId}')"></td>
      <td data-label="Client/Property"><input type="text" class="income-input" placeholder="Client or property" oninput="showNewRowSave('${tempId}')"></td>
      <td data-label="Brokerage"><input type="text" class="income-input" placeholder="Brokerage / source" oninput="showNewRowSave('${tempId}')"></td>
      <td data-label="Commission"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
      <td data-label="GST/HST"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
      <td data-label="Notes"><input type="text" class="income-input" placeholder="Notes" oninput="showNewRowSave('${tempId}')"></td>
      <td>
        <button class="btn btn-sm btn-approve" id="income-save-${tempId}" onclick="saveNewIncomeRow('${tempId}',${month})" style="display:none">Save</button>
      </td>
    </tr>
  `;
}

/* ── Row helpers ─────────────────────────────────────── */

function getRowData(rowEl) {
  const inputs = rowEl.querySelectorAll('.income-input');
  return {
    income_date:        inputs[0]?.value || null,
    client_or_property: inputs[1]?.value.trim() || null,
    brokerage_source:   inputs[2]?.value.trim() || null,
    commission_amount:  parseFloat(inputs[3]?.value) || 0,
    gst_hst_collected:  parseFloat(inputs[4]?.value) || 0,
    notes:              inputs[5]?.value.trim() || null,
  };
}

function markDirty(incomeId) {
  const saveBtn = document.getElementById(`income-save-${incomeId}`);
  if (saveBtn) saveBtn.style.display = '';
}

function showNewRowSave(tempId) {
  const saveBtn = document.getElementById(`income-save-${tempId}`);
  const rowEl   = document.getElementById(`income-row-${tempId}`);
  if (!saveBtn || !rowEl) return;
  const data = getRowData(rowEl);
  saveBtn.style.display = data.commission_amount > 0 ? '' : 'none';
}

/* ── Save existing row ──────────────────────────────── */
async function saveIncomeRow(incomeId) {
  const rowEl   = document.getElementById(`income-row-${incomeId}`);
  const saveBtn = document.getElementById(`income-save-${incomeId}`);
  if (!rowEl) return;
  const data = getRowData(rowEl);

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
  try {
    await API.updateIncome({ income_id: incomeId, ...data });
    if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    // Update local cache
    const idx = incomeRecords.findIndex(r => r.id === incomeId);
    if (idx !== -1) Object.assign(incomeRecords[idx], data);
    refreshMonthSubtotal(parseInt(rowEl.dataset.month));
    renderIncomeSummary(document.getElementById('income-summary-wrap'));
  } catch (err) {
    alert('Failed to save: ' + err.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

/* ── Save new blank row ─────────────────────────────── */
async function saveNewIncomeRow(tempId, month) {
  const rowEl   = document.getElementById(`income-row-${tempId}`);
  const saveBtn = document.getElementById(`income-save-${tempId}`);
  if (!rowEl) return;
  const data = getRowData(rowEl);
  if (!data.commission_amount) { alert('Please enter a commission amount.'); return; }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
  try {
    const { record } = await API.createIncome({ month, tax_year: incomeYear, ...data });
    incomeRecords.push(record);
    rowEl.outerHTML = buildSavedRow(record);
    refreshMonthSubtotal(month);
    renderIncomeSummary(document.getElementById('income-summary-wrap'));
  } catch (err) {
    alert('Failed to save: ' + err.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

/* ── Delete row ─────────────────────────────────────── */
async function deleteIncomeRow(incomeId) {
  if (!confirm('Delete this income entry?')) return;
  const rowEl = document.getElementById(`income-row-${incomeId}`);
  const month = rowEl ? parseInt(rowEl.dataset.month) : null;
  try {
    await API.deleteIncome(incomeId);
    incomeRecords = incomeRecords.filter(r => r.id !== incomeId);
    if (rowEl) rowEl.remove();
    if (month) refreshMonthSubtotal(month);
    renderIncomeSummary(document.getElementById('income-summary-wrap'));
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

/* ── Add a new blank row to a month ─────────────────── */
function addIncomeRow(month) {
  const tbody = document.getElementById(`income-tbody-${month}`);
  if (!tbody) return;
  const tempId = `new_${month}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const tr = document.createElement('tr');
  tr.id                = `income-row-${tempId}`;
  tr.dataset.incomeId  = tempId;
  tr.dataset.month     = month;
  tr.innerHTML = `
    <td data-label="Date"><input type="date" class="income-input" oninput="showNewRowSave('${tempId}')"></td>
    <td data-label="Client/Property"><input type="text" class="income-input" placeholder="Client or property" oninput="showNewRowSave('${tempId}')"></td>
    <td data-label="Brokerage"><input type="text" class="income-input" placeholder="Brokerage / source" oninput="showNewRowSave('${tempId}')"></td>
    <td data-label="Commission"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
    <td data-label="GST/HST"><input type="number" class="income-input amount-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
    <td data-label="Notes"><input type="text" class="income-input" placeholder="Notes" oninput="showNewRowSave('${tempId}')"></td>
    <td><button class="btn btn-sm btn-approve" id="income-save-${tempId}" onclick="saveNewIncomeRow('${tempId}',${month})" style="display:none">Save</button></td>
  `;
  tbody.appendChild(tr);
}

/* ── Refresh a single month's subtotal display ────── */
function refreshMonthSubtotal(month) {
  if (!month) return;
  const saved    = incomeRecords.filter(r => parseInt(r.month) === month);
  const subtotal = saved.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
  const section  = document.getElementById(`income-month-${month}`);
  if (!section) return;
  const sub = section.querySelector('.month-subtotal');
  if (sub) sub.textContent = App.fmt(subtotal);
}

/* ── Expose globals ─────────────────────────────────── */
window.loadIncomePage   = loadIncomePage;
window.addIncomeRow     = addIncomeRow;
window.saveIncomeRow    = saveIncomeRow;
window.saveNewIncomeRow = saveNewIncomeRow;
window.deleteIncomeRow  = deleteIncomeRow;
window.markDirty        = markDirty;
window.showNewRowSave   = showNewRowSave;
