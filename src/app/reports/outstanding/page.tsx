'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';
import Link from 'next/link';

function fmt(v: string | number) {
  const n = parseFloat(String(v));
  if (isNaN(n)) return '₹0.00';
  const abs = Math.abs(n).toFixed(2);
  const [i, d] = abs.split('.');
  const groups: string[] = [];
  let rest = i;
  if (rest.length > 3) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) groups.unshift(rest);
  return `₹${groups.join(',')}.${d}`;
}

export default function OutstandingPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports/outstanding').then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalDR = data.filter(p => p.direction === 'DR').reduce((s, p) => s + parseFloat(p.balance || 0), 0);
  const totalCR = data.filter(p => p.direction === 'CR').reduce((s, p) => s + parseFloat(p.balance || 0), 0);
  const net = totalDR - totalCR;

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={(session?.user as any)?.role} currentPage='Outstanding Balances'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>💳 Outstanding Balances — All Parties</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Total Receivable (DR)</div>
            <div className='stat-tile-value dr'>{fmt(totalDR)}</div>
            <div style={{ fontSize: 10, color: '#808080' }}>Parties owe ADEEB ENTERPRISES</div>
          </div>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Total Payable (CR)</div>
            <div className='stat-tile-value cr'>{fmt(totalCR)}</div>
            <div style={{ fontSize: 10, color: '#808080' }}>ADEEB ENTERPRISES owes parties</div>
          </div>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Net Position</div>
            <div className={`stat-tile-value ${net >= 0 ? 'dr' : 'cr'}`}>
              {fmt(Math.abs(net))} {net >= 0 ? 'DR' : 'CR'}
            </div>
          </div>
        </div>

        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Party Name</th><th>Mobile</th>
                <th className='num'>Balance (₹)</th>
                <th>Direction</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && data.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No parties found.</td></tr>}
              {data.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.mobile || '—'}</td>
                  <td className='amount' style={{ fontWeight: 'bold' }}>{fmt(p.balance)}</td>
                  <td>
                    <span className={p.direction === 'DR' ? 'ledger-balance-dr' : p.direction === 'CR' ? 'ledger-balance-cr' : ''}>
                      {p.direction === 'DR' ? '↑ Receivable (DR)' : p.direction === 'CR' ? '↓ Payable (CR)' : '✓ Settled'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/ledger/${p.id}`} className='win95-btn' style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px', display: 'inline-block' }}>
                      📒 Ledger
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
