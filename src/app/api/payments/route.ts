import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { createPaymentEntry } from '@/lib/ledger';

const paymentSchema = z.object({
  date: z.string(),
  partyId: z.string(),
  refNo: z.string().optional(),
  direction: z.enum(['RECEIVED', 'PAID']),
  method: z.string(),
  amount: z.string(),
  notes: z.string().optional(),
  bankRef: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const partyId = searchParams.get('partyId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const payments = await prisma.payment.findMany({
    where: {
      reversed: false,
      partyId: partyId ?? undefined,
      date: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
    include: { party: { select: { name: true } }, cashExExpense: true },
    orderBy: { date: 'desc' },
    take: 500,
  });

  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });

  const data = parsed.data;

  // Get current business Cash EX rate config
  const business = await prisma.business.findFirst();
  const cashExRateConfig = business ? {
    rate: Number(business.cashExRate),
    basis: Number(business.cashExBasis),
  } : undefined;

  const result = await createPaymentEntry({
    date: new Date(data.date),
    partyId: data.partyId,
    refNo: data.refNo,
    direction: data.direction,
    method: data.method,
    amount: data.amount,
    notes: data.notes,
    bankRef: data.bankRef,
    userId: user.id,
    cashExRateConfig,
  });

  return NextResponse.json(result, { status: 201 });
}
