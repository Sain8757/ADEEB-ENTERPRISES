import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parties = await prisma.party.findMany({ where: { active: true }, orderBy: { name: 'asc' } });

  const result = [];
  for (const party of parties) {
    const last = await prisma.ledgerEntry.findFirst({
      where: { partyId: party.id, reversed: false },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const balSigned = last
      ? new Decimal(last.runningBalance.toString())
      : new Decimal(party.openingBalance.toString()).mul(party.openingBalanceDirection === 'CR' ? -1 : 1);

    result.push({
      id: party.id,
      name: party.name,
      mobile: party.mobile,
      balance: balSigned.abs().toFixed(2),
      direction: balSigned.isZero() ? 'NIL' : balSigned.gt(0) ? 'DR' : 'CR',
    });
  }

  return NextResponse.json(result);
}
