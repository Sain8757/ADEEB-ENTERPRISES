'use client';
import AppShell from '@/components/AppShell';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const REPORTS = [
  { href: '/reports/outstanding', label: 'Outstanding Balances', icon: '💳', desc: 'Receivable and payable for all parties.' },
  { href: '/reports/daily', label: 'Daily Transactions', icon: '📅', desc: 'All purchases and payments for a specific date.' },
  { href: '/reports/monthly', label: 'Monthly Summary', icon: '📆', desc: 'Month-wise transaction totals.' },
  { href: '/reports/party-ledger', label: 'Party-wise Ledger', icon: '📒', desc: 'Full ledger for any party with date filter.' },
  { href: '/reports/purchases', label: 'Purchase Summary', icon: '🐃', desc: 'Category-wise B/C and S/C purchase totals.' },
  { href: '/reports/payments', label: 'Payment Method Summary', icon: '💰', desc: 'Breakdown by Cash, A/C, Advance Jama, etc.' },
  { href: '/cash-ex', label: 'Cash EX Expenses', icon: '💸', desc: 'All Cash EX expense records (separate from party payments).' },
  { href: '/reports/audit', label: 'Audit Log', icon: '🔍', desc: 'Full audit trail of all system actions. Admin only.' },
];

export default function ReportsPage() {
  const { data: session } = useSession();
  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={(session?.user as any)?.role} currentPage='Reports'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>📊 Reports</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {REPORTS.map(r => (
            <Link key={r.href} href={r.href} style={{ textDecoration: 'none' }}>
              <div className='stat-tile' style={{ cursor: 'pointer', height: '100%' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{r.icon}</div>
                <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>{r.desc}</div>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: '6px 8px', background: '#fffacc', border: '1px solid #808000', fontSize: 10 }}>
          ℹ️ All report data is calculated from actual persisted transactions in the database. No hardcoded values.
        </div>
      </div>
    </AppShell>
  );
}
