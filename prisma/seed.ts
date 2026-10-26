// ADEEB ENTERPRISES — Database Seed
// Creates initial admin user, business profile, and sample data.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ADEEB ENTERPRISES database...');

  // 1. Create Business profile (singleton)
  let business = await prisma.business.findFirst();
  if (!business) {
    business = await prisma.business.create({
      data: {
        name: 'ADEEB ENTERPRISES',
        mobile: '7050047146',
        address: 'Buffalo Market, Main Road\nAdeeb Nagar, India',
        statementFooter: 'Payments received confirm the above balance. Any discrepancy must be reported within 7 days.',
        cashExRate: '200',
        cashExBasis: '100000',
      },
    });
  }
  console.log('✅ Business profile created:', business.name);

  // 2. Create Admin user
  const adminPassword = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@adeeb.local' },
    create: {
      email: 'admin@adeeb.local',
      name: 'Administrator',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
    update: {},
  });
  console.log('✅ Admin user created:', admin.email, '| Password: Admin@1234');

  // 3. Create Operator user
  const operatorPassword = await bcrypt.hash('Oper@1234', 12);
  const operator = await prisma.user.upsert({
    where: { email: 'operator@adeeb.local' },
    create: {
      email: 'operator@adeeb.local',
      name: 'Operator',
      passwordHash: operatorPassword,
      role: 'OPERATOR',
    },
    update: {},
  });
  console.log('✅ Operator user created:', operator.email, '| Password: Oper@1234');

  // 4. Create Viewer user
  const viewerPassword = await bcrypt.hash('View@1234', 12);
  await prisma.user.upsert({
    where: { email: 'viewer@adeeb.local' },
    create: {
      email: 'viewer@adeeb.local',
      name: 'Viewer',
      passwordHash: viewerPassword,
      role: 'VIEWER',
    },
    update: {},
  });
  console.log('✅ Viewer user created: viewer@adeeb.local | Password: View@1234');

  // 5. Create sample parties (only if no parties exist)
  const existingParties = await prisma.party.count();
  if (existingParties === 0) {
    const partyA = await prisma.party.create({
      data: {
        name: 'Mohammad Saleem & Sons',
        mobile: '9876543210',
        address: 'Village Mohammadpur, Bihar',
        code: 'MSS001',
        openingBalance: '15000',
        openingBalanceDirection: 'DR',
        openingBalanceDate: new Date('2026-04-01'),
        notes: 'Regular B/C supplier',
      },
    });

    const partyB = await prisma.party.create({
      data: {
        name: 'Ramzan Ali Traders',
        mobile: '9123456789',
        address: 'Cattle Market, Gorakhpur',
        code: 'RAT002',
        openingBalance: '0',
        openingBalanceDirection: 'DR',
        openingBalanceDate: new Date('2026-04-01'),
        notes: 'New party added this season',
      },
    });
    console.log('✅ Sample parties created:', partyA.name, '|', partyB.name);
  } else {
    console.log('ℹ️  Parties already exist — skipping sample party creation.');
  }

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('  Admin:    admin@adeeb.local    / Admin@1234');
  console.log('  Operator: operator@adeeb.local  / Oper@1234');
  console.log('  Viewer:   viewer@adeeb.local    / View@1234');
  console.log('\n⚠️  IMPORTANT: Change all passwords immediately after first login!');
}


main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
