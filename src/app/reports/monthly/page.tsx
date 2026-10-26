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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthlyReportPage() {
  const { data: session } = useSession();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const results = await Promise.all(
      MONTHS.map(async (_, monthIdx) => {
        const from = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, monthIdx + 1, 0).getDate();
        const to = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${lastDay}`;

        const [p, pay] = await Promise.all([
          fetch(`/api/purchases?from=${from}&to=${to}`).then(r => r.json()),
          fetch(`/api/payments?from=${from}&to=${to}`).then(r => r.json()),
        ]);

        const purchases = Array.isArray(p) ? p : [];
        const payments = Array.isArray(pay) ? pay : [];

        return {
          month: MONTHS[monthIdx],
          purchaseAmount: purchases.reduce((s: number, x: any) => s + parseFloat(x.amount || 0), 0),
          purchaseQty: purchases.reduce((s: number, x: any) => s + (x.qty || 0), 0),
          paymentReceived: payments.filter((x: any) => x.direction === 'RECEIVED').reduce((s: number, x: any) => s + parseFloat(x.amount || 0), 0),
          cashEx: payments.filter((x: any) => x.cashExExpense).reduce((s: number, x: any) => s + parseFloat(x.cashExExpense?.expenseAmount || 0), 0),
        };
      })
    );
    setData(results);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year]);

  const totalPurchase = data.reduce((s, r) => s + r.purchaseAmount, 0);
  const totalPayment = data.reduce((s, r) => s + r.paymentReceived, 0);
  const totalCashEx = data.reduce((s, r) => s + r.cashEx, 0);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={(session?.user as any)?.role} currentPage='Monthly Summary'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>📆 Monthly Summary — {year}</div>
        <div className='toolbar' style={{ marginBottom: 8 }}>
          <label className='form-label'>Year:</label>
          <input className='win95-input' type='number' min='2020' max='2040' value={year}
            onChange={e => setYear(parseInt(e.target.value))} style={{ width: 80 }} />
          <button className='toolbar-btn' onClick={load}>⟳ Load</button>
        </div>

        {loading && <div style={{ color: '#808080', padding: 8 }}>Loading... (fetching 12 months)</div>}
        {!loading && (
          <div className='table-container'>
            <table className='win95-table' style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className='num'>Purchases (₹)</th>
                  <th className='num'>Qty</th>
                  <th className='num'>Payments Rcvd (₹)</th>
                  <th className='num'>Cash EX Exp (₹)</th>
                  <th className='num'>Net (Purchase − Payment)</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.month}>
                    <td><strong>{row.month} {year}</strong></td>
                    <td className='amount'>{row.purchaseAmount > 0 ? fmt(row.purchaseAmount) : <span style={{ color: '#808080' }}>—</span>}</td>
                    <td className='num'>{row.purchaseQty > 0 ? row.purchaseQty : '—'}</td>
                    <td className='amount' style={{ color: '#008000' }}>{row.paymentReceived > 0 ? fmt(row.paymentReceived) : <span style={{ color: '#808080' }}>—</span>}</td>
                    <td className='amount' style={{ color: '#800000' }}>{row.cashEx > 0 ? fmt(row.cashEx) : '—'}</td>
                    <td className={`amount ${row.purchaseAmount - row.paymentReceived > 0 ? 'ledger-balance-dr' : 'ledger-balance-cr'}`}>
                      {fmt(Math.abs(row.purchaseAmount - row.paymentReceived))}
                      {' '}{row.purchaseAmount >= row.paymentReceived ? 'DR' : 'CR'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                  <td>TOTAL {year}</td>
                  <td className='amount'>{fmt(totalPurchase)}</td>
                  <td></td>
                  <td className='amount' style={{ color: '#008000' }}>{fmt(totalPayment)}</td>
                  <td className='amount' style={{ color: '#800000' }}>{fmt(totalCashEx)}</td>
                  <td className={`amount ${totalPurchase - totalPayment >= 0 ? 'ledger-balance-dr' : 'ledger-balance-cr'}`}>
                    {fmt(Math.abs(totalPurchase - totalPayment))} {totalPurchase >= totalPayment ? 'DR' : 'CR'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 10, color: '#808080' }}>
          ℹ️ Cash EX expenses are NOT deducted from party payments. They are separate business expenses.
        </div>
      </div>
    </AppShell>
  );
}
