import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayPurchases, todayPayments, totalParties, cashExToday, recentEntries] = await Promise.all([
    prisma.purchaseEntry.aggregate({
      _sum: { amount: true, qty: true, totalWeight: true },
      where: { date: { gte: today, lt: tomorrow }, reversed: false },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { date: { gte: today, lt: tomorrow }, reversed: false, direction: 'RECEIVED' },
    }),
    prisma.party.count({ where: { active: true } }),
    prisma.cashExExpense.aggregate({
      _sum: { expenseAmount: true },
      where: { date: { gte: today, lt: tomorrow }, reversed: false },
    }),
    prisma.ledgerEntry.findMany({
      where: { reversed: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { party: { select: { name: true } } },
    }),
  ]);

  // Get all active parties latest balance
  const parties = await prisma.party.findMany({ where: { active: true } });
  let totalReceivable = new Decimal(0);
  let totalPayable = new Decimal(0);
  for (const p of parties) {
    const last = await prisma.ledgerEntry.findFirst({
      where: { partyId: p.id, reversed: false },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const bal = last ? new Decimal(last.runningBalance.toString()) : new Decimal(p.openingBalance.toString()).mul(p.openingBalanceDirection === 'CR' ? -1 : 1);
    if (bal.gt(0)) totalReceivable = totalReceivable.plus(bal);
    else if (bal.lt(0)) totalPayable = totalPayable.plus(bal.abs());
  }

  return NextResponse.json({
    today: {
      purchases: { amount: todayPurchases._sum.amount?.toString() ?? '0', qty: todayPurchases._sum.qty ?? 0, weight: todayPurchases._sum.totalWeight?.toString() ?? '0' },
      payments: { amount: todayPayments._sum.amount?.toString() ?? '0' },
      cashEx: { amount: cashExToday._sum.expenseAmount?.toString() ?? '0' },
    },
    totals: { parties: totalParties, receivable: totalReceivable.toFixed(2), payable: totalPayable.toFixed(2) },
    recentEntries,
  });
}
