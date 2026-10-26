// ADEEB ENTERPRISES — PDF Upload & Extract API
// Accepts PDF, extracts text, returns parsed rows for review.
// NEVER saves data — that requires explicit /api/import/confirm call.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hashFile, parseStatementText } from '@/lib/pdf-parser';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

// Dynamic import for pdf-parse (CommonJS)
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const partyId = formData.get('partyId') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!partyId) return NextResponse.json({ error: 'No party selected.' }, { status: 400 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files accepted.' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 400 });

  // Verify party exists
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ error: 'Party not found.' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = hashFile(buffer);

  // Check for duplicate import
  const existing = await prisma.importBatch.findUnique({ where: { fileHash } });
  if (existing && existing.status === 'CONFIRMED') {
    return NextResponse.json({
      error: `This document was already imported on ${new Date(existing.uploadedAt).toLocaleDateString('en-IN')} (Batch ID: ${existing.id}). Re-import is blocked to prevent duplicates. If you need to re-import, contact an administrator.`,
    }, { status: 409 });
  }

  // Save file temporarily (private storage)
  const uploadDir = path.join(process.cwd(), 'uploads', 'statements');
  await mkdir(uploadDir, { recursive: true });
  const filename = `${fileHash.slice(0, 12)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  // Extract PDF text
  let rawText = await extractPdfText(buffer);
  const warnings: string[] = [];

  if (!rawText || rawText.trim().length < 50) {
    warnings.push('PDF text extraction returned minimal content. The document may be scanned. OCR fallback not yet configured — please enter data manually or use a text-based PDF.');
    rawText = rawText || '[No text extracted]';
  }

  // Parse extracted text
  const parsed = parseStatementText(rawText, fileHash);

  // Create import batch record (PENDING — not confirmed yet)
  const batch = await prisma.importBatch.create({
    data: {
      filename: file.name,
      fileHash,
      fileSize: file.size,
      uploadedById: session.user.id,
      partyId,
      status: 'REVIEWING',
      rawExtract: rawText.slice(0, 50000), // cap storage
      warnings: JSON.stringify([...warnings, ...parsed.warnings]),
    },
  });

  // Create ImportTransaction records for each parsed row
  for (const row of parsed.rows) {
    await prisma.importTransaction.create({
      data: {
        batchId: batch.id,
        rowIndex: row.rowIndex,
        txType: row.txType,
        rawData: JSON.stringify(row),
        warnings: JSON.stringify(row.warnings),
        status: 'PENDING',
      },
    });
  }

  return NextResponse.json({
    batchId: batch.id,
    filename: file.name,
    partyName: party.name,
    rows: parsed.rows,
    warnings: [...warnings, ...parsed.warnings],
    arithmeticWarning: parsed.arithmeticWarning,
    extractedPartyName: parsed.partyName,
    periodFrom: parsed.periodFrom,
    periodTo: parsed.periodTo,
  });
}
