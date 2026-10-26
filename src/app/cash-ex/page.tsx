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

export default function CashExPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/cash-ex?${params}`);
    const data = await res.json();
    setExpenses(Array.isArray(data) ? data : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [from, to]);

  const totalExpense = expenses.reduce((s, e) => s + parseFloat(e.expenseAmount || 0), 0);
  const totalCash = expenses.reduce((s, e) => s + parseFloat(e.cashAmount || 0), 0);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Cash EX Expenses'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>💸 Cash EX Expenses</div>
        <div className='alert-box info' style={{ marginBottom: 8 }}>
          <strong>Cash EX Rule:</strong> ₹200 expense per ₹1,00,000 cash received. This is a SEPARATE business expense.
          It does NOT reduce party payments. Full cash amount is always credited to the party ledger.
        </div>
        <div className='toolbar' style={{ marginBottom: 8 }}>
          <label className='form-label'>From:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => setFrom(e.target.value)} />
          <label className='form-label' style={{ marginLeft: 4 }}>To:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
        </div>
        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th><th>Party</th>
                <th className='num'>Cash Received (₹)</th>
                <th>Rate</th><th>Basis</th>
                <th className='num'>Expense (₹)</th>
                <th>Formula</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && expenses.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No Cash EX expenses found.</td></tr>}
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                  <td>{e.payment?.party?.name ?? '—'}</td>
                  <td className='amount'>{fmt(e.cashAmount)}</td>
                  <td>{e.rateApplied}</td>
                  <td>{fmt(e.basisApplied)}</td>
                  <td className='amount' style={{ color: '#800000', fontWeight: 'bold' }}>{fmt(e.expenseAmount)}</td>
                  <td style={{ fontSize: 10 }}>{fmt(e.cashAmount)} × {e.rateApplied} ÷ {fmt(e.basisApplied)}</td>
                </tr>
              ))}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>TOTAL</strong></td>
                  <td className='amount'><strong>{fmt(totalCash)}</strong></td>
                  <td colSpan={2}></td>
                  <td className='amount' style={{ color: '#800000' }}><strong>{fmt(totalExpense)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </AppShell>
  );
}
