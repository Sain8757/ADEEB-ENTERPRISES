import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { createCashExEntry } from '@/lib/ledger';

const cashExSchema = z.object({
  date: z.string(),
  partyId: z.string().optional().nullable(),
  cashAmount: z.string(),
  expenseAmount: z.string().optional(),
  overrideReason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const partyId = searchParams.get('partyId');

  function parseDate(s: string | null, endOfDay = false): Date | undefined {
    if (!s || s.trim() === '' || s === 'null' || s === 'undefined') return undefined;
    const d = new Date(s);
    if (isNaN(d.getTime())) return undefined;
    if (endOfDay) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
  }

  const fromDate = parseDate(from, false);
  const toDate = parseDate(to, true);

  const expenses = await prisma.cashExExpense.findMany({
    where: {
      reversed: false,
      partyId: partyId ? partyId : undefined,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    },
    include: {
      party: { select: { id: true, name: true } },
      payment: {
        include: { party: { select: { id: true, name: true } } },
      },
    },
    orderBy: { date: 'desc' },
    take: 500,
  });

  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = cashExSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const expense = await createCashExEntry({
      date: new Date(parsed.data.date),
      partyId: parsed.data.partyId ?? undefined,
      cashAmount: parsed.data.cashAmount,
      expenseAmount: parsed.data.expenseAmount,
      overrideReason: parsed.data.overrideReason,
      userId: session.user.id,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create Cash EX expense' }, { status: 500 });
  }
}
