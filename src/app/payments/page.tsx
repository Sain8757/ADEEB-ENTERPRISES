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

export default function PaymentsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<any[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (partyId) params.set('partyId', partyId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/payments?${params}`);
    const data = await res.json();
    setPayments(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);
  useEffect(() => { load(); }, [partyId, from, to]);

  const totalReceived = payments.filter(p => p.direction === 'RECEIVED').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalPaid = payments.filter(p => p.direction === 'PAID').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Payments'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>💰 Payment Entries</div>
        <div className='toolbar' style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <select className='win95-select' style={{ width: 180 }} value={partyId} onChange={e => setPartyId(e.target.value)}>
            <option value=''>All Parties</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className='form-label' style={{ marginLeft: 8 }}>From:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => setFrom(e.target.value)} />
          <label className='form-label' style={{ marginLeft: 4 }}>To:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => setTo(e.target.value)} />
          <div className='toolbar-separator' />
          {role !== 'VIEWER' && <Link href='/payments/new' className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>➕ New Payment</Link>}
          <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
        </div>
        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th><th>Party</th><th>Reference</th>
                <th>Direction</th><th>Method</th>
                <th className='num'>Amount (₹)</th>
                <th>Cash EX</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && payments.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No payments found.</td></tr>}
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>{p.party?.name ?? '—'}</td>
                  <td>{p.refNo || '—'}</td>
                  <td><span style={{ color: p.direction === 'RECEIVED' ? '#008000' : '#800000', fontWeight: 'bold' }}>{p.direction}</span></td>
                  <td>{p.method}</td>
                  <td className='amount'>{fmt(p.amount)}</td>
                  <td>{p.cashExExpense
                    ? <span style={{ color: '#800000', fontSize: 10 }}>{fmt(p.cashExExpense.expenseAmount)} exp.</span>
                    : '—'}</td>
                  <td style={{ maxWidth: 150 }}>{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5}><strong>TOTALS</strong></td>
                  <td className='amount'>
                    <div style={{ color: '#008000' }}>Rcv: {fmt(totalReceived)}</div>
                    <div style={{ color: '#800000' }}>Paid: {fmt(totalPaid)}</div>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#808080' }}>
          ℹ️ Cash EX shown is a SEPARATE business expense — it does NOT reduce the payment amount recorded in the party ledger.
        </div>
      </div>
    </AppShell>
  );
}
