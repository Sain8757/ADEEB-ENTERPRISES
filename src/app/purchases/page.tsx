'use client';
// ADEEB ENTERPRISES — Purchase List Page

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

export default function PurchasesPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [purchases, setPurchases] = useState<any[]>([]);
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
    const res = await fetch(`/api/purchases?${params}`);
    const data = await res.json();
    setPurchases(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { load(); }, [partyId, from, to]);

  const totalQty = purchases.reduce((s, p) => s + (p.qty || 0), 0);
  const totalWeight = purchases.reduce((s, p) => s + parseFloat(p.totalWeight || 0), 0);
  const totalAmount = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Purchase Entries'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>🐃 Purchase Entries</div>

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
          {role !== 'VIEWER' && (
            <Link href='/purchases/new' className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>➕ New Purchase</Link>
          )}
          <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
        </div>

        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Receipt No.</th>
                <th className='num'>Qty</th>
                <th>Category</th>
                <th className='num'>Total Wt (kg)</th>
                <th className='num'>Avg Wt (kg)</th>
                <th className='num'>Rate (₹/kg)</th>
                <th className='num'>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && purchases.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No purchase entries found.</td></tr>
              )}
              {purchases.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>{p.party?.name ?? '—'}</td>
                  <td>{p.receiptNo || '—'}</td>
                  <td className='num'>{p.qty}</td>
                  <td>
                    <span className={`category-badge ${p.category === 'BC' ? 'bc' : p.category === 'SC' ? 'sc' : 'vc'}`}>
                      {p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : 'V/C'}
                    </span>
                  </td>
                  <td className='num'>{parseFloat(p.totalWeight).toFixed(1)}</td>
                  <td className='num'>{parseFloat(p.avgWeight).toFixed(2)}</td>
                  <td className='num'>{parseFloat(p.rate).toFixed(2)}</td>
                  <td className='amount'>{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            {purchases.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>TOTAL</strong></td>
                  <td className='num'><strong>{totalQty}</strong></td>
                  <td></td>
                  <td className='num'><strong>{totalWeight.toFixed(1)}</strong></td>
                  <td></td>
                  <td></td>
                  <td className='amount'><strong>{fmt(totalAmount)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </AppShell>
  );
}
