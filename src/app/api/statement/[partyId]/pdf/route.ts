// ADEEB ENTERPRISES — Account Statement PDF Generator API
// Generates statement exactly matching the reference design layout.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> }
) {
  const { partyId } = await params;
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  function parseDate(s: string | null): Date | undefined {
    if (!s || s.trim() === '' || s === 'null' || s === 'undefined') return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
  }
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

  const business = await prisma.business.findFirst();

  const [purchases, payments] = await Promise.all([
    prisma.purchaseEntry.findMany({
      where: {
        partyId, reversed: false,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        partyId, reversed: false,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
      include: { cashExExpense: true },
    }),
  ]);

  // ── Calculations ────────────────────────────────────────────────────────────
  const openingBalance = new Decimal(party.openingBalance.toString());
  const openingDir = party.openingBalanceDirection;

  const totalPurchases = purchases.reduce(
    (s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0)
  );
  const totalPayments = payments
    .filter(p => p.direction === 'RECEIVED')
    .reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
  const totalPaid = payments
    .filter(p => p.direction === 'PAID')
    .reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));

  const totalQty = purchases.reduce((s, p) => s + p.qty, 0);
  const totalWeight = purchases.reduce(
    (s, p) => s.plus(new Decimal(p.totalWeight.toString())), new Decimal(0)
  );

  // Category weight breakdown (B/C, S/C, V/C)
  const catWeightMap: Record<string, Decimal> = {};
  for (const p of purchases) {
    if (!p.category) continue;
    const cat = p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : p.category === 'VC_HISTORICAL' ? 'V/C' : '';
    if (cat) {
      catWeightMap[cat] = (catWeightMap[cat] ?? new Decimal(0)).plus(new Decimal(p.totalWeight.toString()));
    }
  }

  // Payment method breakdown
  const methodBreakdown: Record<string, Decimal> = {};
  for (const p of payments) {
    if (p.direction === 'RECEIVED') {
      const m = p.method;
      methodBreakdown[m] = (methodBreakdown[m] ?? new Decimal(0)).plus(new Decimal(p.amount.toString()));
    }
  }

  // Closing balance (Signed math matching reference format)
  // CR = negative (payable / credit), DR = positive (receivable)
  const openingSigned = openingDir === 'DR' ? openingBalance : openingBalance.neg();
  const closingSigned = openingSigned.plus(totalPurchases).minus(totalPayments).plus(totalPaid);

  const statementHtml = generateStatementHtml({
    business,
    party,
    purchases,
    payments,
    from,
    to,
    openingSigned,
    closingSigned,
    totalPurchases,
    totalPayments,
    totalPaid,
    totalQty,
    totalWeight,
    catWeightMap,
    methodBreakdown,
  });

  return new NextResponse(statementHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtNum(v: Decimal | string | number, decimals = 0): string {
  const n = typeof v === 'object' && 'toNumber' in v ? (v as Decimal).toNumber() : parseFloat(String(v));
  if (isNaN(n)) return '0';
  const absStr = Math.abs(n).toFixed(decimals);
  const [i, d] = absStr.split('.');
  const groups: string[] = [];
  let rest = i;
  if (rest.length > 3) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) groups.unshift(rest);
  const formatted = groups.join(',');
  return decimals > 0 && d ? `${formatted}.${d}` : formatted;
}

function fmtBalWithSymbol(v: Decimal): string {
  const isNeg = v.isNegative();
  const numStr = fmtNum(v.abs(), 0);
  return isNeg ? `-₹${numStr}` : `₹${numStr}`;
}

function fmtBalFullDecimal(v: Decimal): string {
  const isNeg = v.isNegative();
  const numStr = fmtNum(v.abs(), 2);
  return isNeg ? `-₹${numStr}` : `₹${numStr}`;
}

function fmtDateShort(d: Date | string): string {
  const dt = new Date(d);
  const day = dt.getDate();
  const month = dt.toLocaleString('en-IN', { month: 'short' });
  return `${day} ${month}`;
}

function fmtDateRange(from?: string | null, to?: string | null, purchases: any[] = []): string {
  if (from && to) {
    const f = new Date(from);
    const t = new Date(to);
    return `${f.getDate()} ${f.toLocaleString('en-IN', { month: 'short' })} — ${t.getDate()} ${t.toLocaleString('en-IN', { month: 'short' })} ${t.getFullYear()}`;
  }
  if (purchases.length > 0) {
    const f = new Date(purchases[0].date);
    const t = new Date(purchases[purchases.length - 1].date);
    return `${f.getDate()} ${f.toLocaleString('en-IN', { month: 'short' })} — ${t.getDate()} ${t.toLocaleString('en-IN', { month: 'short' })} ${t.getFullYear()}`;
  }
  return 'All dates';
}

function fmtIsoDate(d: Date | string): string {
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── HTML Template ─────────────────────────────────────────────────────────────

function generateStatementHtml(data: any): string {
  const {
    business, party, purchases, payments,
    from, to,
    openingSigned, closingSigned,
    totalPurchases, totalPayments,
    totalQty, totalWeight,
    catWeightMap, methodBreakdown,
  } = data;

  const DISCLAIMER = 'Computer-generated statement of account. Not a tax invoice.';

  // Build sorted combined rows
  type Row = { date: Date; isPayment: boolean; p?: any; pay?: any };
  const allRows: Row[] = [
    ...purchases.map((p: any) => ({ date: p.date, isPayment: false, p })),
    ...payments.map((p: any) => ({ date: p.date, isPayment: true, pay: p })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Extract receipt numbers
  const receiptNos = purchases
    .map((p: any) => p.receiptNo)
    .filter((r: any) => !!r);
  const uniqueReceipts = Array.from(new Set(receiptNos)).join(',');

  // Build table body rows
  const tableRows = allRows.map(row => {
    if (!row.isPayment) {
      const p = row.p;
      const cat = p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : p.category === 'VC_HISTORICAL' ? 'V/C' : '';
      
      const subParts: string[] = [];
      if (p.notes) subParts.push(p.notes);
      if (p.receiptNo) subParts.push(`Receipt ${p.receiptNo}`);

      const subHtml = subParts.length > 0 
        ? `<div class="sub-text">${subParts.join(' · ')}</div>` 
        : '';

      return `<tr>
        <td class="col-date">
          <div class="main-date">${fmtDateShort(p.date)}</div>
          ${subHtml}
        </td>
        <td class="col-qty">${p.qty}</td>
        <td class="col-cat">${cat}</td>
        <td class="col-weight">${fmtNum(p.totalWeight, 1)}</td>
        <td class="col-avg">${fmtNum(p.avgWeight, 2)}</td>
        <td class="col-rate">${fmtNum(p.rate, 0)}</td>
        <td class="col-amount">${fmtNum(p.amount, 0)}</td>
        <td class="col-payment"></td>
      </tr>`;
    } else {
      const pay = row.pay;
      if (pay.direction !== 'RECEIVED') return '';

      const methodLabels: Record<string, string> = {
        CASH: 'Cash',
        AC: 'A/C',
        ADVANCE_JAMA: 'ADVANCE JAMA',
        CASH_EX: 'CASH EX',
      };
      const mLabel = methodLabels[pay.method] ?? pay.method;

      const subParts: string[] = [mLabel];
      if (pay.notes) subParts.push(pay.notes);
      if (pay.bankRef) subParts.push(pay.bankRef);

      return `<tr>
        <td class="col-date">
          <div class="main-date">${fmtDateShort(pay.date)}</div>
          <div class="sub-text">${subParts.join(' · ')}</div>
        </td>
        <td class="col-qty"></td>
        <td class="col-cat"></td>
        <td class="col-weight"></td>
        <td class="col-avg"></td>
        <td class="col-rate"></td>
        <td class="col-amount"></td>
        <td class="col-payment green-val">${fmtNum(pay.amount, 0)}</td>
      </tr>`;
    }
  }).join('');

  // Loads & Category breakdown line
  const loadCount = purchases.length;
  const catParts = Object.entries(catWeightMap).map(([c, w]) => `${c} ${fmtNum(w as Decimal, 1)}`);
  const loadsLine = `Closing balance · ${loadCount} loads · ${fmtNum(totalWeight, 1)} total${catParts.length > 0 ? ' · ' + catParts.join(' · ') : ''}`;

  // Payment methods line
  const methodLabels: Record<string, string> = {
    CASH: 'Cash',
    AC: 'A/C',
    ADVANCE_JAMA: 'ADVANCE JAMA',
    CASH_EX: 'CASH EX',
  };
  const methodParts = Object.entries(methodBreakdown).map(
    ([m, val]) => `${methodLabels[m] ?? m} ${fmtNum(val as Decimal, 0)}`
  );
  const methodsLine = methodParts.join('  ·  ');

  // Date range formatted
  const periodBoxStr = fmtDateRange(from, to, purchases);
  const periodSubStr = from && to 
    ? `${fmtIsoDate(from)} to ${fmtIsoDate(to)}`
    : purchases.length > 0
      ? `${fmtIsoDate(purchases[0].date)} to ${fmtIsoDate(purchases[purchases.length - 1].date)}`
      : 'All dates';

  // Math expression numbers
  const openingSignPrefix = openingSigned.isNegative() ? '-' : '';
  const openingFormulaStr = `${openingSignPrefix}${fmtNum(openingSigned.abs(), 2)}`;
  const purchasesFormulaStr = fmtNum(totalPurchases, 2);
  const paymentsFormulaStr = fmtNum(totalPayments, 2);
  const closingResultStr = fmtBalFullDecimal(closingSigned);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Account Statement — ${party.name}</title>
<style>

@page {
  size: A4 portrait;
  margin: 14mm 15mm 28mm 15mm;

  @bottom-center {
    content: element(page-footer);
    vertical-align: top;
  }
}

#running-footer {
  position: running(page-footer);
  width: 100%;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 9px;
  color: #64748b;
  line-height: 1.4;
  padding-top: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 11px;
  color: #0f172a;
  background: #fff;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

/* Screen toolbar */
.no-print {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f1f5f9;
  border-bottom: 1px solid #cbd5e1;
}
.print-btn {
  padding: 7px 18px;
  background: #0f172a;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.print-btn:hover { background: #1e293b; }
.close-btn {
  padding: 7px 16px;
  background: #e2e8f0;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

/* Header Section */
.header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 10px;
  margin-bottom: 22px;
}

.header-left {
  flex: 1;
}

.biz-name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #000000;
  line-height: 1.1;
  text-transform: uppercase;
}
.biz-phone {
  font-size: 12px;
  color: #334155;
  margin-top: 4px;
  margin-bottom: 18px;
}

.bill-to-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #64748b;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.party-name {
  font-size: 18px;
  font-weight: 800;
  color: #000000;
  text-transform: uppercase;
  line-height: 1.2;
}
.meta-line {
  font-size: 11px;
  color: #334155;
  margin-top: 2px;
}

/* Top Right Stat Box */
.stat-box {
  width: 310px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.stat-row:last-child {
  border-bottom: none;
}
.stat-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: #475569;
  text-transform: uppercase;
}
.stat-val {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  text-align: right;
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
}
.stat-val.closing {
  font-size: 18px;
  font-weight: 900;
  color: #000000;
}
.stat-val.period-text {
  font-size: 11px;
  font-weight: 500;
  color: #334155;
}

/* Table */
table.statement-table {
  width: 100%;
  border-collapse: collapse;
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
}

table.statement-table thead th {
  background: #e2e8f0;
  color: #334155;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 7px 8px;
  border-right: 1px solid #cbd5e1;
}
table.statement-table thead th:last-child {
  border-right: none;
}

table.statement-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #e2e8f0;
  vertical-align: top;
}
table.statement-table tbody td:last-child {
  border-right: none;
}

.col-date { width: 25%; text-align: left; }
.col-qty { width: 6%; text-align: right; font-weight: 600; }
.col-cat { width: 7%; text-align: center; color: #475569; }
.col-weight { width: 10%; text-align: right; font-weight: 600; }
.col-avg { width: 9%; text-align: right; color: #475569; }
.col-rate { width: 8%; text-align: right; font-weight: 600; }
.col-amount { width: 17%; text-align: right; font-weight: 600; }
.col-payment { width: 18%; text-align: right; font-weight: 700; }

.main-date {
  font-weight: 700;
  font-size: 11px;
  color: #0f172a;
}
.sub-text {
  font-size: 9px;
  color: #64748b;
  margin-top: 2px;
}
.green-val {
  color: #15803d;
  font-size: 12px;
}

/* Table Footer / Totals Row */
table.statement-table tfoot td {
  padding: 8px 8px;
  border-top: 2px solid #000000;
  border-bottom: 2px solid #000000;
  border-right: 1px solid #e2e8f0;
  font-weight: 800;
}
table.statement-table tfoot td:last-child {
  border-right: none;
}
.total-label {
  font-size: 10px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

/* Bottom Calculation & Summary Section */
.summary-container {
  margin-top: 22px;
  text-align: right;
  font-feature-settings: "tnum";
  font-variant-numeric: tabular-nums;
}

.formula-row {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
}
.formula-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.8px;
  color: #475569;
  text-transform: uppercase;
}
.formula-expr {
  font-size: 12px;
  color: #334155;
  font-weight: 500;
}
.formula-closing {
  font-size: 20px;
  font-weight: 900;
  color: #000000;
  letter-spacing: -0.2px;
}

.loads-breakdown {
  font-size: 10.5px;
  color: #475569;
  margin-top: 4px;
}
.methods-breakdown {
  font-size: 10.5px;
  color: #475569;
  margin-top: 3px;
}
.app-footer-note {
  font-size: 9px;
  color: #64748b;
  margin-top: 4px;
}

/* Document Footer Disclaimer */
.doc-footer {
  margin-top: 34px;
  text-align: center;
}
.doc-footer .disclaimer-line {
  font-size: 9px;
  color: #64748b;
}

@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .no-print { display: none !important; }
  table.statement-table tr { page-break-inside: avoid; }
  .summary-container { page-break-inside: avoid; }
  .doc-footer { page-break-inside: avoid; }
}

@media screen {
  #running-footer { display: none; }
  body { padding: 20px; max-width: 900px; margin: 0 auto; }
}

</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
function downloadPdfFile() {
  const btn = document.querySelector('.download-btn');
  if (btn) { btn.innerHTML = '⏳ Generating PDF...'; btn.disabled = true; }

  const toolbar = document.querySelector('.no-print');
  if (toolbar) toolbar.style.display = 'none';

  const opt = {
    margin: [10, 10, 15, 10],
    filename: '${(party.name || 'Statement').replace(/[^a-zA-Z0-9]/g, '_')}_Statement.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(document.body).save().then(() => {
    if (toolbar) toolbar.style.display = 'flex';
    if (btn) { btn.innerHTML = '📥 Download PDF File'; btn.disabled = false; }
  }).catch((err) => {
    console.error(err);
    if (toolbar) toolbar.style.display = 'flex';
    if (btn) { btn.innerHTML = '📥 Download PDF File'; btn.disabled = false; }
    alert('PDF direct download failed. Opening system print dialog instead.');
    window.print();
  });
}
</script>
</head>
<body>

<div class="no-print">
  <button class="print-btn download-btn" style="background:#15803d;" onclick="downloadPdfFile()">📥 Download PDF File</button>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <button class="close-btn" onclick="window.close()">✕ Close</button>
  <span style="font-size: 11px; color: #64748b; margin-left: 10px;">
    Tip: "Download PDF" pe click karke seedhe .pdf file save karein.
  </span>
</div>

<div id="running-footer">
  Computer-generated statement of account. Not a tax invoice.
</div>

<!-- Header -->
<div class="header-wrapper">
  <div class="header-left">
    <div class="biz-name">${business?.name ?? 'FQ TRADING'}</div>
    <div class="biz-phone">${business?.mobile ?? '9205658103'}</div>

    <div class="bill-to-label">BILL TO</div>
    <div class="party-name">${party.name}</div>
    ${uniqueReceipts ? `<div class="meta-line">Receipt no.: ${uniqueReceipts}</div>` : ''}
    <div class="meta-line">Period: ${periodSubStr}</div>
  </div>

  <div class="header-right">
    <div class="stat-box">
      <div class="stat-row">
        <span class="stat-label">OPENING BAL.</span>
        <span class="stat-val">${fmtBalWithSymbol(openingSigned)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">CLOSING BAL.</span>
        <span class="stat-val closing">${fmtBalWithSymbol(closingSigned)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">PERIOD</span>
        <span class="stat-val period-text">${periodBoxStr}</span>
      </div>
    </div>
  </div>
</div>

<!-- Table -->
<table class="statement-table">
  <thead>
    <tr>
      <th class="col-date">DATE</th>
      <th class="col-qty">QTY</th>
      <th class="col-cat">CAT</th>
      <th class="col-weight">WEIGHT</th>
      <th class="col-avg">AVG.</th>
      <th class="col-rate">RATE</th>
      <th class="col-amount">AMOUNT</th>
      <th class="col-payment">PAYMENT</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
  <tfoot>
    <tr>
      <td class="col-date total-label">TOTAL</td>
      <td class="col-qty">${totalQty}</td>
      <td class="col-cat"></td>
      <td class="col-weight">${fmtNum(totalWeight, 1)}</td>
      <td class="col-avg"></td>
      <td class="col-rate"></td>
      <td class="col-amount">${fmtNum(totalPurchases, 0)}</td>
      <td class="col-payment green-val">${fmtNum(totalPayments, 0)}</td>
    </tr>
  </tfoot>
</table>

<!-- Bottom Summary -->
<div class="summary-container">
  <div class="formula-row">
    <span class="formula-label">OPENING + AMOUNT − PAYMENT</span>
    <span class="formula-expr">${openingFormulaStr} + ${purchasesFormulaStr} − ${paymentsFormulaStr} =</span>
    <span class="formula-closing">${closingResultStr}</span>
  </div>
  <div class="loads-breakdown">${loadsLine}</div>
  ${methodsLine ? `<div class="methods-breakdown">${methodsLine}</div>` : ''}
  <div class="app-footer-note">${business?.statementFooter ?? 'Amounts you record. Not calculated, filed or verified by this app.'}</div>
</div>

<div class="doc-footer">
  <div class="disclaimer-line">Computer-generated statement of account. Not a tax invoice.</div>
</div>

</body>
</html>`;
}
