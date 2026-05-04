/* Employee views: dashboard, expense submission, history */
'use strict';

/* ═══ Dashboard charts instance cache ═══ */
let chartMonthly  = null;
let chartCategory = null;

/* ════════════════════════════════════════
   EMPLOYEE DASHBOARD
════════════════════════════════════════ */
async function loadEmpDashboard() {
  const grid = document.getElementById('emp-stat-grid');
  grid.innerHTML = '<div class="stat-card"><div class="stat-value">…</div></div>'.repeat(4);

  try {
    const data = await API.getDashboard();
    const st   = data.status_totals || {};
    const approved = st.approved || { count: 0, total: 0 };
    const pending  = st.pending  || { count: 0, total: 0 };
    const rejected = st.rejected || { count: 0, total: 0 };
    const totalAll = (approved.total + pending.total + rejected.total);

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Submitted</div>
        <div class="stat-value">${App.fmt(totalAll)}</div>
        <div class="stat-sub">${(approved.count + pending.count + rejected.count)} expenses · ${data.year}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Approved</div>
        <div class="stat-value">${App.fmt(approved.total)}</div>
        <div class="stat-sub">${approved.count} expenses</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-label">Pending Review</div>
        <div class="stat-value">${App.fmt(pending.total)}</div>
        <div class="stat-sub">${pending.count} awaiting review</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Rejected</div>
        <div class="stat-value">${App.fmt(rejected.total)}</div>
        <div class="stat-sub">${rejected.count} expenses</div>
      </div>
    `;

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

  // Monthly chart
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
        y: { stacked: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() } },
      },
    },
  });

  // Category doughnut
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
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}` } },
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
        <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th><th>Status</th></tr></thead>
        <tbody>
          ${expenses.map(e => `
            <tr>
              <td>${App.fmtDate(e.expense_date)}</td>
              <td>${App.escHtml(e.category)}</td>
              <td class="amount">${App.fmt(e.amount)}</td>
              <td>${App.escHtml(e.description) || '<span style="color:var(--text-hint)">—</span>'}</td>
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

/* ════════════════════════════════════════
   EXPENSE SUBMISSION FORM
════════════════════════════════════════ */
(function initExpenseForm() {
  document.addEventListener('DOMContentLoaded', () => {
    const form      = document.getElementById('expense-form');
    const submitBtn = document.getElementById('submit-btn');
    const resetBtn  = document.getElementById('reset-btn');
    const successEl = document.getElementById('submit-success');
    const errorEl   = document.getElementById('submit-error');
    const uploadArea = document.getElementById('upload-area');
    const fileInput  = document.getElementById('receipt-file');
    const placeholder = document.getElementById('upload-placeholder');
    const preview     = document.getElementById('upload-preview');

    // Default date to today
    document.getElementById('exp-date').valueAsDate = new Date();

    // Upload area click
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelected(f);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
    });

    function handleFileSelected(file) {
      if (file.size > 5 * 1024 * 1024) {
        showError('Receipt file must be under 5 MB');
        return;
      }
      placeholder.style.display = 'none';
      preview.style.display = 'block';
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.innerHTML = `<img src="${e.target.result}"><div class="upload-filename">📎 ${App.escHtml(file.name)}</div>`;
        };
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
      preview.style.display = 'none';
      placeholder.style.display = '';
      hideMessages();
    }

    resetBtn.addEventListener('click', resetForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideMessages();

      const date     = document.getElementById('exp-date').value;
      const amount   = parseFloat(document.getElementById('exp-amount').value);
      const category = document.getElementById('exp-category').value;
      const desc     = document.getElementById('exp-description').value.trim();
      const file     = fileInput.files[0];

      if (!date || !category || !amount) {
        showError('Please fill in all required fields.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      try {
        // Upload receipt first if provided
        let receiptUrl = null;
        let receiptStorage = 'none';

        if (file) {
          submitBtn.textContent = 'Uploading receipt…';
          try {
            const up = await API.uploadReceipt(file);
            receiptUrl     = up.receipt_url;
            receiptStorage = up.storage;
          } catch (uploadErr) {
            console.warn('Receipt upload failed:', uploadErr.message);
            // Continue without receipt rather than blocking submission
          }
        }

        await API.createExpense({
          expense_date:    date,
          category,
          amount,
          description:     desc || null,
          receipt_url:     receiptUrl,
          receipt_storage: receiptStorage,
        });

        showSuccess('Expense submitted successfully! It will appear in your history once reviewed.');
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

/* ════════════════════════════════════════
   MY EXPENSE HISTORY
════════════════════════════════════════ */
let histPage = 1;

async function loadHistory(page = 1) {
  histPage = page;
  const tbody = document.getElementById('hist-tbody');
  tbody.innerHTML = '<tr class="spinner-row"><td colspan="7">Loading…</td></tr>';

  const params = {
    page,
    limit: 20,
    status:    document.getElementById('hist-status')?.value    || '',
    category:  document.getElementById('hist-category')?.value  || '',
    date_from: document.getElementById('hist-from')?.value      || '',
    date_to:   document.getElementById('hist-to')?.value        || '',
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const { expenses, pagination } = await API.getExpenses(params);
    if (!expenses.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>No expenses found.</p></div></td></tr>';
      document.getElementById('hist-pager').innerHTML = '';
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.fmtDate(e.expense_date)}</td>
        <td>${App.escHtml(e.category)}</td>
        <td class="amount">${App.fmt(e.amount)}</td>
        <td>${App.escHtml(e.description) || '<span style="color:var(--text-hint)">—</span>'}</td>
        <td>${App.statusBadge(e.status)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${e.review_notes ? App.escHtml(e.review_notes) : '—'}</td>
        <td>${App.receiptLink(e.receipt_url, e.receipt_storage)}</td>
      </tr>
    `).join('');

    App.buildPager('hist-pager', pagination, loadHistory);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">Failed to load expenses: ${App.escHtml(err.message)}</div></td></tr>`;
  }
}

window.loadEmpDashboard  = loadEmpDashboard;
window.loadHistory       = loadHistory;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hist-filter-btn')?.addEventListener('click', () => loadHistory(1));
});
