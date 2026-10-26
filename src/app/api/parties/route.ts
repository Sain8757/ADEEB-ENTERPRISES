import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { postOpeningBalance } from '@/lib/ledger';

const partySchema = z.object({
  name: z.string().min(1).max(100),
  mobile: z.string().optional(),
  address: z.string().optional(),
  code: z.string().optional(),
  openingBalance: z.string().default('0'),
  openingBalanceDirection: z.enum(['DR', 'CR']).default('DR'),
  openingBalanceDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const isTrash = searchParams.get('trash') === 'true';

  let whereClause: any = {
    name: search ? { contains: search, mode: 'insensitive' } : undefined,
  };

  if (isTrash) {
    whereClause.OR = [
      { active: false },
      { deletedAt: { not: null } },
    ];
  } else if (!includeInactive) {
    whereClause.active = true;
    whereClause.deletedAt = null;
  }

  const parties = await prisma.party.findMany({
    where: whereClause,
    orderBy: isTrash ? { deletedAt: 'desc' } : { name: 'asc' },
  });

  return NextResponse.json(parties);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;
  const role = (user as any).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = partySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });

  const data = parsed.data;

  // Duplicate check
  const existing = await prisma.party.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' }, active: true },
  });
  if (existing && !body.confirmDuplicate) {
    return NextResponse.json({ warning: 'DUPLICATE', existingId: existing.id, message: `A party named "${existing.name}" already exists. Confirm to create anyway.` }, { status: 409 });
  }

  const party = await prisma.party.create({
    data: {
      name: data.name,
      mobile: data.mobile,
      address: data.address,
      code: data.code || undefined,
      openingBalance: data.openingBalance,
      openingBalanceDirection: data.openingBalanceDirection as any,
      openingBalanceDate: data.openingBalanceDate ? new Date(data.openingBalanceDate) : undefined,
      notes: data.notes,
    },
  });

  // Post opening balance to ledger if non-zero
  if (parseFloat(data.openingBalance) !== 0) {
    await postOpeningBalance(party as any, user.id);
  }

  await audit({ userId: user.id, userEmail: user.email ?? undefined, action: AUDIT_ACTIONS.CREATE, entity: 'Party', entityId: party.id, after: party as any });

  return NextResponse.json(party, { status: 201 });
}
