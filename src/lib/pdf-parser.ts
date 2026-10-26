// ADEEB ENTERPRISES — PDF Statement Parser
// Extracts structured data from buffalo trading statement PDFs.
// Preserves original V/C values without silent mapping.

import crypto from 'crypto';

export interface ParsedRow {
  rowIndex: number;
  txType: 'PURCHASE' | 'PAYMENT' | 'UNKNOWN';
  date?: string;
  receiptNo?: string;
  qty?: number;
  category?: string;
  hasVc: boolean;
  totalWeight?: number;
  avgWeight?: number;
  rate?: number;
  amount?: number;
  paymentMethod?: string;
  paymentAmount?: number;
  warnings: string[];
}

export interface ParsedStatement {
  partyName?: string;
  periodFrom?: string;
  periodTo?: string;
  openingBalance?: number;
  openingDirection?: 'DR' | 'CR';
  closingBalance?: number;
  closingDirection?: 'DR' | 'CR';
  rows: ParsedRow[];
  warnings: string[];
  rawText: string;
  fileHash: string;
  arithmeticWarning?: string;
}

export function hashFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Parse a buffalo trading PDF statement.
 * Returns structured rows with warnings for ambiguous/missing data.
 * V/C category is preserved as-is (hasVc=true) — never silently mapped.
 */
export function parseStatementText(rawText: string, fileHash: string): ParsedStatement {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let rowIndex = 0;

  let partyName: string | undefined;
  let periodFrom: string | undefined;
  let periodTo: string | undefined;
  let openingBalance: number | undefined;
  let openingDirection: 'DR' | 'CR' | undefined;
  let closingBalance: number | undefined;
  let closingDirection: 'DR' | 'CR' | undefined;

  // ─── Extract party name ───────────────────
  for (const line of lines) {
    const billTo = lines[lines.indexOf(line) + 1];
    if (line.toUpperCase().includes('BILL TO') && billTo) {
      partyName = billTo.trim();
      break;
    }
  }

  // ─── Extract period ───────────────────────
  for (const line of lines) {
    const periodMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (periodMatch) {
      periodFrom = periodMatch[1];
      periodTo = periodMatch[2];
    }
    // e.g. "24 Oct -- 25 Oct 2026"
    const altPeriod = line.match(/(\d{1,2}\s+\w+)\s*[-–—]+\s*(\d{1,2}\s+\w+\s*\d{4})/i);
    if (altPeriod && !periodFrom) {
      // Keep original as display string
    }
  }

  // ─── Extract opening/closing balances ─────
  for (const line of lines) {
    const obMatch = line.match(/opening\s+bal[^\d]*([-]?[\d,]+\.?\d*)/i);
    if (obMatch) {
      const val = parseFloat(obMatch[1].replace(/,/g, ''));
      openingBalance = Math.abs(val);
      openingDirection = val < 0 ? 'CR' : 'DR';
    }
    const cbMatch = line.match(/closing\s+bal[^\d]*([-]?[\d,]+\.?\d*)/i);
    if (cbMatch) {
      const val = parseFloat(cbMatch[1].replace(/,/g, ''));
      closingBalance = Math.abs(val);
      closingDirection = val < 0 ? 'CR' : 'DR';
    }
  }

  // ─── Extract transaction rows ─────────────
  // Look for date patterns indicating a transaction row
  const datePattern = /^(\d{1,2}\s+\w{3,9}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i;
  const categoryPattern = /\b([BVS]\/C|B\/C|V\/C|S\/C)\b/i;
  const amountPattern = /[\d,]+\.\d{2}/g;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip header-like lines
    if (/^(DATE|QTY|CAT|WEIGHT|AVG|RATE|AMOUNT|PAYMENT|TOTAL)/i.test(line)) { i++; continue; }
    if (/^(BILL TO|OPENING|CLOSING|PERIOD|RECEIPT)/i.test(line)) { i++; continue; }

    if (datePattern.test(line)) {
      const rowWarnings: string[] = [];
      let txType: ParsedRow['txType'] = 'UNKNOWN';
      let qty: number | undefined;
      let category: string | undefined;
      let hasVc = false;
      let totalWeight: number | undefined;
      let avgWeight: number | undefined;
      let rate: number | undefined;
      let amount: number | undefined;
      let paymentMethod: string | undefined;
      let paymentAmount: number | undefined;
      let receiptNo: string | undefined;

      // Combine this line with next 2 lines (description often spans lines)
      const context = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');

      // Extract category
      const catMatch = context.match(/\b([BVS]\/C)\b/i);
      if (catMatch) {
        const raw = catMatch[1].toUpperCase();
        if (raw === 'V/C') {
          hasVc = true;
          category = 'VC_HISTORICAL';
          rowWarnings.push('V/C category detected — preserved from source. Please confirm mapping before import.');
        } else {
          category = raw === 'B/C' ? 'BC' : 'SC';
        }
        txType = 'PURCHASE';
      }

      // Extract qty (small number before category)
      const qtyMatch = context.match(/\b(\d{1,3})\s+[BVS]\/C/i);
      if (qtyMatch) qty = parseInt(qtyMatch[1]);

      // Extract weight values (e.g. 895.2, 149.20)
      const weightMatches = context.match(/\b(\d+\.\d{1,3})\b/g);
      if (weightMatches && weightMatches.length >= 1 && txType === 'PURCHASE') {
        totalWeight = parseFloat(weightMatches[0]);
        if (weightMatches.length >= 2) avgWeight = parseFloat(weightMatches[1]);
      }

      // Extract receipt number (e.g. "Receipt 46--50")
      const receiptMatch = context.match(/receipt\s*([\d\-–—]+)/i);
      if (receiptMatch) receiptNo = receiptMatch[1].replace(/[-–—]+/, '-');

      // Extract amount (large number, rightmost)
      const amounts = (context.match(/\b([\d,]+)\b/g) ?? [])
        .map(a => parseInt(a.replace(/,/g, '')))
        .filter(n => n > 1000);
      if (amounts.length > 0) {
        amount = amounts[amounts.length - 1];
        if (amounts.length > 1 && !rate) {
          rate = amounts[amounts.length - 2];
        }
      }

      // Detect payment rows (no category, has cash/A/C keyword)
      if (!catMatch) {
        const cashMatch = context.match(/\b(CASH|A\/C|ADVANCE\s+JAMA|CASH\s+EX)\b/i);
        if (cashMatch) {
          txType = 'PAYMENT';
          paymentMethod = cashMatch[1].toUpperCase().replace(/\s+/g, '_');
          const payAmts = (context.match(/[\d,]+/g) ?? [])
            .map(a => parseInt(a.replace(/,/g, '')))
            .filter(n => n > 100);
          if (payAmts.length > 0) paymentAmount = payAmts[payAmts.length - 1];
        }
      }

      // Warnings for missing fields
      if (txType === 'PURCHASE') {
        if (!qty) rowWarnings.push('Could not extract quantity.');
        if (!totalWeight) rowWarnings.push('Could not extract total weight.');
        if (!rate) rowWarnings.push('Could not extract rate.');
        if (!amount) rowWarnings.push('Could not extract amount.');
      }
      if (txType === 'UNKNOWN') {
        rowWarnings.push('Row type unclear — please review.');
      }

      if (txType !== 'UNKNOWN' || rowWarnings.length > 0) {
        rows.push({
          rowIndex: rowIndex++,
          txType,
          date: extractDate(line),
          receiptNo,
          qty,
          category,
          hasVc,
          totalWeight,
          avgWeight,
          rate,
          amount,
          paymentMethod,
          paymentAmount,
          warnings: rowWarnings,
        });
      }

      i += catMatch ? 2 : 1;
    } else {
      i++;
    }
  }

  // ─── Arithmetic validation ─────────────────
  let arithmeticWarning: string | undefined;
  if (openingBalance !== undefined && closingBalance !== undefined) {
    const totalPurchases = rows.filter(r => r.txType === 'PURCHASE').reduce((s, r) => s + (r.amount ?? 0), 0);
    const totalPayments = rows.filter(r => r.txType === 'PAYMENT').reduce((s, r) => s + (r.paymentAmount ?? 0), 0);

    const obSigned = openingDirection === 'CR' ? -openingBalance : openingBalance;
    const calculated = obSigned + totalPurchases - totalPayments;
    const reported = closingDirection === 'CR' ? -closingBalance : closingBalance;

    if (Math.abs(calculated - reported) > 1) {
      arithmeticWarning = `Arithmetic discrepancy: Opening(${obSigned.toFixed(2)}) + Purchases(${totalPurchases.toFixed(2)}) - Payments(${totalPayments.toFixed(2)}) = ${calculated.toFixed(2)}, but statement shows ${reported.toFixed(2)}. Difference: ${(calculated - reported).toFixed(2)}`;
      warnings.push(arithmeticWarning);
    }
  }

  if (rows.length === 0) {
    warnings.push('No transactions could be extracted. The PDF may be scanned. OCR fallback recommended.');
  }

  return {
    partyName,
    periodFrom,
    periodTo,
    openingBalance,
    openingDirection,
    closingBalance,
    closingDirection,
    rows,
    warnings,
    rawText,
    fileHash,
    arithmeticWarning,
  };
}

function extractDate(line: string): string | undefined {
  // Try YYYY-MM-DD
  const iso = line.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  // Try "24 Oct 2026"
  const full = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
  if (full) {
    const months: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    return `${full[3]}-${months[full[2]] ?? '01'}-${full[1].padStart(2, '0')}`;
  }

  // Try "24 Oct" — use current year
  const partial = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (partial) {
    const months: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const yr = new Date().getFullYear();
    return `${yr}-${months[partial[2]] ?? '01'}-${partial[1].padStart(2, '0')}`;
  }

  return undefined;
}
