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
  totalQty: number;
  totalWeight: Decimal;
  catWeightMap?: Record<string, Decimal>;
  methodBreakdown?: Record<string, Decimal>;
}

function fmtNum(n: Decimal | number | string | null | undefined, dec = 0): string {
  if (n === null || n === undefined || n === '') return '0';
  const val = typeof n === 'object' && 'toNumber' in n ? (n as Decimal).toNumber() : Number(n);
  if (isNaN(val)) return '0';
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtDateShort(d: Date | string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const day = dt.getDate();
  const m = dt.toLocaleString('en-IN', { month: 'short' });
  const y = String(dt.getFullYear()).slice(-2);
  return `${day} ${m} '${y}`;
}

export async function generateStatementPdfBuffer(data: StatementData): Promise<Buffer> {
  const {
    business, party, purchases, payments,
    directCashExList = [],
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
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));
      const wmSize = 110;
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

  const periodText = from && to
    ? `${fmtDateShort(from)} — ${fmtDateShort(to)}`
    : 'All transactions';
  doc.text(`Period: ${periodText}`, margin, curY);

  // ── Top Right Stat Box (Balance & Totals) ──
  const statBoxWidth = 70;
  const statBoxX = pageWidth - margin - statBoxWidth;
  const statBoxY = 14;

  doc.setDrawColor(203, 213, 225); // #cbd5e1
  doc.setFillColor(255, 255, 255);
  doc.rect(statBoxX, statBoxY, statBoxWidth, 38, 'FD');

  const openDir = openingSigned.isPositive() && !openingSigned.isZero() ? 'DR' : openingSigned.isNegative() ? 'CR' : '';
  const closeDir = closingSigned.isPositive() && !closingSigned.isZero() ? 'DR' : closingSigned.isNegative() ? 'CR' : '';

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
  ];

  let sbY = statBoxY + 6;
  for (let i = 0; i < statRows.length; i++) {
    const row = statRows[i];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, statBoxX + 4, sbY);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 9.5 : 8.5);
    doc.setTextColor(row.bold ? 0 : 15, row.bold ? 0 : 23, row.bold ? 0 : 42);
    doc.text(row.val, statBoxX + statBoxWidth - 4, sbY, { align: 'right' });

    if (i < statRows.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(statBoxX, sbY + 3, statBoxX + statBoxWidth, sbY + 3);
      sbY += 8.5;
    }
  }

  // ── Combined Table Rows ──
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
      const notes = [p.notes, p.receiptNo ? `Rcpt ${p.receiptNo}` : ''].filter(Boolean).join(' · ');
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
      const mLabel = pay.method === 'CASH' ? 'Cash' : pay.method === 'AC' ? 'A/C' : pay.method === 'ADVANCE_JAMA' ? 'Adv Jama' : pay.method === 'CASH_EX' ? 'Cash EX' : pay.method;
      const notes = [mLabel, pay.notes, pay.bankRef].filter(Boolean).join(' · ');
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
      const notes = ['Direct Cash EX', cex.notes].filter(Boolean).join(' · ');
      const dateCell = notes ? `${fmtDateShort(cex.date)}\n${notes}` : fmtDateShort(cex.date);
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

  const startTableY = Math.max(curY + 6, statBoxY + 41);

  autoTable(doc, {
    startY: startTableY,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [[
      'Date',
      'Qty',
      'Cat',
      'Tot Wt (kg)',
      'Avg Wt (kg)',
      'Rate (Rs)',
      'Amount (Rs)',
      'Payment (Rs)',
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
      // Draw watermark on subsequent pages
      if (data.pageNumber > 1) {
        drawWatermark();
      }
    },
  });

  // ── Summary & Breakdown after table ──
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const remainingSpace = pageHeight - finalY;
  if (remainingSpace < 45) {
    doc.addPage();
    drawWatermark();
  }
  const summaryY = remainingSpace < 45 ? 16 : finalY;

  // Breakdown text (right aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const bcWt = catWeightMap['B/C'] ? fmtNum(catWeightMap['B/C'], 1) : '0.0';
  const scWt = catWeightMap['S/C'] ? fmtNum(catWeightMap['S/C'], 1) : '0.0';
  const loadsSummary = `Total Buffaloes: ${totalQty} | B/C: ${bcWt} kg | S/C: ${scWt} kg`;
  doc.text(loadsSummary, pageWidth - margin, summaryY, { align: 'right' });

  const methodsList: string[] = [];
  if (methodBreakdown['CASH']) methodsList.push(`Cash: Rs. ${fmtNum(methodBreakdown['CASH'], 0)}`);
  if (methodBreakdown['AC']) methodsList.push(`A/C: Rs. ${fmtNum(methodBreakdown['AC'], 0)}`);
  if (methodBreakdown['ADVANCE_JAMA']) methodsList.push(`Adv: Rs. ${fmtNum(methodBreakdown['ADVANCE_JAMA'], 0)}`);
  if (methodBreakdown['CASH_EX']) methodsList.push(`Cash EX: Rs. ${fmtNum(methodBreakdown['CASH_EX'], 0)}`);
  if (methodsList.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(methodsList.join(' · '), pageWidth - margin, summaryY + 4.5, { align: 'right' });
  }

  // Stamp badge image
  if (DISCLAIMER_STAMP_BASE64) {
    try {
      doc.addImage(DISCLAIMER_STAMP_BASE64, 'PNG', pageWidth - margin - 58, summaryY + 7, 58, 22, undefined, 'FAST');
    } catch {
      // fallback
    }
  }

  // Bottom Disclaimer on all pages
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
