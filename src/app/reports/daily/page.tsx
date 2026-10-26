'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';

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

export default function DailyReportPage() {
  const { data: session } = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [p, pay] = await Promise.all([
      fetch(`/api/purchases?from=${date}&to=${date}`).then(r => r.json()),
      fetch(`/api/payments?from=${date}&to=${date}`).then(r => r.json()),
    ]);
    setPurchases(Array.isArray(p) ? p : []);
    setPayments(Array.isArray(pay) ? pay : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [date]);

  const totalPurchases = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalQty = purchases.reduce((s, p) => s + (p.qty || 0), 0);
  const totalWeight = purchases.reduce((s, p) => s + parseFloat(p.totalWeight || 0), 0);
  const totalReceived = payments.filter(p => p.direction === 'RECEIVED').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={(session?.user as any)?.role} currentPage='Daily Report'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>📅 Daily Transactions Report</div>
        <div className='toolbar' style={{ marginBottom: 8 }}>
          <label className='form-label'>Date:</label>
          <input className='win95-input' type='date' value={date} onChange={e => setDate(e.target.value)} style={{ width: 140 }} />
          <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
        </div>

        {loading && <div style={{ color: '#808080', padding: 8 }}>Loading...</div>}

        {!loading && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Purchases</div>
                <div className='stat-tile-value dr'>{fmt(totalPurchases)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>Qty: {totalQty} | Wt: {totalWeight.toFixed(1)} kg</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Cash / Payments Received</div>
                <div className='stat-tile-value cr'>{fmt(totalReceived)}</div>
              </div>
            </div>

            <div className='group-box'>
              <div className='group-box-title'>Purchases on {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <div className='table-container'>
                <table className='win95-table' style={{ width: '100%' }}>
                  <thead><tr><th>Party</th><th>Receipt</th><th>Cat.</th><th className='num'>Qty</th><th className='num'>Weight</th><th className='num'>Rate</th><th className='num'>Amount</th></tr></thead>
                  <tbody>
                    {purchases.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#808080', padding: 8 }}>No purchases on this date.</td></tr>}
                    {purchases.map(p => (
                      <tr key={p.id}>
                        <td>{p.party?.name ?? '—'}</td>
                        <td>{p.receiptNo || '—'}</td>
                        <td><span className={`category-badge ${p.category === 'BC' ? 'bc' : 'sc'}`}>{p.category === 'BC' ? 'B/C' : 'S/C'}</span></td>
                        <td className='num'>{p.qty}</td>
                        <td className='num'>{parseFloat(p.totalWeight).toFixed(1)}</td>
                        <td className='num'>{parseFloat(p.rate).toFixed(2)}</td>
                        <td className='amount'>{fmt(p.amount)}</td>
                      </tr>
                    ))}
                    {purchases.length > 0 && (
                      <tr style={{ fontWeight: 'bold', background: '#f5f5f5' }}>
                        <td colSpan={3}>TOTAL</td>
                        <td className='num'>{totalQty}</td>
                        <td className='num'>{totalWeight.toFixed(1)}</td>
                        <td></td>
                        <td className='amount'>{fmt(totalPurchases)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className='group-box' style={{ marginTop: 8 }}>
              <div className='group-box-title'>Payments on {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <div className='table-container'>
                <table className='win95-table' style={{ width: '100%' }}>
                  <thead><tr><th>Party</th><th>Direction</th><th>Method</th><th>Reference</th><th className='num'>Amount</th><th>Cash EX</th></tr></thead>
                  <tbody>
                    {payments.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#808080', padding: 8 }}>No payments on this date.</td></tr>}
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td>{p.party?.name ?? '—'}</td>
                        <td><span style={{ color: p.direction === 'RECEIVED' ? '#008000' : '#800000', fontWeight: 'bold' }}>{p.direction}</span></td>
                        <td>{p.method}</td>
                        <td>{p.refNo || '—'}</td>
                        <td className='amount'>{fmt(p.amount)}</td>
                        <td>{p.cashExExpense ? <span style={{ color: '#800000', fontSize: 10 }}>{fmt(p.cashExExpense.expenseAmount)}</span> : '—'}</td>
                      </tr>
                    ))}
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
