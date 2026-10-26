import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { createPurchaseEntry } from '@/lib/ledger';

const purchaseSchema = z.object({
  date: z.string(),
  partyId: z.string(),
  receiptNo: z.string().optional(),
  qty: z.number().int().positive(),
  category: z.enum(['BC', 'SC']).optional().nullable(),
  totalWeight: z.string(),
  rate: z.string(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const partyId = searchParams.get('partyId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const purchases = await prisma.purchaseEntry.findMany({
    where: {
      reversed: false,
      partyId: partyId ?? undefined,
      date: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
    include: { party: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 500,
  });

  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });

  const data = parsed.data;

  const entry = await createPurchaseEntry({
    date: new Date(data.date),
    partyId: data.partyId,
    receiptNo: data.receiptNo,
    qty: data.qty,
    category: data.category,
    totalWeight: data.totalWeight,
    rate: data.rate,
    notes: data.notes,
    userId: user.id,
  });

  return NextResponse.json(entry, { status: 201 });
}
