import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const expenses = await prisma.cashExExpense.findMany({
    where: {
      reversed: false,
      date: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
    include: {
      payment: {
        include: { party: { select: { name: true } } },
      },
    },
    orderBy: { date: 'desc' },
    take: 500,
  });

  return NextResponse.json(expenses);
}
