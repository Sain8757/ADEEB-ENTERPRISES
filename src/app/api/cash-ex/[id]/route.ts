import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { updateCashExExpense, deleteCashExExpense } from '@/lib/ledger';

const updateCashExSchema = z.object({
  expenseAmount: z.string(),
  overrideReason: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const expense = await prisma.cashExExpense.findUnique({
    where: { id },
    include: { payment: { include: { party: true } } },
  });
  if (!expense) return NextResponse.json({ error: 'Cash EX expense not found' }, { status: 404 });

  return NextResponse.json(expense);
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
  const parsed = updateCashExSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const updated = await updateCashExExpense(id, {
      expenseAmount: parsed.data.expenseAmount,
      overrideReason: parsed.data.overrideReason,
      userId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update Cash EX' }, { status: 500 });
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
    await deleteCashExExpense(id, session.user.id);
    return NextResponse.json({ success: true, message: 'Cash EX expense deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete Cash EX' }, { status: 500 });
  }
}
