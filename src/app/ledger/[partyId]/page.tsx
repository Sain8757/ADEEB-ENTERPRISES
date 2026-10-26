'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
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

export default function PartyLedgerPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const params = useParams();
  const partyId = params?.partyId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    setLoading(true);
    const qp = new URLSearchParams();
    if (from) qp.set('from', from);
    if (to) qp.set('to', to);
    const res = await fetch(`/api/ledger/${partyId}?${qp}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { if (partyId) load(); }, [partyId, from, to]);

  const party = data?.party;
  const entries = data?.entries ?? [];
  const lastEntry = entries[entries.length - 1];
  const lastBal = lastEntry ? parseFloat(lastEntry.runningBalance) : 0;
  const balDir = lastBal > 0 ? 'DR' : lastBal < 0 ? 'CR' : 'NIL';

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage={`Ledger — ${party?.name ?? '...'}`}>
      <div style={{ padding: 8 }}>
        {loading && <div style={{ color: '#808080', padding: 8 }}>Loading ledger...</div>}
        {!loading && party && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className='section-heading'>📒 Party Ledger — {party.name}</div>
                {party.mobile && <div style={{ fontSize: 11, color: '#808080' }}>📞 {party.mobile}</div>}
                {party.address && <div style={{ fontSize: 11, color: '#808080' }}>📍 {party.address}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#808080' }}>Current Balance:</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', fontFamily: 'Courier New, monospace', color: balDir === 'DR' ? '#800000' : balDir === 'CR' ? '#008000' : '#000' }}>
                  {fmt(Math.abs(lastBal))} {balDir}
                </div>
                <div style={{ fontSize: 10, color: '#808080' }}>
                  {balDir === 'DR' ? 'Party owes ADEEB ENTERPRISES' : balDir === 'CR' ? 'ADEEB ENTERPRISES owes party' : 'Settled'}
                </div>
              </div>
            </div>

            <div className='toolbar' style={{ marginBottom: 8, flexWrap: 'wrap' }}>
              <label className='form-label'>From:</label>
              <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => setFrom(e.target.value)} />
              <label className='form-label' style={{ marginLeft: 4 }}>To:</label>
              <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => setTo(e.target.value)} />
              <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
              <div className='toolbar-separator' />
              <a
                href={`/api/statement/${partyId}/pdf?from=${from}&to=${to}`}
                className='win95-btn' target='_blank' rel='noreferrer'
                style={{ textDecoration: 'none' }}>🖨️ Print Statement</a>
              <Link href={`/parties/${partyId}`} className='win95-btn' style={{ textDecoration: 'none' }}>👤 Party Details</Link>
            </div>

            <div className='table-container'>
              <table className='win95-table' style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Reference</th>
                    <th>Description</th>
                    <th className='num'>Debit (₹)</th>
                    <th className='num'>Credit (₹)</th>
                    <th className='num'>Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No ledger entries for this period.</td></tr>}
                  {entries.map((e: any) => {
                    const bal = parseFloat(e.runningBalance);
                    return (
                      <tr key={e.id}>
                        <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                        <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{e.txType}</td>
                        <td>{e.refNo || '—'}</td>
                        <td style={{ maxWidth: 220 }}>{e.description}</td>
                        <td className='amount' style={{ color: '#800000' }}>{parseFloat(e.debit) > 0 ? fmt(e.debit) : ''}</td>
                        <td className='amount' style={{ color: '#008000' }}>{parseFloat(e.credit) > 0 ? fmt(e.credit) : ''}</td>
                        <td className={`amount ${bal > 0 ? 'ledger-balance-dr' : bal < 0 ? 'ledger-balance-cr' : ''}`}>
                          {fmt(Math.abs(bal))} {bal > 0 ? 'DR' : bal < 0 ? 'CR' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {entries.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'right' }}><strong>Closing Balance:</strong></td>
                      <td className={`amount ${lastBal > 0 ? 'ledger-balance-dr' : lastBal < 0 ? 'ledger-balance-cr' : ''}`}>
                        <strong>{fmt(Math.abs(lastBal))} {balDir}</strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div style={{ marginTop: 8, padding: '4px 8px', background: '#f0f4ff', border: '1px solid #000080', fontSize: 10 }}>
              <strong>Ledger Convention:</strong> DR = Party owes ADEEB ENTERPRISES (Receivable). CR = ADEEB ENTERPRISES owes party (Payable).
              Cash EX expenses are NOT shown here — they are separate business expenses recorded in the Cash EX ledger.
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
