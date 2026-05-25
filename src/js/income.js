/* Income tab — monthly commission tracking */
'use strict';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_ROWS_PER_MONTH = 6;

let incomeYear    = new Date().getFullYear();
let incomeRecords = [];   // flat array of all saved records for the year

/* ══════════════════════════════════════════════════
   LOAD & RENDER INCOME PAGE
══════════════════════════════════════════════════ */
async function loadIncomePage() {
  const yr = parseInt(document.getElementById('income-year')?.value) || incomeYear;
  incomeYear = yr;
  const container = document.getElementById('income-months-container');
  const summaryEl = document.getElementById('income-summary');
  if (!container) return;

  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-hint)">Loading income data…</div>';

  try {
    const { records } = await API.getIncome({ year: yr });
    incomeRecords = records || [];
    renderIncomeSummary(summaryEl);
    renderMonths(container);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">Failed to load income: ${App.escHtml(err.message)}</div>`;
  }
}

function renderIncomeSummary(el) {
  if (!el) return;
  const totalIncome = incomeRecords.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
  const totalGst    = incomeRecords.reduce((s, r) => s + (parseFloat(r.gst_hst_collected) || 0), 0);
  el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:8px">
      <div class="stat-card green">
        <div class="stat-label">Total Income (${incomeYear})</div>
        <div class="stat-value">${App.fmt(totalIncome)}</div>
        <div class="stat-sub">Commission income</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">GST/HST Collected</div>
        <div class="stat-value">${App.fmt(totalGst)}</div>
        <div class="stat-sub">Remit to CRA if registered</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Tax Year</div>
        <div class="stat-value">${incomeYear}</div>
        <div class="stat-sub">${incomeRecords.length} entries</div>
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
    const m       = idx + 1;
    const saved   = byMonth[m];
    const subtotal = saved.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
    return `
      <div class="card income-month-section" style="margin-bottom:16px" id="income-month-${m}">
        <div class="card-header">
          <span class="card-title">${name} ${incomeYear}</span>
          <span style="font-size:13px;color:var(--text-muted)">
            Subtotal: <strong style="color:var(--green)">${App.fmt(subtotal)}</strong>
          </span>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead><tr>
              <th style="min-width:110px">Date Received</th>
              <th style="min-width:160px">Client / Property</th>
              <th style="min-width:140px">Brokerage / Source</th>
              <th style="min-width:110px">Commission (CAD)</th>
              <th style="min-width:100px">GST/HST Collected</th>
              <th style="min-width:140px">Notes</th>
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
  const rows = [...saved];
  // Pad to minimum 6 rows
  const blanks = Math.max(0, DEFAULT_ROWS_PER_MONTH - rows.length);
  let html = rows.map(r => buildSavedRow(r)).join('');
  for (let i = 0; i < blanks; i++) html += buildBlankRow(month);
  return html;
}

function buildSavedRow(r) {
  return `
    <tr id="income-row-${r.id}" data-income-id="${r.id}">
      <td><input type="date" class="income-input" value="${(r.income_date||'').slice(0,10)}" onchange="markDirty(${r.id})"></td>
      <td><input type="text" class="income-input" placeholder="Client or property" value="${App.escHtml(r.client_or_property||'')}" onchange="markDirty(${r.id})"></td>
      <td><input type="text" class="income-input" placeholder="Brokerage / source" value="${App.escHtml(r.brokerage_source||'')}" onchange="markDirty(${r.id})"></td>
      <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" value="${parseFloat(r.commission_amount)||''}" onchange="markDirty(${r.id})"></td>
      <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" value="${parseFloat(r.gst_hst_collected)||''}" onchange="markDirty(${r.id})"></td>
      <td><input type="text" class="income-input" placeholder="Notes" value="${App.escHtml(r.notes||'')}" onchange="markDirty(${r.id})"></td>
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
      <td><input type="date" class="income-input" oninput="showNewRowSave('${tempId}')"></td>
      <td><input type="text" class="income-input" placeholder="Client or property" oninput="showNewRowSave('${tempId}')"></td>
      <td><input type="text" class="income-input" placeholder="Brokerage / source" oninput="showNewRowSave('${tempId}')"></td>
      <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
      <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
      <td><input type="text" class="income-input" placeholder="Notes" oninput="showNewRowSave('${tempId}')"></td>
      <td>
        <button class="btn btn-sm btn-approve" id="income-save-${tempId}" onclick="saveNewIncomeRow('${tempId}', ${month})" style="display:none">Save</button>
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
  // Only show save button if a commission amount is entered
  saveBtn.style.display = data.commission_amount > 0 ? '' : 'none';
}

/* ── Save existing row ──────────────────────────────── */
async function saveIncomeRow(incomeId) {
  const rowEl  = document.getElementById(`income-row-${incomeId}`);
  const saveBtn= document.getElementById(`income-save-${incomeId}`);
  if (!rowEl) return;
  const data   = getRowData(rowEl);
  const record = incomeRecords.find(r => r.id === incomeId);
  if (!record) return;

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
  try {
    await API.updateIncome({
      income_id: incomeId,
      ...data,
    });
    if (saveBtn) { saveBtn.style.display = 'none'; saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    // Refresh subtotal for this month
    await refreshMonthSubtotal(record.month);
  } catch (err) {
    alert('Failed to save: ' + err.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

/* ── Save new blank row ─────────────────────────────── */
async function saveNewIncomeRow(tempId, month) {
  const rowEl  = document.getElementById(`income-row-${tempId}`);
  const saveBtn= document.getElementById(`income-save-${tempId}`);
  if (!rowEl) return;
  const data   = getRowData(rowEl);
  if (!data.commission_amount) { alert('Please enter a commission amount.'); return; }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
  try {
    const { record } = await API.createIncome({
      month,
      tax_year: incomeYear,
      ...data,
    });
    // Replace temp row with saved row
    incomeRecords.push(record);
    rowEl.outerHTML = buildSavedRow(record);
    await refreshMonthSubtotal(month);
    // Add a fresh blank row to keep min 6
    addIncomeRow(month);
    renderIncomeSummary(document.getElementById('income-summary'));
  } catch (err) {
    alert('Failed to save: ' + err.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

/* ── Delete row ─────────────────────────────────────── */
async function deleteIncomeRow(incomeId) {
  if (!confirm('Delete this income entry?')) return;
  try {
    await API.deleteIncome(incomeId);
    incomeRecords = incomeRecords.filter(r => r.id !== incomeId);
    const rowEl = document.getElementById(`income-row-${incomeId}`);
    if (rowEl) rowEl.remove();
    const record = incomeRecords.find(r => r.id === incomeId) ||
                   { month: parseInt(document.querySelector(`[id^="income-row-"]`)?.closest('[id^="income-month-"]')?.id?.replace('income-month-','')) };
    await refreshMonthSubtotal(record?.month);
    renderIncomeSummary(document.getElementById('income-summary'));
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

/* ── Add a new blank row to a month ─────────────────── */
function addIncomeRow(month) {
  const tbody = document.getElementById(`income-tbody-${month}`);
  if (!tbody) return;
  const tempId = `new_${month}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const tr     = document.createElement('tr');
  tr.id           = `income-row-${tempId}`;
  tr.dataset.incomeId = tempId;
  tr.dataset.month    = month;
  tr.innerHTML = `
    <td><input type="date" class="income-input" oninput="showNewRowSave('${tempId}')"></td>
    <td><input type="text" class="income-input" placeholder="Client or property" oninput="showNewRowSave('${tempId}')"></td>
    <td><input type="text" class="income-input" placeholder="Brokerage / source" oninput="showNewRowSave('${tempId}')"></td>
    <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
    <td><input type="number" class="income-input" step="0.01" min="0" placeholder="0.00" oninput="showNewRowSave('${tempId}')"></td>
    <td><input type="text" class="income-input" placeholder="Notes" oninput="showNewRowSave('${tempId}')"></td>
    <td><button class="btn btn-sm btn-approve" id="income-save-${tempId}" onclick="saveNewIncomeRow('${tempId}',${month})" style="display:none">Save</button></td>
  `;
  tbody.appendChild(tr);
}

/* ── Refresh month subtotal without full re-render ───── */
async function refreshMonthSubtotal(month) {
  if (!month) return;
  try {
    const { records } = await API.getIncome({ year: incomeYear });
    incomeRecords = records || [];
    const saved    = incomeRecords.filter(r => parseInt(r.month) === month);
    const subtotal = saved.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
    const section  = document.getElementById(`income-month-${month}`);
    if (section) {
      const sub = section.querySelector('.card-header strong');
      if (sub) sub.textContent = App.fmt(subtotal);
    }
    renderIncomeSummary(document.getElementById('income-summary'));
  } catch {}
}

/* ── Year filter ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const yearSel = document.getElementById('income-year');
  if (yearSel) {
    // Populate last 5 years
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 4; y--) {
      const opt = new Option(y, y);
      if (y === now) opt.selected = true;
      yearSel.add(opt);
    }
    yearSel.addEventListener('change', () => loadIncomePage());
  }
});

window.loadIncomePage     = loadIncomePage;
window.addIncomeRow       = addIncomeRow;
window.saveIncomeRow      = saveIncomeRow;
window.saveNewIncomeRow   = saveNewIncomeRow;
window.deleteIncomeRow    = deleteIncomeRow;
window.markDirty          = markDirty;
window.showNewRowSave     = showNewRowSave;
