import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { z } from 'zod';

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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const before = await prisma.party.findUnique({ where: { id } });
  const body = await req.json();

  const party = await prisma.party.update({
    where: { id },
    data: {
      name: body.name,
      mobile: body.mobile,
      address: body.address,
      notes: body.notes,
      active: body.active,
    },
  });

  const action = body.active === false ? AUDIT_ACTIONS.PARTY_DEACTIVATE : AUDIT_ACTIONS.UPDATE;
  await audit({ userId: session.user.id, userEmail: session.user.email ?? undefined, action, entity: 'Party', entityId: party.id, before: before as any, after: party as any });

  return NextResponse.json(party);
}
