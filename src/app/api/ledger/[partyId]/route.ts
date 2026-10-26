import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

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

  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [entries, purchases, payments, directCashExList] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        partyId,
        reversed: false,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        purchase: true,
        payment: { include: { cashExExpense: true } },
      },
    }),
    prisma.purchaseEntry.findMany({
      where: {
        partyId,
        reversed: false,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.payment.findMany({
      where: {
        partyId,
        reversed: false,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'desc' },
      include: { cashExExpense: true },
    }),
    prisma.cashExExpense.findMany({
      where: {
        partyId,
        reversed: false,
        paymentId: null,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'desc' },
    }),
  ]);

  // Extract all cash ex expenses for this party (both linked to payments and standalone)
  const cashExExpenses = [
    ...payments.map(p => p.cashExExpense).filter(Boolean),
    ...directCashExList,
  ];

  return NextResponse.json({ party, entries, purchases, payments, cashExExpenses });
}
