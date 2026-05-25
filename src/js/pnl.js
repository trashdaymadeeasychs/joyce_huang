/* P&L Report — Profit & Loss Statement generator */
'use strict';

const CAT_ORDER = [
  'Vehicle', 'Marketing', 'Professional', 'Technology',
  'Office', 'Travel', 'Client Relations', 'Capital Assets',
];

let pnlYear = 2026;

/* ══════════════════════════════════════════════════
   LOAD PAGE
══════════════════════════════════════════════════ */
async function loadPnlPage() {
  const wrap = document.getElementById('pnl-wrap');
  if (!wrap) return;

  // Build chrome (year bar + action buttons) on first visit
  if (!document.getElementById('pnl-year')) {
    const opts = [2028, 2027, 2026]
      .map(y => `<option value="${y}"${y === 2026 ? ' selected' : ''}>${y}</option>`)
      .join('');
    wrap.innerHTML = `
      <div class="pnl-toolbar">
        <div class="pnl-toolbar-left">
          <label class="pnl-year-label">Tax Year</label>
          <select id="pnl-year" onchange="loadPnlPage()">${opts}</select>
        </div>
        <div class="pnl-toolbar-right" id="pnl-actions" style="display:none">
          <button class="btn btn-navy" onclick="exportPnlPDF()">🖨 Save as PDF</button>
          <button class="btn btn-primary" onclick="exportPnlWord()">📄 Download Word Doc</button>
        </div>
      </div>
      <div id="pnl-doc-wrap"></div>
    `;
  }

  const yr = parseInt(document.getElementById('pnl-year')?.value) || pnlYear;
  pnlYear = yr;

  const docWrap = document.getElementById('pnl-doc-wrap');
  const actions = document.getElementById('pnl-actions');
  if (!docWrap) return;

  docWrap.innerHTML = `
    <div class="pnl-loading">
      <div class="pnl-loading-icon">📊</div>
      <div>Building your P&L statement…</div>
    </div>`;
  if (actions) actions.style.display = 'none';

  try {
    const [incomeRes, expenseRes] = await Promise.all([
      API.getIncome({ year: yr }),
      API.getExpenses({ tax_year: yr, status: 'approved', limit: 500 }),
    ]);

    const incomeRecords  = incomeRes.records  || [];
    const expenseRecords = expenseRes.expenses || [];

    const data = buildPnlData(yr, incomeRecords, expenseRecords);
    docWrap.innerHTML = renderPnlDocument(data);
    if (actions) actions.style.display = 'flex';
  } catch (err) {
    docWrap.innerHTML = `<div class="alert alert-error" style="max-width:600px">
      Failed to load P&L data: ${App.escHtml(err.message)}
    </div>`;
  }
}

/* ══════════════════════════════════════════════════
   DATA PROCESSING
══════════════════════════════════════════════════ */
function buildPnlData(year, incomeRecords, expenses) {
  // Income totals
  const totalIncome    = incomeRecords.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);
  const totalIncomeGst = incomeRecords.reduce((s, r) => s + (parseFloat(r.gst_hst_collected)  || 0), 0);

  // Expenses grouped by category
  const catMap = {};
  for (const exp of expenses) {
    const cat = exp.category || 'Other';
    const sub = exp.subcategory || null;
    if (!catMap[cat]) catMap[cat] = { gross: 0, gst: 0, pst: 0, deductible: 0, count: 0, subcats: {} };
    const c = catMap[cat];
    c.gross      += parseFloat(exp.amount)            || 0;
    c.gst        += parseFloat(exp.gst_hst_amount)    || 0;
    c.pst        += parseFloat(exp.pst_qst_amount)    || 0;
    c.deductible += parseFloat(exp.deductible_amount) || 0;
    c.count      += 1;
    if (sub) {
      if (!c.subcats[sub]) c.subcats[sub] = { gross: 0, deductible: 0, count: 0 };
      c.subcats[sub].gross      += parseFloat(exp.amount)            || 0;
      c.subcats[sub].deductible += parseFloat(exp.deductible_amount) || 0;
      c.subcats[sub].count      += 1;
    }
  }

  // Ordered category list (known order first, then any unknown)
  const orderedCats = [
    ...CAT_ORDER.filter(c => catMap[c]),
    ...Object.keys(catMap).filter(c => !CAT_ORDER.includes(c)),
  ].map(name => ({ name, ...catMap[name] }));

  const totalExpGross     = orderedCats.reduce((s, c) => s + c.gross,      0);
  const totalDeductible   = orderedCats.reduce((s, c) => s + c.deductible, 0);
  const totalGstOnExp     = orderedCats.reduce((s, c) => s + c.gst,        0);
  const totalPstOnExp     = orderedCats.reduce((s, c) => s + c.pst,        0);
  const netIncome         = totalIncome - totalDeductible;
  const netGstPayable     = totalIncomeGst - totalGstOnExp;
  const hasMeals          = expenses.some(e =>
    ['Client Relations','Travel'].includes(e.category) && (parseFloat(e.deductible_pct) || 100) < 100
  );
  const hasCapital        = orderedCats.some(c => c.name === 'Capital Assets' && c.count > 0);

  return {
    year, generatedAt: new Date(),
    income: { total: totalIncome, gst: totalIncomeGst },
    categories: orderedCats,
    totals: {
      gross: totalExpGross, deductible: totalDeductible,
      gst: totalGstOnExp, pst: totalPstOnExp,
    },
    netIncome, netGstPayable, hasMeals, hasCapital,
    expenseCount: expenses.length, incomeCount: incomeRecords.length,
  };
}

/* ══════════════════════════════════════════════════
   RENDER DOCUMENT
══════════════════════════════════════════════════ */
function renderPnlDocument(d) {
  const fmt   = v => App.fmt(v);
  const date  = d.generatedAt.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const noData = d.income.total === 0 && d.totals.gross === 0;

  const catRows = d.categories.map(cat => {
    const hasSubcats = Object.keys(cat.subcats).length > 1;
    const subcatHtml = hasSubcats
      ? Object.entries(cat.subcats)
          .sort((a, b) => b[1].deductible - a[1].deductible)
          .map(([name, v]) => `
            <tr class="pnl-subrow">
              <td class="pnl-subcat">↳ ${App.escHtml(name)}</td>
              <td class="pnl-num pnl-muted">${fmt(v.gross)}</td>
              <td class="pnl-num pnl-muted">${fmt(v.deductible)}</td>
              <td class="pnl-num pnl-muted pnl-count">${v.count}</td>
            </tr>`).join('')
      : '';

    const isMeals   = cat.name === 'Client Relations' || cat.name === 'Travel';
    const isCapital = cat.name === 'Capital Assets';
    const note = isCapital ? ' <span class="pnl-note-ref">†</span>'
               : (isMeals && cat.gross !== cat.deductible) ? ' <span class="pnl-note-ref">*</span>'
               : '';

    return `
      <tr class="pnl-cat-row">
        <td class="pnl-cat-name">${App.escHtml(cat.name)}${note}</td>
        <td class="pnl-num">${fmt(cat.gross)}</td>
        <td class="pnl-num pnl-deduct">${fmt(cat.deductible)}</td>
        <td class="pnl-num pnl-count">${cat.count}</td>
      </tr>
      ${subcatHtml}
    `;
  }).join('');

  return `
  <div class="pnl-document" id="pnl-document">

    <!-- ── Header ── -->
    <div class="pnl-header">
      <div class="pnl-header-main">
        <div class="pnl-name">Joyce Huang</div>
        <div class="pnl-title">Real Estate Agent</div>
        <div class="pnl-doc-title">Profit &amp; Loss Statement</div>
      </div>
      <div class="pnl-header-meta">
        <div class="pnl-meta-row"><span class="pnl-meta-lbl">Tax Year</span><span class="pnl-meta-val">${d.year}</span></div>
        <div class="pnl-meta-row"><span class="pnl-meta-lbl">Prepared</span><span class="pnl-meta-val">${date}</span></div>
        <div class="pnl-meta-row"><span class="pnl-meta-lbl">Expenses</span><span class="pnl-meta-val">${d.expenseCount} approved</span></div>
        <div class="pnl-meta-row"><span class="pnl-meta-lbl">Income Entries</span><span class="pnl-meta-val">${d.incomeCount}</span></div>
      </div>
    </div>

    ${noData ? `<div class="pnl-empty">No approved expenses or income found for ${d.year}. Submit and approve expenses, and add income entries first.</div>` : ''}

    <!-- ── Income ── -->
    <div class="pnl-section">
      <div class="pnl-section-title">Income</div>
      <table class="pnl-table">
        <tbody>
          <tr>
            <td class="pnl-line-label">Commission Income</td>
            <td class="pnl-num">${fmt(d.income.total)}</td>
          </tr>
          ${d.income.gst > 0 ? `<tr class="pnl-subrow"><td class="pnl-subcat">GST/HST Collected (see summary below)</td><td class="pnl-num pnl-muted">${fmt(d.income.gst)}</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr class="pnl-subtotal-row">
            <td class="pnl-line-label">GROSS INCOME</td>
            <td class="pnl-num pnl-total-val">${fmt(d.income.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- ── Expenses ── -->
    <div class="pnl-section">
      <div class="pnl-section-title">Deductible Expenses
        <span class="pnl-section-sub">Approved expenses only</span>
      </div>
      ${d.categories.length === 0 ? '<div class="pnl-empty-section">No approved expenses for this year.</div>' : `
      <table class="pnl-table pnl-expense-table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="pnl-num">Gross Amount</th>
            <th class="pnl-num">Deductible Amount</th>
            <th class="pnl-num pnl-count">Receipts</th>
          </tr>
        </thead>
        <tbody>${catRows}</tbody>
        <tfoot>
          <tr class="pnl-spacer-row"><td colspan="4"></td></tr>
          <tr class="pnl-subtotal-row">
            <td class="pnl-line-label">TOTAL EXPENSES</td>
            <td class="pnl-num">${fmt(d.totals.gross)}</td>
            <td class="pnl-num pnl-total-val">${fmt(d.totals.deductible)}</td>
            <td></td>
          </tr>
          ${d.totals.gst > 0 ? `
          <tr class="pnl-subrow">
            <td class="pnl-subcat">GST/HST Paid on Expenses (ITC eligible)</td>
            <td class="pnl-num pnl-muted">${fmt(d.totals.gst)}</td>
            <td></td><td></td>
          </tr>` : ''}
          ${d.totals.pst > 0 ? `
          <tr class="pnl-subrow">
            <td class="pnl-subcat">PST/QST Paid on Expenses</td>
            <td class="pnl-num pnl-muted">${fmt(d.totals.pst)}</td>
            <td></td><td></td>
          </tr>` : ''}
        </tfoot>
      </table>`}
    </div>

    <!-- ── Net Income ── -->
    <div class="pnl-net-box">
      <div class="pnl-net-label">NET INCOME (before income tax)</div>
      <div class="pnl-net-value ${d.netIncome >= 0 ? 'pnl-positive' : 'pnl-negative'}">${fmt(d.netIncome)}</div>
      <div class="pnl-net-sub">Gross Income ${fmt(d.income.total)} − Deductible Expenses ${fmt(d.totals.deductible)}</div>
    </div>

    <!-- ── GST/HST Summary ── -->
    ${(d.income.gst > 0 || d.totals.gst > 0) ? `
    <div class="pnl-section">
      <div class="pnl-section-title">GST / HST Summary</div>
      <table class="pnl-table">
        <tbody>
          <tr>
            <td class="pnl-line-label">GST/HST Collected on Commissions</td>
            <td class="pnl-num">${fmt(d.income.gst)}</td>
          </tr>
          <tr>
            <td class="pnl-line-label">GST/HST Paid on Expenses (Input Tax Credits)</td>
            <td class="pnl-num">− ${fmt(d.totals.gst)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="pnl-subtotal-row">
            <td class="pnl-line-label">Estimated Net GST/HST Remittable</td>
            <td class="pnl-num pnl-total-val ${d.netGstPayable < 0 ? 'pnl-negative' : ''}">${fmt(d.netGstPayable)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="pnl-note-text" style="margin-top:8px">
        This is an estimate only. Actual GST/HST remittance depends on your filing period, registration status, and eligible ITCs. Confirm with your accountant.
      </div>
    </div>` : ''}

    <!-- ── Notes ── -->
    <div class="pnl-section pnl-notes-section">
      <div class="pnl-section-title">Notes</div>
      <ol class="pnl-notes-list">
        <li>This statement includes <strong>approved expenses only</strong>. Pending or rejected expenses are excluded.</li>
        ${d.hasMeals ? '<li><span class="pnl-note-ref">*</span> Meals &amp; entertainment amounts are shown at <strong>50% deductibility</strong> per CRA guidelines (Section 67.1).</li>' : ''}
        ${d.hasCapital ? '<li><span class="pnl-note-ref">†</span> <strong>Capital Assets</strong> are typically not fully deductible in the year of purchase. They are depreciated through Capital Cost Allowance (CCA). Confirm the appropriate CCA class and deduction with your accountant.</li>' : ''}
        <li>GST/HST Input Tax Credit (ITC) eligibility depends on your GST/HST registration status and the business-use percentage of each expense.</li>
        <li>Vehicle expenses should be prorated based on your annual business-use kilometre log.</li>
        <li><strong>This document is for organizational purposes only and does not constitute tax, legal, or accounting advice.</strong> Please review with a qualified Canadian tax professional before filing.</li>
      </ol>
    </div>

    <!-- ── Footer ── -->
    <div class="pnl-footer">
      Joyce Huang · Real Estate Agent · Tax Year ${d.year} · Generated ${date}
    </div>

  </div>`;
}

/* ══════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════ */
function exportPnlPDF() {
  window.print();
}

function exportPnlWord() {
  const docEl = document.getElementById('pnl-document');
  if (!docEl) return;

  const styles = `
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1D2E4A; margin: 1in; }
    .pnl-header { display: flex; justify-content: space-between; margin-bottom: 24pt; border-bottom: 2pt solid #C8861A; padding-bottom: 12pt; }
    .pnl-name { font-size: 18pt; font-weight: bold; color: #1D3152; }
    .pnl-title { font-size: 11pt; color: #50647E; margin-top: 2pt; }
    .pnl-doc-title { font-size: 14pt; font-weight: bold; color: #C8861A; margin-top: 6pt; }
    .pnl-meta-row { font-size: 10pt; color: #50647E; line-height: 1.7; }
    .pnl-meta-lbl { display: inline-block; width: 90pt; font-weight: bold; color: #1D2E4A; }
    .pnl-section { margin: 16pt 0; }
    .pnl-section-title { font-size: 12pt; font-weight: bold; color: #1D3152; border-bottom: 1pt solid #ddd; padding-bottom: 4pt; margin-bottom: 8pt; text-transform: uppercase; letter-spacing: 0.5pt; }
    .pnl-section-sub { font-size: 9pt; font-weight: normal; color: #50647E; text-transform: none; letter-spacing: 0; margin-left: 8pt; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 9pt; font-weight: bold; color: #50647E; text-transform: uppercase; border-bottom: 1pt solid #ddd; padding: 5pt 6pt; text-align: left; }
    td { font-size: 10.5pt; padding: 5pt 6pt; border-bottom: 0.5pt solid #f0f0f0; }
    .pnl-num { text-align: right; font-variant-numeric: tabular-nums; }
    .pnl-cat-name { font-weight: 600; }
    .pnl-deduct { color: #157042; font-weight: 600; }
    .pnl-subcat { padding-left: 18pt; font-size: 10pt; color: #50647E; }
    .pnl-muted { color: #50647E; }
    .pnl-count { color: #8A9EBA; font-size: 9.5pt; }
    .pnl-subtotal-row td { font-weight: bold; border-top: 1.5pt solid #1D3152; border-bottom: none; padding-top: 6pt; }
    .pnl-total-val { color: #1D3152; font-size: 11.5pt; }
    .pnl-net-box { background: #ECF0F8; border-left: 4pt solid #C8861A; padding: 12pt 16pt; margin: 20pt 0; }
    .pnl-net-label { font-size: 11pt; font-weight: bold; color: #50647E; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; }
    .pnl-net-value { font-size: 22pt; font-weight: bold; color: #1D3152; }
    .pnl-net-sub { font-size: 9pt; color: #50647E; margin-top: 4pt; }
    .pnl-positive { color: #157042; }
    .pnl-negative { color: #C43535; }
    .pnl-notes-list { padding-left: 16pt; }
    .pnl-notes-list li { font-size: 10pt; color: #50647E; margin-bottom: 5pt; line-height: 1.5; }
    .pnl-note-ref { color: #C8861A; font-weight: bold; }
    .pnl-footer { font-size: 9pt; color: #8A9EBA; border-top: 0.5pt solid #ddd; margin-top: 20pt; padding-top: 8pt; text-align: center; }
    .pnl-empty, .pnl-empty-section { color: #8A9EBA; font-style: italic; padding: 10pt; }
  `;

  const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <title>Joyce Huang — P&L Statement ${pnlYear}</title>
  <style>${styles}</style>
</head>
<body>${docEl.innerHTML}</body>
</html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Joyce_Huang_PnL_${pnlYear}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* ── Expose globals ─────────────────────────────── */
window.loadPnlPage   = loadPnlPage;
window.exportPnlPDF  = exportPnlPDF;
window.exportPnlWord = exportPnlWord;
