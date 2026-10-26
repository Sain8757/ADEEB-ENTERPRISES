// ADEEB ENTERPRISES — Account Statement PDF Generator API
// Generates statement exactly matching the reference design layout.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';
import { ADEEB_LOGO_BASE64 } from '@/lib/logo';
import { DISCLAIMER_STAMP_BASE64 } from '@/lib/stamp';

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

  function parseDate(s: string | null, endOfDay = false): Date | undefined {
    if (!s || s.trim() === '' || s === 'null' || s === 'undefined') return undefined;
    const d = new Date(s);
    if (isNaN(d.getTime())) return undefined;
    if (endOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }
  const fromDate = parseDate(from, false);
  const toDate = parseDate(to, true);

  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

  const business = await prisma.business.findFirst();

  // ── Prior transactions before fromDate (to compute exact starting balance) ──
  let priorPurchasesTotal = new Decimal(0);
  let priorPaymentsReceivedTotal = new Decimal(0);
  let priorPaymentsPaidTotal = new Decimal(0);

  if (fromDate) {
    const [priorPurchases, priorPayments] = await Promise.all([
      prisma.purchaseEntry.findMany({
        where: { partyId, reversed: false, date: { lt: fromDate } },
        select: { amount: true },
      }),
      prisma.payment.findMany({
        where: { partyId, reversed: false, date: { lt: fromDate } },
        select: { amount: true, direction: true },
      }),
    ]);
    for (const p of priorPurchases) {
      priorPurchasesTotal = priorPurchasesTotal.plus(new Decimal(p.amount.toString()));
    }
    for (const pm of priorPayments) {
      if (pm.direction === 'RECEIVED') {
        priorPaymentsReceivedTotal = priorPaymentsReceivedTotal.plus(new Decimal(pm.amount.toString()));
      } else {
        priorPaymentsPaidTotal = priorPaymentsPaidTotal.plus(new Decimal(pm.amount.toString()));
      }
    }
  }

  const [purchases, payments, directCashExList] = await Promise.all([
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
    prisma.cashExExpense.findMany({
      where: {
        partyId,
        reversed: false,
        paymentId: null, // standalone cash ex not tied to a payment
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  // ── Calculations ────────────────────────────────────────────────────────────
  const initialOpeningBalance = new Decimal(party.openingBalance.toString());
  const initialOpeningSigned = party.openingBalanceDirection === 'DR'
    ? initialOpeningBalance
    : initialOpeningBalance.neg();

  // Opening balance as of fromDate:
  const openingSigned = initialOpeningSigned
    .plus(priorPurchasesTotal)
    .minus(priorPaymentsReceivedTotal)
    .plus(priorPaymentsPaidTotal);

  const totalPurchases = purchases.reduce(
    (s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0)
  );
  const directCashExTotal = directCashExList.reduce((s, c) => {
    return s.plus(new Decimal(c.expenseAmount.toString()));
  }, new Decimal(0));

  const totalPayments = payments
    .filter(p => p.direction === 'RECEIVED')
    .reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0))
    .plus(directCashExTotal);
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
  const closingSigned = openingSigned.plus(totalPurchases).minus(totalPayments).plus(totalPaid);

  const paymentCashExTotal = payments.reduce((s, p) => {
    return p.cashExExpense ? s.plus(new Decimal(p.cashExExpense.expenseAmount.toString())) : s;
  }, new Decimal(0));
  const totalCashEx = paymentCashExTotal.plus(directCashExTotal);

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'adeeb-enterprises.vercel.app';
  const protocol = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');

  const statementHtml = generateStatementHtml({
    business,
    party,
    purchases,
    payments,
    directCashExList,
    directCashExTotal,
    totalCashEx,
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
    host,
    protocol,
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
    directCashExList = [], directCashExTotal = new Decimal(0), totalCashEx = new Decimal(0),
    from, to,
    openingSigned, closingSigned,
    totalPurchases, totalPayments,
    totalQty, totalWeight,
    catWeightMap, methodBreakdown,
    host = 'adeeb-enterprises.vercel.app',
    protocol = 'https',
  } = data;

  const DISCLAIMER = 'Computer-generated statement of account. Not a tax invoice.';

  // Build sorted combined rows (Purchases, Payments, and direct Cash EX)
  type Row = { date: Date; kind: 'PURCHASE' | 'PAYMENT' | 'CASHEX'; p?: any; pay?: any; cex?: any };
  const allRows: Row[] = [
    ...purchases.map((p: any) => ({ date: p.date, kind: 'PURCHASE' as const, p })),
    ...payments.map((p: any) => ({ date: p.date, kind: 'PAYMENT' as const, pay: p })),
    ...directCashExList.map((c: any) => ({ date: c.date, kind: 'CASHEX' as const, cex: c })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Extract receipt numbers
  const receiptNos = purchases
    .map((p: any) => p.receiptNo)
    .filter((r: any) => !!r);
  const uniqueReceipts = Array.from(new Set(receiptNos)).join(',');

  // Build table body rows
  const tableRows = allRows.map(row => {
    if (row.kind === 'PURCHASE') {
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
    } else if (row.kind === 'PAYMENT') {
      const pay = row.pay;
      if (pay.direction !== 'RECEIVED') return '';

      const methodLabels: Record<string, string> = {
        CASH: 'Cash',
        AC: 'A/C',
        ADVANCE_JAMA: 'Advance Jama',
        CASH_EX: 'Cash EX',
      };
      const mLabel = methodLabels[pay.method] ?? (pay.method === 'CASH_EX' ? 'Cash EX' : pay.method);

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
    } else {
      // Standalone Cash EX row
      const cex = row.cex;
      const sub = cex.overrideReason ? `Cash EX · ${cex.overrideReason}` : 'Cash EX';
      return `<tr>
        <td class="col-date">
          <div class="main-date">${fmtDateShort(cex.date)}</div>
          <div class="sub-text">${sub}</div>
        </td>
        <td class="col-qty"></td>
        <td class="col-cat"></td>
        <td class="col-weight"></td>
        <td class="col-avg"></td>
        <td class="col-rate"></td>
        <td class="col-amount"></td>
        <td class="col-payment green-val">${fmtNum(cex.expenseAmount, 0)}</td>
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
    ADVANCE_JAMA: 'Advance Jama',
    CASH_EX: 'Cash EX',
  };
  const methodParts = Object.entries(methodBreakdown).map(
    ([m, val]) => `${methodLabels[m] ?? m} ${fmtNum(val as Decimal, 0)}`
  );
  if (directCashExTotal && directCashExTotal.gt(0) && !methodBreakdown['CASH_EX']) {
    methodParts.push(`Cash EX ${fmtNum(directCashExTotal, 0)}`);
  }
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

  // Phone formatting with India country code 91 for direct WhatsApp API routing
  const rawMobile = party.mobile ? String(party.mobile).replace(/[^0-9]/g, '') : '';
  const whatsappPhone = rawMobile.length === 10
    ? `91${rawMobile}`
    : rawMobile.length === 12 && rawMobile.startsWith('91')
      ? rawMobile
      : rawMobile.startsWith('0') && rawMobile.length === 11
        ? `91${rawMobile.slice(1)}`
        : rawMobile;

  const statementUrl = `${protocol}://${host}/api/statement/${party.id}/pdf${from || to ? `?from=${from || ''}&to=${to || ''}` : ''}`;

  const whatsappText = `*${business?.name ?? 'ADEEB ENTERPRISES'}*\n*Hisab Statement — ${party.name}*\nPeriod: ${periodBoxStr}\n---------------------------------\nKharid (Purchases): ₹${fmtNum(totalPurchases, 0)} (${totalQty} Buffaloes, ${fmtNum(totalWeight, 1)} kg)\nJama (Payments): ₹${fmtNum(totalPayments, 0)}\n*Net Balance: ${fmtBalWithSymbol(closingSigned)}*\n---------------------------------\n📄 Online Statement PDF:\n${statementUrl}\n\nComputer-generated statement.`;

  const whatsappDirectUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappText)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`;
  const safePartyName = (party.name || 'Party').replace(/'/g, "\\'").replace(/"/g, '\\"');
  const pdfFilename = `${(party.name || 'Statement').replace(/[^a-zA-Z0-9]/g, '_')}_Statement.pdf`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"/>
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
  background: #f8fafc;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

/* Document Container */
#statement-doc {
  position: relative;
  background: #ffffff;
  min-height: 100%;
  padding: 24px 28px;
  box-sizing: border-box;
}

/* Screen toolbar */
.no-print {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  background: #0f172a;
  color: #ffffff;
  border-bottom: 1px solid #1e293b;
  position: sticky;
  top: 0;
  z-index: 9999;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15);
}
.print-btn {
  padding: 8px 14px;
  background: #1e293b;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition: all 0.15s ease;
}
.print-btn:hover { background: #334155; }
.close-btn {
  padding: 8px 14px;
  background: #334155;
  color: #f1f5f9;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.close-btn:hover { background: #475569; }

/* Header Section */
.header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 6px;
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

/* Center Background Watermark - Pure Round Circle */
.watermark-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-width: 65vw;
  height: 420px;
  max-height: 65vh;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
  user-select: none;
  -webkit-user-select: none;
}

.watermark-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  clip-path: circle(50% at 50% 50%);
  opacity: 0.08; /* Soft & subtle watermark: round circular emblem is clearly visible, zero square edges! */
}

/* Ensure all statement content sits cleanly on top of watermark */
.header-wrapper,
table.statement-table,
.summary-container,
.doc-footer {
  position: relative;
  z-index: 1;
}

table.statement-table tbody td {
  background: transparent;
}

@media print {
  body { background: #ffffff !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .no-print { display: none !important; }
  #statement-doc { padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
  table.statement-table tr { page-break-inside: avoid; }
  .summary-container { page-break-inside: avoid; }
  .doc-footer { page-break-inside: avoid; }
  .watermark-container {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    overflow: hidden;
  }
  .watermark-logo {
    border-radius: 50%;
    clip-path: circle(50% at 50% 50%);
    opacity: 0.08 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}

@media screen {
  #running-footer { display: none; }
  #statement-doc {
    max-width: 860px;
    margin: 20px auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
}

@media screen and (max-width: 640px) {
  #statement-doc {
    margin: 8px auto;
    padding: 14px 10px;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
  .header-wrapper {
    flex-direction: column;
    gap: 14px;
  }
  .stat-box {
    width: 100%;
  }
  .formula-row {
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
}

</style>
<script src="/html2pdf.bundle.min.js"></script>
<script>
const filename = '${pdfFilename}';
const partyName = '${safePartyName}';
const whatsappPhone = '${whatsappPhone}';
const whatsappDirectUrl = "${whatsappDirectUrl.replace(/"/g, '\\"')}";

async function generatePdfBlob() {
  const element = document.getElementById('statement-doc');
  if (!window.html2pdf) {
    throw new Error('PDF generator bundle not ready');
  }
  const opt = {
    margin: [8, 10, 12, 10],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 1.8,
      windowWidth: 1024,
      useCORS: true,
      letterRendering: true,
      backgroundColor: '#ffffff',
      scrollY: 0,
      logging: false,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  return await html2pdf().set(opt).from(element).outputPdf('blob');
}

async function downloadPdfFile() {
  const btn = document.getElementById('btn-download');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Generating PDF...'; btn.disabled = true; }

  try {
    const blob = await generatePdfBlob();
    const file = new File([blob], filename, { type: 'application/pdf' });

    // On mobile (iOS Safari / Android Chrome):
    // Use Web Share API if supported so user gets native "Save to Files", "WhatsApp", "Drive"
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: filename,
          files: [file]
        });
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
      }
    }

    // Standard download fallback
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 200);

    // On iOS Safari where synthetic download is ignored, open in browser reader
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      window.location.href = blobUrl;
    }
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('PDF creation direct error. Opening system print/save instead.');
    window.print();
  } finally {
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}

async function shareWhatsAppPdf() {
  const btn = document.getElementById('btn-whatsapp');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Attaching PDF...'; btn.disabled = true; }

  try {
    const blob = await generatePdfBlob();
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      // NOTE: Passing ONLY files (without conflicting text) ensures WhatsApp on iOS & Android
      // opens the attachment picker with the PDF file directly attached!
      await navigator.share({
        files: [file]
      });
    } else {
      // Browser without file share: Download PDF and open party WhatsApp
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.location.href = whatsappDirectUrl;
      }, 300);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('WhatsApp share error:', err);
      window.location.href = whatsappDirectUrl;
    }
  } finally {
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
  }
}
</script>
</head>
<body>

<div class="no-print">
  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
    <button id="btn-download" class="print-btn" style="background:#15803d; border-color:#16a34a;" onclick="downloadPdfFile()">📥 Download PDF</button>
    <button class="print-btn" style="background:#2563eb; border-color:#3b82f6;" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button id="btn-whatsapp" class="print-btn" style="background:#25D366; color:#0f172a; border-color:#22c55e;" onclick="shareWhatsAppPdf()">💬 Send PDF on WhatsApp</button>
    ${whatsappPhone ? `<a href="${whatsappDirectUrl}" target="_blank" rel="noreferrer" class="print-btn" style="background:#075e54; color:#fff; text-decoration:none;">📲 Chat with Party (${whatsappPhone})</a>` : ''}
    <button class="close-btn" onclick="window.close()">✕ Close</button>
  </div>
  <form method="GET" style="display:inline-flex; align-items:center; gap:6px; font-size:11px; flex-wrap:wrap;">
    <label style="color:#cbd5e1;"><strong>From:</strong></label>
    <input type="date" name="from" value="${from ?? ''}" style="padding:4px 6px; border:1px solid #475569; background:#1e293b; color:#fff; border-radius:4px; font-size:11px;">
    <label style="color:#cbd5e1;"><strong>To:</strong></label>
    <input type="date" name="to" value="${to ?? ''}" style="padding:4px 6px; border:1px solid #475569; background:#1e293b; color:#fff; border-radius:4px; font-size:11px;">
    <button type="submit" class="print-btn" style="background:#0284c7; border-color:#38bdf8; padding:5px 12px;">🔍 Apply Date</button>
    ${from || to ? `<a href="/api/statement/${party.id}/pdf" style="font-size:11px; color:#94a3b8; margin-left:4px; text-decoration:underline;">All Dates</a>` : ''}
  </form>
</div>

<div id="running-footer">
  Computer-generated statement of account. Not a tax invoice.
</div>

<div id="statement-doc">
  <!-- Center Background Watermark (100% round circle emblem with soft delicate opacity) -->
  <div class="watermark-container">
    <img src="${ADEEB_LOGO_BASE64}" class="watermark-logo" alt="Watermark" />
  </div>

  <!-- Header -->
  <div class="header-wrapper">
    <div class="header-left">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <img src="${ADEEB_LOGO_BASE64}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1.5px solid #d4af37; box-shadow: 0 1px 4px rgba(0,0,0,0.2);" alt="Logo" />
        <div>
          <div class="biz-name">${business?.name ?? 'ADEEB ENTERPRISES'}</div>
          <div class="biz-phone">${business?.mobile ?? '7050047146'}</div>
        </div>
      </div>

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

  <!-- Official Stamp Disclaimer Seal (Replacing plain text) -->
  <div class="doc-footer" style="margin-top: 26px; text-align: center; page-break-inside: avoid;">
    <img
      src="${DISCLAIMER_STAMP_BASE64}"
      class="stamp-disclaimer-img"
      alt="Computer-generated statement of account. Not a tax invoice."
      style="width: 250px; max-width: 80%; height: auto; display: inline-block; transform: rotate(-1.5deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));"
    />
    <div class="disclaimer-line" style="display: none;">Computer-generated statement of account. Not a tax invoice.</div>
  </div>
</div>

</body>
</html>`;
}
