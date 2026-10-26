import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { updatePurchaseEntry, deletePurchaseEntry } from '@/lib/ledger';

const updatePurchaseSchema = z.object({
  date: z.string(),
  partyId: z.string(),
  receiptNo: z.string().optional(),
  qty: z.number().int().positive(),
  category: z.enum(['BC', 'SC']).optional().nullable(),
  totalWeight: z.string(),
  rate: z.string(),
  notes: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const purchase = await prisma.purchaseEntry.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

  return NextResponse.json(purchase);
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
  const parsed = updatePurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const updated = await updatePurchaseEntry(id, {
      date: new Date(parsed.data.date),
      partyId: parsed.data.partyId,
      receiptNo: parsed.data.receiptNo,
      qty: parsed.data.qty,
      category: parsed.data.category ?? null,
      totalWeight: parsed.data.totalWeight,
      rate: parsed.data.rate,
      notes: parsed.data.notes,
      userId: session.user.id,
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update purchase' }, { status: 500 });
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
    await deletePurchaseEntry(id, session.user.id);
    return NextResponse.json({ success: true, message: 'Purchase entry deleted' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete purchase' }, { status: 500 });
  }
}
