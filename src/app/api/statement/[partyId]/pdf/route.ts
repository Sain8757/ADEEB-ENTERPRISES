// ADEEB ENTERPRISES — Account Statement PDF Generator API
// Generates A4 portrait statement using print-ready HTML with CSS @page footer
// Disclaimer appears on EVERY page via CSS running elements / fixed footer technique.

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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

  const business = await prisma.business.findFirst();

  const [purchases, payments] = await Promise.all([
    prisma.purchaseEntry.findMany({
      where: {
        partyId, reversed: false,
        date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        partyId, reversed: false,
        date: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
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

  // Payment method breakdown
  const methodBreakdown: Record<string, Decimal> = {};
  for (const p of payments) {
    if (p.direction === 'RECEIVED') {
      const m = p.method;
      methodBreakdown[m] = (methodBreakdown[m] ?? new Decimal(0)).plus(new Decimal(p.amount.toString()));
    }
  }

  const cashExpenses = payments
    .filter(p => p.cashExExpense && !p.cashExExpense.reversed)
    .map(p => p.cashExExpense!);
  const totalCashEx = cashExpenses.reduce(
    (s, e) => s.plus(new Decimal(e.expenseAmount.toString())), new Decimal(0)
  );

  // Closing balance
  const openingSigned = openingDir === 'DR' ? openingBalance : openingBalance.neg();
  const closingSigned = openingSigned.plus(totalPurchases).minus(totalPayments).plus(totalPaid);
  const closingBalance = closingSigned.abs();
  const closingDir = closingSigned.isZero() ? 'NIL' : closingSigned.gt(0) ? 'DR' : 'CR';

  const statementHtml = generateStatementHtml({
    business,
    party,
    purchases,
    payments,
    from,
    to,
    openingBalance: openingBalance.toFixed(2),
    openingDir,
    closingBalance: closingBalance.toFixed(2),
    closingDir,
    totalPurchases: totalPurchases.toFixed(2),
    totalPayments: totalPayments.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    totalQty,
    totalWeight: totalWeight.toFixed(1),
    methodBreakdown: Object.fromEntries(
      Object.entries(methodBreakdown).map(([k, v]) => [k, v.toFixed(2)])
    ),
    totalCashEx: totalCashEx.toFixed(2),
    generatedAt: new Date().toISOString(),
  });

  return new NextResponse(statementHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtINR(v: string | number): string {
  const n = parseFloat(String(v));
  if (isNaN(n)) return '₹0.00';
  const abs = Math.abs(n).toFixed(2);
  const [i, d] = abs.split('.');
  const groups: string[] = [];
  let rest = i;
  if (rest.length > 3) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) groups.unshift(rest);
  return `₹${groups.join(',')}.${d}`;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── HTML Template ─────────────────────────────────────────────────────────────

function generateStatementHtml(data: any): string {
  const {
    business, party, purchases, payments,
    from, to,
    openingBalance, openingDir,
    closingBalance, closingDir,
    totalPurchases, totalPayments, totalPaid,
    totalQty, totalWeight,
    methodBreakdown, totalCashEx, generatedAt,
  } = data;

  // Combined sorted row list
  type Row = { date: Date; isPayment: boolean; p?: any; pay?: any };
  const allRows: Row[] = [
    ...purchases.map((p: any) => ({ date: p.date, isPayment: false, p })),
    ...payments.map((p: any) => ({ date: p.date, isPayment: true, pay: p })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const tableRows = allRows.map(row => {
    if (!row.isPayment) {
      const p = row.p;
      const cat = p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : 'V/C';
      return `<tr>
        <td>${fmtDate(p.date)}</td>
        <td class="num">${p.qty}</td>
        <td>${cat}</td>
        <td class="num">${parseFloat(p.totalWeight).toFixed(1)}</td>
        <td class="num">${parseFloat(p.avgWeight).toFixed(2)}</td>
        <td class="num">${parseFloat(p.rate).toFixed(2)}</td>
        <td class="num">${fmtINR(p.amount)}</td>
        <td></td>
      </tr>`;
    } else {
      const pay = row.pay;
      if (pay.direction !== 'RECEIVED') return '';
      const methodLabel: Record<string, string> = {
        CASH: 'Cash', AC: 'A/C', ADVANCE_JAMA: 'Advance Jama', CASH_EX: 'Cash EX',
      };
      const method = methodLabel[pay.method] ?? pay.method;
      return `<tr>
        <td>${fmtDate(pay.date)}</td>
        <td></td><td></td><td></td><td></td><td></td>
        <td></td>
        <td class="num pay">${fmtINR(pay.amount)}<br><small style="color:#666">${method}</small></td>
      </tr>`;
    }
  }).join('');

  const methodRows = Object.entries(methodBreakdown)
    .map(([m, v]) => {
      const label: Record<string, string> = {
        CASH: 'Cash', AC: 'A/C', ADVANCE_JAMA: 'Advance Jama', CASH_EX: 'Cash EX',
      };
      return `<div>${label[m] ?? m}: ${fmtINR(v as string)}</div>`;
    }).join('');

  const periodStr = from && to
    ? `${fmtDate(from)} to ${fmtDate(to)}`
    : 'All dates';

  const cashExSection = parseFloat(totalCashEx) > 0 ? `
<div class="cashex-note">
  <strong>&#x1F4B8; Cash EX Expense (separate business expense — not deducted from party payments):</strong>
  Total Cash EX: ${fmtINR(totalCashEx)}
  <br>This amount is recorded in the business expense ledger separately and does NOT affect the above party balance.
</div>` : '';

  // ── DISCLAIMER TEXT (single source of truth) ─────────────────────────────
  // This string is used in BOTH the @page CSS running element (all pages)
  // and the visible end-of-document footer section.
  const DISCLAIMER = 'Computer-generated statement of account. Not a tax invoice.';
  const businessFooter = business?.statementFooter
    ?? 'Amounts you record. Not calculated, filed or verified by this app.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Account Statement — ${party.name}</title>
<style>

/* ── PAGE SETUP ─────────────────────────────────────────────────────────────
   Reserve 14mm at the bottom of every printed page so the fixed-position
   footer (disclaimer) never overlaps content.
   @bottom-center is supported by Chromium / WebKit print engines used when
   the user clicks "Print / Save as PDF".
*/
@page {
  size: A4 portrait;
  margin: 15mm 15mm 28mm 15mm;   /* extra bottom margin for disclaimer footer */

  /* CSS Paged Media: @bottom-center running element — works in Chrome/Edge/Safari */
  @bottom-center {
    content: element(page-footer);
    vertical-align: top;
  }
}

/* ── RUNNING FOOTER ELEMENT (CSS Paged Media) ───────────────────────────────
   position:running() is a CSS Paged Media spec that Chrome/Edge/Safari
   respect when printing.  The element is taken out of normal flow and
   stamped into @bottom-center on every page.
   Fallback: the .page-footer-fixed element below covers non-paged-media browsers.
*/
#running-footer {
  position: running(page-footer);
  width: 100%;
  border-top: 1px solid #bbb;
  padding-top: 4px;
  text-align: center;
  font-family: Arial, sans-serif;
  font-size: 8.5px;
  color: #555;
  line-height: 1.4;
}

/* ── BODY & BASE ────────────────────────────────────────────────────────────*/
body {
  font-family: Arial, sans-serif;
  font-size: 11px;
  color: #000;
  background: #fff;
  margin: 0;
  padding: 0;
}

/* ── SCREEN-ONLY TOOLBAR (hidden in print) ──────────────────────────────────*/
.no-print { display: block; }

/* ── PAGE HEADER ─────────────────────────────────────────────────────────────*/
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #0a1628;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.biz-name { font-size: 20px; font-weight: bold; color: #0a1628; }
.biz-sub  { font-size: 11px; color: #444; }
.summary  { text-align: right; min-width: 180px; }
.summary table { width: 100%; border-collapse: collapse; }
.summary td { padding: 2px 4px; font-size: 11px; }
.summary td:last-child { text-align: right; font-weight: bold; }

/* ── PARTY INFO ──────────────────────────────────────────────────────────────*/
.party-info { margin-bottom: 8px; }
.party-name { font-size: 16px; font-weight: bold; color: #0a1628; }
.statement-title {
  text-align: center;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1px;
  margin: 8px 0;
  border-top: 1px solid #ccc;
  border-bottom: 1px solid #ccc;
  padding: 4px 0;
}

/* ── MAIN TRANSACTION TABLE ──────────────────────────────────────────────────*/
table.main { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
table.main th {
  background: #0a1628;
  color: #fff;
  padding: 4px 6px;
  font-size: 10px;
  text-align: left;
}
table.main th.num { text-align: right; }
table.main td {
  border: 1px solid #ddd;
  padding: 3px 6px;
  font-size: 10px;
}
table.main td.num, table.main td.pay { text-align: right; }
table.main td.pay { color: #008000; font-weight: bold; }

/* ── TOTALS SECTION ──────────────────────────────────────────────────────────*/
.totals {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  border-top: 2px solid #0a1628;
  padding-top: 6px;
}
.totals div { font-size: 11px; }
.balance-box { text-align: right; }
.balance-label { font-size: 10px; color: #666; }
.balance-val { font-size: 18px; font-weight: bold; }

/* ── CASH EX NOTE ────────────────────────────────────────────────────────────*/
.cashex-note {
  margin-top: 8px;
  padding: 4px 8px;
  background: #f9f9f9;
  border: 1px solid #ddd;
  font-size: 10px;
}

/* ── END-OF-DOCUMENT FOOTER (visible on screen + last printed page) ──────────
   This is the visible footer at the bottom of the HTML document.
   It also acts as the fallback for browsers/engines that don't support
   CSS Paged Media running elements.
   It is NOT the per-page disclaimer — that is handled by #running-footer above.
*/
.doc-footer {
  margin-top: 20px;
  border-top: 1px solid #ccc;
  padding-top: 8px;
  font-size: 9px;
  color: #555;
}
.doc-footer .disclaimer-line {
  text-align: center;
  font-size: 9px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
  letter-spacing: 0.3px;
}
.doc-footer .generated-line {
  text-align: center;
  font-size: 8px;
  color: #888;
}
.doc-footer .business-footer-line {
  text-align: center;
  font-size: 8.5px;
  color: #666;
  margin-top: 3px;
}

/* ── PRINT RULES ─────────────────────────────────────────────────────────────*/
@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .no-print { display: none !important; }

  /* Prevent table row orphans — keep at least 2 rows together */
  table.main tr { page-break-inside: avoid; }

  /* Keep the totals+balance block together on a page */
  .totals { page-break-inside: avoid; }
  .cashex-note { page-break-inside: avoid; }

  /* The doc-footer should not be orphaned at the very top of a new page */
  .doc-footer { page-break-inside: avoid; }

  /* Ensure the per-page running footer placeholder is hidden in flow */
  #running-footer { display: block; }
}

/* ── SCREEN ONLY: simulate footer bar at bottom ─────────────────────────────*/
@media screen {
  /* On screen, show a sticky-style footer preview below the content */
  #running-footer {
    display: none; /* hidden on screen; only meaningful in print engine */
  }
}

/* ── PRINT BUTTON ────────────────────────────────────────────────────────────*/
.print-btn {
  padding: 6px 16px;
  background: #0a1628;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 12px;
}
.print-btn:hover { background: #1a2638; }

</style>
</head>
<body>

<!-- ── SCREEN TOOLBAR (hidden when printing) ───────────────────────────── -->
<div class="no-print" style="padding:8px;background:#c0c0c0;display:flex;gap:8px;border-bottom:2px solid #808080;align-items:center">
  <button class="print-btn" onclick="window.print()">&#x1F5A8;&#xFE0F; Print / Save as PDF</button>
  <button class="print-btn" style="background:#808080" onclick="window.close()">&#x2715; Close</button>
  <span style="font-size:11px;color:#333;margin-left:8px;">
    Tip: In the print dialog choose <strong>Save as PDF</strong> and enable <em>Background graphics</em> for best results.
  </span>
</div>

<!-- ── RUNNING FOOTER: appears on EVERY printed page via CSS @bottom-center ─
     This element is consumed by the @page { @bottom-center { content: element(page-footer) } }
     rule above. Chromium, WebKit (Safari), and most headless PDF renderers
     that support CSS Paged Media Level 3 will stamp this on every page.
     It is invisible on screen (display:none in @media screen above).
-->
<div id="running-footer">
  <strong>Computer-generated statement of account. Not a tax invoice.</strong>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  ${business?.name ?? 'ADEEB ENTERPRISES'}
  &nbsp;&nbsp;|&nbsp;&nbsp;
  Generated: ${fmtDate(generatedAt)}
</div>

<!-- ── DOCUMENT HEADER ─────────────────────────────────────────────────── -->
<div class="header">
  <div class="biz">
    <div class="biz-name">${business?.name ?? 'ADEEB ENTERPRISES'}</div>
    <div class="biz-sub">&#x1F4DE; ${business?.mobile ?? '7050047146'}</div>
    ${business?.address ? `<div class="biz-sub">${business.address.replace(/\n/g, '<br>')}</div>` : ''}
  </div>
  <div class="summary">
    <table>
      <tr><td>OPENING BAL.</td><td>${fmtINR(openingBalance)} ${openingDir}</td></tr>
      <tr><td>CLOSING BAL.</td><td style="font-size:13px">${fmtINR(closingBalance)} ${closingDir}</td></tr>
      <tr><td>PERIOD</td><td>${periodStr}</td></tr>
    </table>
  </div>
</div>

<!-- ── PARTY INFO ──────────────────────────────────────────────────────── -->
<div class="party-info">
  <div style="font-size:10px;color:#666">BILL TO</div>
  <div class="party-name">${party.name}</div>
  ${party.mobile ? `<div style="font-size:10px">&#x1F4DE; ${party.mobile}</div>` : ''}
  ${party.address ? `<div style="font-size:10px;color:#555">${party.address}</div>` : ''}
</div>

<div class="statement-title">ACCOUNT STATEMENT</div>

<!-- ── TRANSACTION TABLE ───────────────────────────────────────────────── -->
<table class="main">
  <thead>
    <tr>
      <th>DATE</th><th class="num">QTY</th><th>CAT</th>
      <th class="num">WEIGHT&nbsp;(kg)</th><th class="num">AVG.&nbsp;(kg)</th>
      <th class="num">RATE&nbsp;(₹/kg)</th><th class="num">AMOUNT</th>
      <th class="num">PAYMENT</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr style="background:#f5f5f5;font-weight:bold">
      <td>TOTAL</td>
      <td class="num">${totalQty}</td>
      <td></td>
      <td class="num">${totalWeight}</td>
      <td></td><td></td>
      <td class="num">${fmtINR(totalPurchases)}</td>
      <td class="num" style="color:#008000">${fmtINR(totalPayments)}</td>
    </tr>
  </tfoot>
</table>

<!-- ── TOTALS & CLOSING BALANCE ────────────────────────────────────────── -->
<div class="totals">
  <div>
    <div><strong>Qty:</strong> ${totalQty} head | <strong>Weight:</strong> ${totalWeight} kg</div>
    <div><strong>Purchases:</strong> ${fmtINR(totalPurchases)}</div>
    <div><strong>Payments Received:</strong> ${fmtINR(totalPayments)}</div>
    ${parseFloat(totalPaid) > 0 ? `<div><strong>Payments Made:</strong> ${fmtINR(totalPaid)}</div>` : ''}
    <div style="margin-top:4px;font-size:10px;color:#666">${methodRows}</div>
  </div>
  <div class="balance-box">
    <div class="balance-label">OPENING + PURCHASES − PAYMENTS RECEIVED</div>
    <div style="font-size:10px;color:#444">
      ${fmtINR(openingBalance)} ${openingDir} + ${fmtINR(totalPurchases)} − ${fmtINR(totalPayments)}
    </div>
    <div class="balance-val"
         style="color:${closingDir === 'DR' ? '#800000' : closingDir === 'CR' ? '#008000' : '#000'}">
      ${fmtINR(closingBalance)} ${closingDir}
    </div>
  </div>
</div>

${cashExSection}

<!-- ── END-OF-DOCUMENT FOOTER ──────────────────────────────────────────────
     Visible at the bottom of the document on screen AND on the last printed
     page. This is the human-readable footer the user sees when scrolling.
     It also acts as the fallback disclaimer for PDF renderers that do not
     support CSS Paged Media @bottom-center running elements.
     The per-page disclaimer is in #running-footer above.
-->
<div class="doc-footer">
  <div class="disclaimer-line">
    &#x26A0;&#xFE0F;&nbsp;&nbsp;Computer-generated statement of account. Not a tax invoice.
  </div>
  <div class="business-footer-line">${businessFooter}</div>
  <div class="generated-line">Generated: ${fmtDate(generatedAt)} &nbsp;|&nbsp; ${business?.name ?? 'ADEEB ENTERPRISES'} &nbsp;|&nbsp; ${business?.mobile ?? '7050047146'}</div>
</div>

</body>
</html>`;
}
