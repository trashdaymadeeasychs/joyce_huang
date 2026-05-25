/* Employee views: dashboard, expense submission, history */
'use strict';

/* ═══ Dashboard chart cache ════════════════════════════ */
let chartMonthly  = null;
let chartCategory = null;

/* ════════════════════════════════════════════════════════
   EMPLOYEE DASHBOARD
════════════════════════════════════════════════════════ */
async function loadEmpDashboard() {
  const grid = document.getElementById('emp-stat-grid');
  grid.innerHTML = '<div class="stat-card"><div class="stat-value">…</div></div>'.repeat(4);

  try {
    const data      = await API.getDashboard();
    const st        = data.status_totals || {};
    const approved  = st.approved || { count: 0, total: 0 };
    const pending   = st.pending  || { count: 0, total: 0 };
    const totalExp  = (approved.total + pending.total + (st.rejected?.total || 0));
    const incomeTot = data.income_total || 0;

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Submitted (${data.year})</div>
        <div class="stat-value">${App.fmt(totalExp)}</div>
        <div class="stat-sub">${approved.count + pending.count + (st.rejected?.count || 0)} expenses</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Approved / Deductible</div>
        <div class="stat-value">${App.fmt(data.deductible_total || approved.total)}</div>
        <div class="stat-sub">${approved.count} approved expenses</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Pending Review</div>
        <div class="stat-value">${App.fmt(pending.total)}</div>
        <div class="stat-sub">${pending.count} awaiting review</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Income (${data.year})</div>
        <div class="stat-value">${App.fmt(incomeTot)}</div>
        <div class="stat-sub">Commission income</div>
      </div>
    `;

    // GST/HST summary bar
    const gstTotal = data.gst_hst_total || 0;
    const gstEl = document.getElementById('emp-gst-bar');
    if (gstEl) {
      gstEl.innerHTML = gstTotal > 0
        ? `<div class="gst-bar"><span>GST/HST Paid (potential ITC): <strong>${App.fmt(gstTotal)}</strong></span><span class="hint-text">GST/HST may be claimable as an Input Tax Credit if registered.</span></div>`
        : '';
    }

    renderEmpCharts(data);
    loadRecentExpenses();
  } catch (err) {
    grid.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1">Failed to load dashboard: ${App.escHtml(err.message)}</div>`;
  }
}

function renderEmpCharts(data) {
  const trend    = data.monthly_trend || [];
  const cats     = data.category_totals || [];
  const labels   = trend.map(r => r.month_label);
  const approved = trend.map(r => r.approved);
  const pending  = trend.map(r => r.pending);

  const mCtx = document.getElementById('chart-monthly');
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(mCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Approved', data: approved, backgroundColor: 'rgba(26,122,74,0.75)', borderRadius: 4 },
        { label: 'Pending',  data: pending,  backgroundColor: 'rgba(232,160,32,0.7)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { font: { size: 11 } } },
        y: { stacked: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString('en-CA') } },
      },
    },
  });

  const cCtx = document.getElementById('chart-category');
  if (chartCategory) chartCategory.destroy();
  const COLORS = ['#1a2a4a','#e8a020','#1a7a4a','#c94040','#3b7dd8','#7c3aed','#0891b2','#64748b'];
  chartCategory = new Chart(cCtx, {
    type: 'doughnut',
    data: {
      labels: cats.map(c => c.category),
      datasets: [{ data: cats.map(c => c.total), backgroundColor: COLORS, borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${App.fmt(ctx.raw)}` } },
      },
    },
  });
}

async function loadRecentExpenses() {
  const container = document.getElementById('emp-recent-list');
  try {
    const { expenses } = await API.getExpenses({ limit: 5 });
    if (!expenses.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No expenses yet. Submit your first expense to get started.</p></div>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Subcategory</th><th>Amount</th><th>Deductible</th><th>Status</th></tr></thead>
        <tbody>
          ${expenses.map(e => `
            <tr>
              <td>${App.fmtDate(e.expense_date)}</td>
              <td>${App.escHtml(e.category)}</td>
              <td>${App.escHtml(e.subcategory) || '<span style="color:var(--text-hint)">—</span>'}</td>
              <td class="amount">${App.fmt(e.amount)}</td>
              <td style="color:var(--green);font-weight:600">${App.fmt(e.deductible_amount || e.amount)}</td>
              <td>${App.statusBadge(e.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '';
  }
}

/* ════════════════════════════════════════════════════════
   EXPENSE SUBMISSION FORM
════════════════════════════════════════════════════════ */
(function initExpenseForm() {
  document.addEventListener('DOMContentLoaded', () => {
    const cfg        = window.REALTOR_CONFIG;
    const form       = document.getElementById('expense-form');
    const submitBtn  = document.getElementById('submit-btn');
    const resetBtn   = document.getElementById('reset-btn');
    const successEl  = document.getElementById('submit-success');
    const errorEl    = document.getElementById('submit-error');
    const uploadArea  = document.getElementById('upload-area');
    const fileInput   = document.getElementById('receipt-file');
    const placeholder = document.getElementById('upload-placeholder');
    const preview     = document.getElementById('upload-preview');
    if (!form) return;

    // Populate province dropdown
    const provSel = document.getElementById('exp-province');
    if (provSel) {
      cfg.provinces.forEach(p => {
        const opt = new Option(`${p.name} (${p.gstHstLabel || p.code})`, p.code);
        provSel.add(opt);
      });
    }

    // Populate payment method dropdown
    const pmSel = document.getElementById('exp-payment-method');
    if (pmSel) {
      cfg.paymentMethods.forEach(m => { const opt = new Option(m, m); pmSel.add(opt); });
    }

    // Default date and tax year
    const today = new Date();
    document.getElementById('exp-date').valueAsDate = today;
    const taxYearEl = document.getElementById('exp-tax-year');
    if (taxYearEl) taxYearEl.value = today.getFullYear();

    // Category → subcategory cascade
    const catSel    = document.getElementById('exp-category');
    const subSel    = document.getElementById('exp-subcategory');
    const vehicleGrp= document.getElementById('vehicle-km-group');
    const deductEl  = document.getElementById('exp-deductible-pct');

    catSel && catSel.addEventListener('change', () => {
      const cat = catSel.value;
      // Populate subcategories
      while (subSel.options.length > 1) subSel.remove(1);
      if (cat && cfg.categories[cat]) {
        cfg.categories[cat].forEach(s => { const o = new Option(s, s); subSel.add(o); });
      }
      // Show/hide vehicle KM fields
      if (vehicleGrp) vehicleGrp.style.display = cfg.isVehicle(cat) ? '' : 'none';
      // Default deductible %
      if (deductEl) deductEl.value = cfg.defaultDeductiblePct(cat, '');
      updateTotals();
    });

    subSel && subSel.addEventListener('change', () => {
      const cat = catSel.value;
      const sub = subSel.value;
      if (deductEl) deductEl.value = cfg.defaultDeductiblePct(cat, sub);
      // Show meals helper hint
      const mealsHint = document.getElementById('meals-hint');
      if (mealsHint) {
        const is50 = cfg.defaultDeductiblePct(cat, sub) === 50;
        mealsHint.style.display = is50 ? '' : 'none';
      }
      updateTotals();
    });

    // Auto-calc totals when amounts change
    ['exp-amount','exp-gst-hst','exp-pst-qst','exp-deductible-pct'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateTotals);
    });

    // Vehicle KM auto-calc
    ['exp-odo-start','exp-odo-end','exp-business-km'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateVehicleCalc);
    });

    function updateTotals() {
      const amt     = parseFloat(document.getElementById('exp-amount')?.value)   || 0;
      const gst     = parseFloat(document.getElementById('exp-gst-hst')?.value)  || 0;
      const pst     = parseFloat(document.getElementById('exp-pst-qst')?.value)  || 0;
      const pct     = parseFloat(document.getElementById('exp-deductible-pct')?.value ?? 100);
      const total   = amt + gst + pst;
      const deduct  = Math.round(total * pct) / 100;
      const totalEl = document.getElementById('exp-total-display');
      const dedEl   = document.getElementById('exp-deductible-display');
      if (totalEl) totalEl.textContent = App.fmt(total);
      if (dedEl)   dedEl.textContent   = App.fmt(deduct);
    }

    function updateVehicleCalc() {
      const start = parseFloat(document.getElementById('exp-odo-start')?.value) || 0;
      const end   = parseFloat(document.getElementById('exp-odo-end')?.value)   || 0;
      const biz   = parseFloat(document.getElementById('exp-business-km')?.value) || 0;
      const total = end >= start ? end - start : 0;
      const pct   = total > 0 ? Math.min(100, Math.round((biz / total) * 10000) / 100) : 0;
      const totalKmEl = document.getElementById('exp-total-km-display');
      const bizPctEl  = document.getElementById('exp-business-pct-display');
      if (totalKmEl) totalKmEl.textContent = total.toFixed(1) + ' km';
      if (bizPctEl)  bizPctEl.textContent  = pct.toFixed(1) + '%';
      // Apply vehicle business use % to deductible
      if (deductEl && pct > 0 && document.getElementById('exp-category')?.value === 'Vehicle') {
        deductEl.value = pct.toFixed(2);
        updateTotals();
      }
    }

    // Upload area
    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        const f = e.dataTransfer.files[0]; if (f) handleFile(f);
      });
      fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
    }

    function handleFile(file) {
      if (file.size > 5 * 1024 * 1024) { showError('Receipt file must be under 5 MB'); return; }
      placeholder.style.display = 'none'; preview.style.display = 'block';
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}"><div class="upload-filename">📎 ${App.escHtml(file.name)}</div>`; };
        reader.readAsDataURL(file);
      } else {
        preview.innerHTML = `<div style="font-size:32px">📄</div><div class="upload-filename">📎 ${App.escHtml(file.name)}</div>`;
      }
    }

    function showError(msg)   { errorEl.textContent = msg;   errorEl.style.display = 'block'; successEl.style.display = 'none'; }
    function showSuccess(msg) { successEl.textContent = msg; successEl.style.display = 'block'; errorEl.style.display = 'none'; }
    function hideMessages()   { errorEl.style.display = 'none'; successEl.style.display = 'none'; }

    function resetForm() {
      form.reset();
      document.getElementById('exp-date').valueAsDate = new Date();
      if (taxYearEl) taxYearEl.value = new Date().getFullYear();
      preview.style.display = 'none';
      placeholder.style.display = '';
      if (vehicleGrp) vehicleGrp.style.display = 'none';
      const mealsHint = document.getElementById('meals-hint');
      if (mealsHint) mealsHint.style.display = 'none';
      const totalEl = document.getElementById('exp-total-display');
      const dedEl   = document.getElementById('exp-deductible-display');
      if (totalEl) totalEl.textContent = App.fmt(0);
      if (dedEl)   dedEl.textContent   = App.fmt(0);
      hideMessages();
    }

    resetBtn && resetBtn.addEventListener('click', resetForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideMessages();

      const date        = document.getElementById('exp-date').value;
      const amount      = parseFloat(document.getElementById('exp-amount').value);
      const category    = document.getElementById('exp-category').value;
      const subcategory = document.getElementById('exp-subcategory').value;
      const vendor      = document.getElementById('exp-vendor')?.value.trim() || null;
      const gstHst      = parseFloat(document.getElementById('exp-gst-hst')?.value) || 0;
      const pstQst      = parseFloat(document.getElementById('exp-pst-qst')?.value) || 0;
      const province    = document.getElementById('exp-province')?.value || null;
      const payMethod   = document.getElementById('exp-payment-method')?.value || null;
      const deductPct   = parseFloat(document.getElementById('exp-deductible-pct')?.value ?? 100);
      const bizPurpose  = document.getElementById('exp-business-purpose')?.value.trim() || null;
      const clientProp  = document.getElementById('exp-client-property')?.value.trim() || null;
      const taxYear     = parseInt(document.getElementById('exp-tax-year')?.value) || new Date().getFullYear();
      const file        = fileInput.files[0];
      const isCapital   = cfg.isCapitalAsset(category);
      const ccaClass    = document.getElementById('exp-cca-class')?.value || null;

      // Vehicle KM fields
      const odoStart    = parseFloat(document.getElementById('exp-odo-start')?.value) || null;
      const odoEnd      = parseFloat(document.getElementById('exp-odo-end')?.value)   || null;
      const bizKm       = parseFloat(document.getElementById('exp-business-km')?.value) || null;
      const totalKm     = odoStart != null && odoEnd != null && odoEnd >= odoStart ? odoEnd - odoStart : null;
      const bizUsePct   = totalKm && bizKm ? Math.min(100, Math.round((bizKm / totalKm) * 10000) / 100) : null;

      if (!date || !category || !amount) {
        showError('Date, category, and amount before tax are required.'); return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      try {
        let receiptUrl = null, receiptStorage = 'none';
        if (file) {
          submitBtn.textContent = 'Uploading receipt…';
          try {
            const up = await API.uploadReceipt(file);
            receiptUrl     = up.receipt_url;
            receiptStorage = up.storage;
          } catch (uploadErr) {
            console.warn('Receipt upload failed:', uploadErr.message);
          }
        }

        await API.createExpense({
          expense_date:    date,
          tax_year:        taxYear,
          category,
          subcategory:     subcategory || null,
          vendor,
          amount,
          gst_hst_amount:  gstHst,
          pst_qst_amount:  pstQst,
          province,
          payment_method:  payMethod,
          deductible_pct:  deductPct,
          business_purpose: bizPurpose,
          client_property:  clientProp,
          is_capital_asset: isCapital,
          cca_class:        isCapital ? ccaClass : null,
          odometer_start:   odoStart,
          odometer_end:     odoEnd,
          total_km:         totalKm,
          business_km:      bizKm,
          business_use_pct: bizUsePct,
          receipt_url:      receiptUrl,
          receipt_storage:  receiptStorage,
        });

        showSuccess('Expense submitted successfully!');
        resetForm();
        App.refreshPendingBadge();
      } catch (err) {
        showError(err.message || 'Failed to submit expense. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Expense';
      }
    });
  });
})();

/* ════════════════════════════════════════════════════════
   MY EXPENSE HISTORY
════════════════════════════════════════════════════════ */
let histPage = 1;

async function loadHistory(page = 1) {
  histPage = page;
  const tbody = document.getElementById('hist-tbody');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="9">Loading…</td></tr>';

  const params = {
    page, limit: 20,
    status:    document.getElementById('hist-status')?.value    || '',
    category:  document.getElementById('hist-category')?.value  || '',
    date_from: document.getElementById('hist-from')?.value      || '',
    date_to:   document.getElementById('hist-to')?.value        || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const { expenses, pagination } = await API.getExpenses(params);
    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><p>No expenses found.</p></div></td></tr>';
      document.getElementById('hist-pager').innerHTML = '';
      return;
    }
    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.fmtDate(e.expense_date)}</td>
        <td>${App.escHtml(e.category)}</td>
        <td>${App.escHtml(e.subcategory) || '<span style="color:var(--text-hint)">—</span>'}</td>
        <td>${App.escHtml(e.vendor) || '<span style="color:var(--text-hint)">—</span>'}</td>
        <td class="amount">${App.fmt(e.amount)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${e.gst_hst_amount > 0 ? App.fmt(e.gst_hst_amount) : '—'}</td>
        <td style="color:var(--green);font-weight:600">${App.fmt(e.deductible_amount || e.amount)}</td>
        <td>${App.statusBadge(e.status)}</td>
        <td>${App.receiptLink(e.receipt_url, e.receipt_storage)}</td>
      </tr>
    `).join('');
    App.buildPager('hist-pager', pagination, loadHistory);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-error">Failed to load: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

window.loadEmpDashboard = loadEmpDashboard;
window.loadHistory      = loadHistory;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hist-filter-btn')?.addEventListener('click', () => loadHistory(1));
});
