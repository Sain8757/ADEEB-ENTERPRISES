import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const party = await prisma.party.findUnique({
    where: { id },
    include: {
      ledgerEntries: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], where: { reversed: false } },
      purchases: { orderBy: { date: 'desc' }, where: { reversed: false } },
      payments: { orderBy: { date: 'desc' }, where: { reversed: false } },
    },
  });

  if (!party) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(party);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const before = await prisma.party.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

  const body = await req.json();

  let deletedAtUpdate: Date | null | undefined = undefined;
  if (body.active === false) {
    deletedAtUpdate = before.deletedAt ?? new Date();
  } else if (body.active === true) {
    deletedAtUpdate = null;
  }

  const party = await prisma.party.update({
    where: { id },
    data: {
      name: body.name !== undefined ? body.name : undefined,
      mobile: body.mobile !== undefined ? body.mobile : undefined,
      address: body.address !== undefined ? body.address : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      active: body.active !== undefined ? body.active : undefined,
      deletedAt: deletedAtUpdate,
    },
  });

  const action = body.active === false
    ? AUDIT_ACTIONS.PARTY_DEACTIVATE
    : body.active === true && before.active === false
    ? 'PARTY_RESTORE'
    : AUDIT_ACTIONS.UPDATE;

  await audit({
    userId: user.id,
    userEmail: user.email ?? undefined,
    action,
    entity: 'Party',
    entityId: party.id,
    before: before as any,
    after: party as any,
  });

  return NextResponse.json(party);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Admin only operation' }, { status: 403 });

  const before = await prisma.party.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // 1. Delete associated cash ex expenses
    const payments = await tx.payment.findMany({ where: { partyId: id }, select: { id: true } });
    const paymentIds = payments.map(p => p.id);
    if (paymentIds.length > 0) {
      await tx.cashExExpense.deleteMany({ where: { paymentId: { in: paymentIds } } });
    }

    // 2. Delete ledger entries
    await tx.ledgerEntry.deleteMany({ where: { partyId: id } });

    // 3. Delete purchases & payments
    await tx.purchaseEntry.deleteMany({ where: { partyId: id } });
    await tx.payment.deleteMany({ where: { partyId: id } });

    // 4. Delete rate history & import batches link
    await tx.rateHistory.deleteMany({ where: { partyId: id } });

    // 5. Delete party permanently
    await tx.party.delete({ where: { id } });
  });

  await audit({
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: AUDIT_ACTIONS.DELETE,
    entity: 'Party',
    entityId: id,
    before: before as any,
  });

  return NextResponse.json({ success: true, message: `Party ${before.name} permanently deleted.` });
}
