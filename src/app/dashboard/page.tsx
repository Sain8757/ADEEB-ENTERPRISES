'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useSession } from 'next-auth/react';

function fmt(v: string | number, decimals = 2) {
  const n = parseFloat(String(v));
  if (isNaN(n)) return '0.00';
  const abs = Math.abs(n).toFixed(decimals);
  const [i, d] = abs.split('.');
  const groups: string[] = [];
  let rest = i;
  if (rest.length > 3) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) groups.unshift(rest);
  return `₹${groups.join(',')}.${d}`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const today = data?.today;
  const totals = data?.totals;
  const recent = data?.recentEntries ?? [];

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={(session?.user as any)?.role} currentPage='Dashboard'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>📊 Dashboard — Today&apos;s Overview</div>

        {loading && <div style={{ color: '#808080', padding: 8 }}>Loading...</div>}

        {!loading && (
          <>
            {/* Today stats */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Today&apos;s Purchases</div>
                <div className='stat-tile-value'>{fmt(today?.purchases?.amount ?? 0)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>Qty: {today?.purchases?.qty ?? 0} | Wt: {today?.purchases?.weight ?? 0} kg</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Today&apos;s Payments</div>
                <div className='stat-tile-value cr'>{fmt(today?.payments?.amount ?? 0)}</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Cash EX Today</div>
                <div className='stat-tile-value'>{fmt(today?.cashEx?.amount ?? 0)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>Expense (separate)</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Active Parties</div>
                <div className='stat-tile-value'>{totals?.parties ?? 0}</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Total Receivable</div>
                <div className='stat-tile-value dr'>{fmt(totals?.receivable ?? 0)}</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Total Payable</div>
                <div className='stat-tile-value cr'>{fmt(totals?.payable ?? 0)}</div>
              </div>
            </div>

            {/* Recent activity */}
            <div className='group-box'>
              <div className='group-box-title'>Recent Ledger Activity</div>
              <div className='table-container' style={{ maxHeight: 300 }}>
                <table className='win95-table' style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Party</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th className='num'>Debit (₹)</th>
                      <th className='num'>Credit (₹)</th>
                      <th className='num'>Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#808080', padding: 8 }}>No transactions yet. <a href='/parties' style={{ color: '#000080' }}>Go to Parties →</a></td></tr>
                    )}
                    {recent.map((e: any) => {
                      const bal = parseFloat(e.runningBalance);
                      return (
                        <tr key={e.id}>
                          <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                          <td>
                            {e.partyId ? (
                              <a href={`/ledger/${e.partyId}`} className='party-name-link'>
                                {e.party?.name ?? '—'}
                              </a>
                            ) : (
                              e.party?.name ?? '—'
                            )}
                          </td>
                          <td>{e.txType}</td>
                          <td style={{ maxWidth: 200 }}>{e.description}</td>
                          <td className='amount'>{parseFloat(e.debit) > 0 ? fmt(e.debit) : ''}</td>
                          <td className='amount'>{parseFloat(e.credit) > 0 ? fmt(e.credit) : ''}</td>
                          <td className={`amount ${bal > 0 ? 'ledger-balance-dr' : bal < 0 ? 'ledger-balance-cr' : ''}`}>{fmt(Math.abs(bal))} {bal > 0 ? 'DR' : bal < 0 ? 'CR' : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
