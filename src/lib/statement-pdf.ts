import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Decimal from 'decimal.js';
import { ADEEB_LOGO_BASE64 } from './logo';
import { DISCLAIMER_STAMP_BASE64 } from './stamp';

interface StatementData {
  business: any;
  party: any;
  purchases: any[];
  payments: any[];
  directCashExList?: any[];
  directCashExTotal?: Decimal;
  totalCashEx?: Decimal;
  from?: string | null;
  to?: string | null;
  openingSigned: Decimal;
  closingSigned: Decimal;
  totalPurchases: Decimal;
  totalPayments: Decimal;
  totalPaid?: Decimal;
  totalQty: number;
  totalWeight: Decimal;
  catWeightMap?: Record<string, Decimal>;
  methodBreakdown?: Record<string, Decimal>;
}

function fmtNum(v: Decimal | string | number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || v === '') return '0';
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

function fmtBalFullDecimal(v: Decimal): string {
  const isNeg = v.isNegative();
  const numStr = fmtNum(v.abs(), 2);
  return isNeg ? `-Rs. ${numStr}` : `Rs. ${numStr}`;
}

function fmtDateShort(d: Date | string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const day = dt.getDate();
  const m = dt.toLocaleString('en-IN', { month: 'short' });
  return `${day} ${m}`;
}

function fmtIsoDate(d: Date | string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export async function generateStatementPdfBuffer(data: StatementData): Promise<Buffer> {
  const {
    business, party, purchases, payments,
    directCashExList = [],
    directCashExTotal = new Decimal(0),
    from, to,
    openingSigned, closingSigned,
    totalPurchases, totalPayments,
    totalQty, totalWeight,
    catWeightMap = {}, methodBreakdown = {},
  } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 12; // 12mm left & right

  // Helper to draw watermark
  function drawWatermark() {
    if (!ADEEB_LOGO_BASE64) return;
    try {
      (doc as any).saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.08 }));
      const wmSize = 105;
      const wmX = (pageWidth - wmSize) / 2;
      const wmY = (pageHeight - wmSize) / 2;
      doc.addImage(ADEEB_LOGO_BASE64, 'PNG', wmX, wmY, wmSize, wmSize, undefined, 'FAST');
      (doc as any).restoreGraphicsState();
    } catch {
      // ignore
    }
  }

  // Draw on first page
  drawWatermark();

  // ── Header Left: Logo + Business Info ──
  let curY = 14;
  if (ADEEB_LOGO_BASE64) {
    try {
      doc.addImage(ADEEB_LOGO_BASE64, 'PNG', margin, curY, 14, 14, undefined, 'FAST');
    } catch {
      // ignore
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text(business?.name ?? 'ADEEB ENTERPRISES', margin + 17, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(business?.mobile ?? '7050047146', margin + 17, curY + 11.5);

  // ── Bill To: Party Info ──
  curY += 21;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('BILL TO', margin, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text((party.name ?? 'Party').toUpperCase(), margin, curY);

  curY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const receiptNos = purchases.map((p: any) => p.receiptNo).filter(Boolean);
  const uniqueReceipts = Array.from(new Set(receiptNos)).join(', ');
  if (uniqueReceipts) {
    doc.text(`Receipt no.: ${uniqueReceipts}`, margin, curY);
    curY += 4;
  }

  const periodSubStr = from && to 
    ? `${fmtIsoDate(from)} to ${fmtIsoDate(to)}`
    : purchases.length > 0
      ? `${fmtIsoDate(purchases[0].date)} to ${fmtIsoDate(purchases[purchases.length - 1].date)}`
      : 'All dates';
  doc.text(`Period: ${periodSubStr}`, margin, curY);

  // ── Top Right Stat Box (Exact Match to HTML) ──
  const statBoxWidth = 72;
  const statBoxX = pageWidth - margin - statBoxWidth;
  const statBoxY = 14;

  doc.setDrawColor(203, 213, 225); // #cbd5e1
  doc.setFillColor(255, 255, 255);
  doc.rect(statBoxX, statBoxY, statBoxWidth, 42, 'FD');

  const openDir = openingSigned.isPositive() && !openingSigned.isZero() ? 'DR' : openingSigned.isNegative() ? 'CR' : '';
  const closeDir = closingSigned.isPositive() && !closingSigned.isZero() ? 'DR' : closingSigned.isNegative() ? 'CR' : '';
  const periodBoxStr = fmtDateRange(from, to, purchases);

  const statRows = [
    {
      label: 'OPENING BALANCE',
      val: `Rs. ${fmtNum(openingSigned.abs(), 0)} ${openDir}`,
      bold: false,
    },
    { label: 'PERIOD KHARID (+)', val: `Rs. ${fmtNum(totalPurchases, 0)}`, bold: false },
    { label: 'PERIOD JAMA (-)', val: `Rs. ${fmtNum(totalPayments, 0)}`, bold: false },
    {
      label: 'CLOSING BALANCE',
      val: `Rs. ${fmtNum(closingSigned.abs(), 0)} ${closeDir}`,
      bold: true,
    },
    {
      label: 'PERIOD',
      val: periodBoxStr,
      bold: false,
      isPeriod: true,
    },
  ];

  let sbY = statBoxY + 5.5;
  for (let i = 0; i < statRows.length; i++) {
    const row = statRows[i];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, statBoxX + 3.5, sbY);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 9.5 : (row as any).isPeriod ? 7.5 : 8);
    doc.setTextColor(row.bold ? 0 : 15, row.bold ? 0 : 23, row.bold ? 0 : 42);
    doc.text(row.val, statBoxX + statBoxWidth - 3.5, sbY, { align: 'right' });

    if (i < statRows.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(statBoxX, sbY + 2.5, statBoxX + statBoxWidth, sbY + 2.5);
      sbY += 7.5;
    }
  }

  // ── Combined Table Rows (Exact Match to HTML) ──
  type RowItem = { date: Date; kind: 'PURCHASE' | 'PAYMENT' | 'CASHEX'; p?: any; pay?: any; cex?: any };
  const allRows: RowItem[] = [
    ...purchases.map((p: any) => ({ date: p.date, kind: 'PURCHASE' as const, p })),
    ...payments.map((p: any) => ({ date: p.date, kind: 'PAYMENT' as const, pay: p })),
    ...directCashExList.map((c: any) => ({ date: c.date, kind: 'CASHEX' as const, cex: c })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const tableBody = allRows.map((r) => {
    if (r.kind === 'PURCHASE') {
      const p = r.p;
      const cat = p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : p.category === 'VC_HISTORICAL' ? 'V/C' : '';
      const subParts: string[] = [];
      if (p.notes) subParts.push(p.notes);
      if (p.receiptNo) subParts.push(`Receipt ${p.receiptNo}`);
      const notes = subParts.join(' · ');
      const dateCell = notes ? `${fmtDateShort(p.date)}\n${notes}` : fmtDateShort(p.date);
      return [
        dateCell,
        String(p.qty || ''),
        cat,
        fmtNum(p.totalWeight, 1),
        fmtNum(p.avgWeight, 2),
        fmtNum(p.rate, 0),
        fmtNum(p.amount, 0),
        '',
      ];
    } else if (r.kind === 'PAYMENT') {
      const pay = r.pay;
      if (pay.direction !== 'RECEIVED') return null;
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
      const notes = subParts.join(' · ');
      const dateCell = notes ? `${fmtDateShort(pay.date)}\n${notes}` : fmtDateShort(pay.date);
      return [
        dateCell,
        '',
        '',
        '',
        '',
        '',
        '',
        fmtNum(pay.amount, 0),
      ];
    } else if (r.kind === 'CASHEX') {
      const cex = r.cex;
      const sub = cex.overrideReason ? `Cash EX · ${cex.overrideReason}` : 'Cash EX';
      const dateCell = `${fmtDateShort(cex.date)}\n${sub}`;
      return [
        dateCell,
        '',
        '',
        '',
        '',
        '',
        '',
        fmtNum(cex.expenseAmount, 0),
      ];
    }
    return null;
  }).filter(Boolean) as string[][];

  // Table Footer
  const tableFoot = [[
    'TOTAL',
    String(totalQty),
    '',
    fmtNum(totalWeight, 1),
    '',
    '',
    fmtNum(totalPurchases, 0),
    fmtNum(totalPayments, 0),
  ]];

  const startTableY = Math.max(curY + 6, statBoxY + 45);

  autoTable(doc, {
    startY: startTableY,
    margin: { left: margin, right: margin, bottom: 20 },
    head: [[
      'DATE',
      'QTY',
      'CAT',
      'TOT WT',
      'AVG WT',
      'RATE',
      'AMOUNT',
      'PAYMENT',
    ]],
    body: tableBody,
    foot: tableFoot,
    theme: 'grid',
    headStyles: {
      fillColor: [226, 232, 240], // #e2e8f0
      textColor: [51, 65, 85], // #334155
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 44, halign: 'left' },
      1: { cellWidth: 12, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
      cellPadding: 2,
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [0, 0, 0],
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: 2.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawWatermark();
      }
    },
  });

  // ── Bottom Summary Section (100% Exact Match to HTML) ──
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const remainingSpace = pageHeight - finalY;
  if (remainingSpace < 55) {
    doc.addPage();
    drawWatermark();
  }
  let summaryY = remainingSpace < 55 ? 16 : finalY;

  // Formula Row Math
  const openingSignPrefix = openingSigned.isNegative() ? '-' : '';
  const openingFormulaStr = `${openingSignPrefix}${fmtNum(openingSigned.abs(), 2)}`;
  const purchasesFormulaStr = fmtNum(totalPurchases, 2);
  const paymentsFormulaStr = fmtNum(totalPayments, 2);
  const closingResultStr = fmtBalFullDecimal(closingSigned);

  // 1. FORMULA ROW
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const formulaLabel = 'OPENING + AMOUNT - PAYMENT';
  doc.text(formulaLabel, pageWidth - margin - 85, summaryY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const formulaMath = `${openingFormulaStr} + ${purchasesFormulaStr} - ${paymentsFormulaStr} =`;
  doc.text(formulaMath, pageWidth - margin - 35, summaryY, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(closingResultStr, pageWidth - margin, summaryY, { align: 'right' });

  summaryY += 5;

  // 2. LOADS BREAKDOWN LINE
  // Exact format: Closing balance · X loads · Y total · B/C Z
  const loadCount = purchases.length;
  const catParts = Object.entries(catWeightMap).map(([c, w]) => `${c} ${fmtNum(w as Decimal, 1)}`);
  const loadsLine = `Closing balance · ${loadCount} loads · ${fmtNum(totalWeight, 1)} total${catParts.length > 0 ? ' · ' + catParts.join(' · ') : ''}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(loadsLine, pageWidth - margin, summaryY, { align: 'right' });

  summaryY += 4.5;

  // 3. PAYMENT METHODS BREAKDOWN LINE
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

  if (methodsLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(methodsLine, pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 4.5;
  }

  // 4. APP FOOTER NOTE
  const footerNote = business?.statementFooter ?? 'Amounts you record. Not calculated, filed or verified by this app.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(footerNote, pageWidth - margin, summaryY, { align: 'right' });

  summaryY += 8;

  // ── Official Disclaimer Rubber Stamp (Centered at bottom) ──
  if (DISCLAIMER_STAMP_BASE64) {
    try {
      const stampWidth = 62;
      const stampHeight = 22;
      const stampX = (pageWidth - stampWidth) / 2;
      doc.addImage(DISCLAIMER_STAMP_BASE64, 'PNG', stampX, summaryY, stampWidth, stampHeight, undefined, 'FAST');
    } catch {
      // fallback
    }
  }

  // ── Running Page Disclaimer at the absolute bottom of all pages ──
  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const footerText = totalPages > 1
      ? `Computer-generated statement of account. Not a tax invoice. • ADEEB ENTERPRISES • Page ${p} of ${totalPages}`
      : 'Computer-generated statement of account. Not a tax invoice. • ADEEB ENTERPRISES';
    doc.text(footerText, pageWidth / 2, pageHeight - 7, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
