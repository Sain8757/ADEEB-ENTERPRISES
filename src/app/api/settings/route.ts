import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let business = await prisma.business.findFirst();
  if (!business) {
    business = await prisma.business.create({ data: {} });
  }
  return NextResponse.json(business);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const before = await prisma.business.findFirst();

  let business = await prisma.business.findFirst();
  if (!business) business = await prisma.business.create({ data: {} });

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      name: body.name,
      mobile: body.mobile,
      address: body.address,
      statementFooter: body.statementFooter,
      cashExRate: body.cashExRate,
      cashExBasis: body.cashExBasis,
    },
  });

  await audit({ userId: user.id, userEmail: user.email ?? undefined, action: AUDIT_ACTIONS.SETTINGS_CHANGE, entity: 'Business', entityId: updated.id, before: before as any, after: updated as any });

  return NextResponse.json(updated);
}
