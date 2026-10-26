// ADEEB ENTERPRISES — Import Confirm API
// Saves the user-reviewed and confirmed rows to the database.
// This is the ONLY way transactions from imports get saved.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createPurchaseEntry, createPaymentEntry } from '@/lib/ledger';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { batchId, rows } = await req.json();

  if (!batchId) return NextResponse.json({ error: 'Missing batchId.' }, { status: 400 });
  if (!Array.isArray(rows)) return NextResponse.json({ error: 'Missing rows.' }, { status: 400 });

  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return NextResponse.json({ error: 'Import batch not found.' }, { status: 404 });
  if (batch.status === 'CONFIRMED') return NextResponse.json({ error: 'This batch has already been confirmed.' }, { status: 409 });
  if (!batch.partyId) return NextResponse.json({ error: 'No party associated with this import batch.' }, { status: 400 });

  // Check for unconfirmed V/C rows
  const unconfirmedVc = rows.filter((r: any) => r.hasVc && !r.vcMappingConfirmed);
  if (unconfirmedVc.length > 0) {
    return NextResponse.json({
      error: `${unconfirmedVc.length} row(s) have V/C category that must be confirmed before import.`,
    }, { status: 400 });
  }

  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Get business Cash EX config
  const business = await prisma.business.findFirst();
  const cashExRateConfig = business ? {
    rate: Number(business.cashExRate),
    basis: Number(business.cashExBasis),
  } : undefined;

  for (const row of rows) {
    try {
      if (row.txType === 'PURCHASE') {
        if (!row.date || !row.qty || !row.totalWeight || !row.rate) {
          errors.push(`Row ${row.rowIndex + 1}: Missing required purchase fields (date, qty, weight, rate).`);
          skipped++;
          continue;
        }

        // Determine final category
        let category: 'BC' | 'SC' | 'VC_HISTORICAL';
        if (row.hasVc) {
          // User confirmed a mapping
          if (row.category === 'BC') category = 'BC';
          else if (row.category === 'SC') category = 'SC';
          else category = 'VC_HISTORICAL'; // preserve original
        } else {
          category = row.category === 'BC' ? 'BC' : 'SC';
        }

        // Check for duplicate (same receipt, party, date)
        if (row.receiptNo) {
          const dup = await prisma.purchaseEntry.findFirst({
            where: {
              partyId: batch.partyId!,
              receiptNo: row.receiptNo,
              date: new Date(row.date),
              reversed: false,
            },
          });
          if (dup) {
            errors.push(`Row ${row.rowIndex + 1}: Duplicate receipt ${row.receiptNo} already exists. Skipped.`);
            skipped++;

            await prisma.importTransaction.updateMany({
              where: { batchId, rowIndex: row.rowIndex },
              data: { status: 'DUPLICATE', savedTxId: dup.id },
            });
            continue;
          }
        }

        const entry = await createPurchaseEntry({
          date: new Date(row.date),
          partyId: batch.partyId!,
          receiptNo: row.receiptNo,
          qty: row.qty,
          category,
          totalWeight: String(row.totalWeight),
          rate: String(row.rate),
          notes: row.hasVc && row.category !== 'VC_HISTORICAL'
            ? `Imported from PDF. Original category: V/C. Mapped to ${row.category} by ${user.email ?? 'user'}.`
            : 'Imported from PDF.',
          userId: user.id,
          importBatchId: batchId,
        });

        await prisma.importTransaction.updateMany({
          where: { batchId, rowIndex: row.rowIndex },
          data: {
            status: 'CONFIRMED',
            savedTxId: entry.id,
            savedTxType: 'PURCHASE',
            correctedData: JSON.stringify(row),
            vcMapping: row.hasVc ? (row.category ?? 'VC_HISTORICAL') : null,
          },
        });

        // Audit V/C mapping
        if (row.hasVc && row.category && row.category !== 'VC_HISTORICAL') {
          await audit({
            userId: user.id,
            userEmail: user.email ?? undefined,
            action: AUDIT_ACTIONS.VC_MAP,
            entity: 'PurchaseEntry',
            entityId: entry.id,
            note: `V/C mapped to ${row.category} during import. Receipt: ${row.receiptNo ?? 'N/A'}. Batch: ${batchId}.`,
          });
        }

        saved++;

      } else if (row.txType === 'PAYMENT') {
        if (!row.date || !row.paymentAmount || !row.paymentMethod) {
          errors.push(`Row ${row.rowIndex + 1}: Missing required payment fields.`);
          skipped++;
          continue;
        }

        // Note: imported historical Cash EX is NOT automatically calculated
        // Historical Cash EX preserves original values as PAYMENT record
        // The new Cash EX expense rule applies only to NEW entries going forward
        const result = await createPaymentEntry({
          date: new Date(row.date),
          partyId: batch.partyId!,
          direction: 'RECEIVED',
          method: row.paymentMethod === 'CASH_EX' ? 'CASH_EX_HISTORICAL' : row.paymentMethod,
          amount: String(row.paymentAmount),
          notes: 'Imported from PDF.',
          userId: user.id,
          importBatchId: batchId,
          // Historical imports do NOT auto-generate Cash EX expenses
          // cashExRateConfig: undefined  — intentionally not passed for imports
        });

        await prisma.importTransaction.updateMany({
          where: { batchId, rowIndex: row.rowIndex },
          data: {
            status: 'CONFIRMED',
            savedTxId: result.payment.id,
            savedTxType: 'PAYMENT',
            correctedData: JSON.stringify(row),
          },
        });

        saved++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push(`Row ${row.rowIndex + 1}: ${err.message ?? 'Unknown error'}`);
      skipped++;
    }
  }

  // Mark batch as confirmed
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: errors.length > 0 && saved === 0 ? 'REJECTED' : 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedById: user.id,
    },
  });

  await audit({
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: AUDIT_ACTIONS.IMPORT_CONFIRM,
    entity: 'ImportBatch',
    entityId: batchId,
    note: `Saved: ${saved}, Skipped: ${skipped}, Errors: ${errors.length}`,
  });

  return NextResponse.json({ saved, skipped, errors, batchId });
}
