import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { updatePaymentEntry, deletePaymentEntry } from '@/lib/ledger';

const updatePaymentSchema = z.object({
  date: z.string(),
  partyId: z.string(),
  refNo: z.string().optional(),
  direction: z.enum(['RECEIVED', 'PAID']),
  method: z.string(),
  amount: z.string(),
  notes: z.string().optional(),
  bankRef: z.string().optional(),
  applyCashEx: z.boolean().optional(),
  manualCashExAmount: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { party: true, cashExExpense: true },
  });
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  return NextResponse.json(payment);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = updatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const updated = await updatePaymentEntry(id, {
      date: new Date(parsed.data.date),
      partyId: parsed.data.partyId,
      refNo: parsed.data.refNo,
      direction: parsed.data.direction,
      method: parsed.data.method,
      amount: parsed.data.amount,
      notes: parsed.data.notes,
      bankRef: parsed.data.bankRef,
      applyCashEx: parsed.data.applyCashEx,
      manualCashExAmount: parsed.data.manualCashExAmount,
      userId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update payment' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await deletePaymentEntry(id, session.user.id);
    return NextResponse.json({ success: true, message: 'Payment entry deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete payment' }, { status: 500 });
  }
}
