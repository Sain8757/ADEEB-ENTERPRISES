'use client';
// ADEEB ENTERPRISES — Purchase List & Management Page
// Allows searching, filtering, adding, editing (modifying), and deleting purchases with ledger sync.

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit State
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    partyId: '',
    receiptNo: '',
    qty: 1,
    category: '',
    totalWeight: '',
    rate: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deletingPurchase, setDeletingPurchase] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (partyId) params.set('partyId', partyId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const res = await fetch(`/api/purchases?${params}`);
      const data = await res.json();
      setPurchases(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { load(); }, [partyId, from, to]);

  const totalQty = purchases.reduce((s, p) => s + (p.qty || 0), 0);
  const totalWeight = purchases.reduce((s, p) => s + parseFloat(p.totalWeight || 0), 0);
  const totalAmount = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  function startEdit(p: any) {
    setEditingPurchase(p);
    setError('');
    setSuccess('');
    const d = new Date(p.date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setEditForm({
      date: `${y}-${m}-${day}`,
      partyId: p.partyId,
      receiptNo: p.receiptNo || '',
      qty: p.qty,
      category: p.category || '',
      totalWeight: String(p.totalWeight),
      rate: String(p.rate),
      notes: p.notes || '',
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPurchase) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/purchases/${editingPurchase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editForm.date,
          partyId: editForm.partyId,
          receiptNo: editForm.receiptNo || undefined,
          qty: Number(editForm.qty),
          category: editForm.category || null,
          totalWeight: editForm.totalWeight,
          rate: editForm.rate,
          notes: editForm.notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update purchase');

      setSuccess('Purchase updated successfully and party ledger resynced.');
      setEditingPurchase(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error updating purchase');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingPurchase) return;
    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/purchases/${deletingPurchase.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete purchase');

      setSuccess('Purchase deleted and party ledger updated.');
      setDeletingPurchase(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting purchase');
    } finally {
      setDeleting(false);
    }
  }

  const editAmount = (parseFloat(editForm.totalWeight || '0') * parseFloat(editForm.rate || '0')) || 0;

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Purchase Entries'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>🐃 Purchase Entries (Kharid)</div>

        {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        <div className='toolbar' style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <select className='win95-select' style={{ width: 180 }} value={partyId} onChange={e => setPartyId(e.target.value)}>
            <option value=''>All Parties</option>
            {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className='form-label' style={{ marginLeft: 4 }}>From:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => setFrom(e.target.value)} />
          <label className='form-label' style={{ marginLeft: 4 }}>To:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => setTo(e.target.value)} />
          <div className='toolbar-separator' />
          {role !== 'VIEWER' && (
            <Link href='/purchases/new' className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>
              ➕ New Purchase
            </Link>
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
                {role !== 'VIEWER' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && purchases.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No purchase entries found.</td></tr>
              )}
              {purchases.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    <Link href={`/ledger/${p.partyId}`} className='party-name-link'>
                      {p.party?.name ?? '—'}
                    </Link>
                  </td>
                  <td>{p.receiptNo || '—'}</td>
                  <td className='num'>{p.qty}</td>
                  <td>
                    {p.category ? (
                      <span className={`category-badge ${p.category === 'BC' ? 'bc' : p.category === 'SC' ? 'sc' : 'vc'}`}>
                        {p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : 'V/C'}
                      </span>
                    ) : (
                      <span style={{ color: '#808080' }}>—</span>
                    )}
                  </td>
                  <td className='num'>{parseFloat(p.totalWeight).toFixed(1)}</td>
                  <td className='num'>{parseFloat(p.avgWeight).toFixed(2)}</td>
                  <td className='num'>{parseFloat(p.rate).toFixed(2)}</td>
                  <td className='amount' style={{ fontWeight: 'bold' }}>{fmt(p.amount)}</td>
                  {role !== 'VIEWER' && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className='win95-btn'
                          style={{ fontSize: 10, padding: '1px 6px' }}
                          onClick={() => startEdit(p)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className='win95-btn win95-btn-danger'
                          style={{ fontSize: 10, padding: '1px 6px' }}
                          onClick={() => setDeletingPurchase(p)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  )}
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
                  {role !== 'VIEWER' && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Edit Purchase Modal */}
        {editingPurchase && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 480 }}>
              <div className='title-bar'>
                <span className='title-bar-text'>✏️ Edit Purchase Entry</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setEditingPurchase(null)}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSaveEdit}>
                <div className='modal-body' style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Date *</label>
                      <input
                        className='win95-input' type='date'
                        value={editForm.date}
                        onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Party *</label>
                      <select
                        className='win95-select'
                        value={editForm.partyId}
                        onChange={e => setEditForm(f => ({ ...f, partyId: e.target.value }))}
                        required
                      >
                        {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Buffaloes (Nug / Qty) *</label>
                      <input
                        className='win95-input' type='number' min='1'
                        value={editForm.qty}
                        onChange={e => setEditForm(f => ({ ...f, qty: Number(e.target.value) }))}
                        required
                      />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Category (Optional)</label>
                      <select
                        className='win95-select'
                        value={editForm.category}
                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                      >
                        <option value=''>— None / Blank —</option>
                        <option value='BC'>B/C (Big Cattle)</option>
                        <option value='SC'>S/C (Small Cattle)</option>
                      </select>
                    </div>
                  </div>

                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Total Weight (Kg) *</label>
                      <input
                        className='win95-input' type='number' step='0.001'
                        value={editForm.totalWeight}
                        onChange={e => setEditForm(f => ({ ...f, totalWeight: e.target.value }))}
                        required
                      />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Rate (₹/Kg) *</label>
                      <input
                        className='win95-input' type='number' step='0.01'
                        value={editForm.rate}
                        onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 'bold' }}>Calculated Amount:</span>
                    <span style={{ fontSize: 16, fontWeight: 'bold', color: '#000080' }}>{fmt(editAmount)}</span>
                  </div>

                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Receipt No. (Optional)</label>
                      <input
                        className='win95-input'
                        value={editForm.receiptNo}
                        onChange={e => setEditForm(f => ({ ...f, receiptNo: e.target.value }))}
                      />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Notes (Optional)</label>
                      <input
                        className='win95-input'
                        value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                  <button type='button' className='win95-btn' onClick={() => setEditingPurchase(null)}>
                    Cancel
                  </button>
                  <button type='submit' className='win95-btn win95-btn-primary' disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : '💾 Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingPurchase && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 400 }}>
              <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                <span className='title-bar-text'>⚠️ Confirm Delete Purchase</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setDeletingPurchase(null)}
                >
                  ✕
                </button>
              </div>
              <div className='modal-body' style={{ padding: 14 }}>
                <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                  Kya aap is purchase entry ko delete karna chahte hain?
                </p>
                <div style={{ fontSize: 11, color: '#333', background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', marginBottom: 8 }}>
                  <div><strong>Party:</strong> {deletingPurchase.party?.name}</div>
                  <div><strong>Date:</strong> {new Date(deletingPurchase.date).toLocaleDateString('en-IN')}</div>
                  <div><strong>Buffaloes:</strong> {deletingPurchase.qty} ({deletingPurchase.totalWeight} kg @ ₹{deletingPurchase.rate})</div>
                  <div><strong>Amount:</strong> {fmt(deletingPurchase.amount)}</div>
                </div>
                <p style={{ fontSize: 10, color: '#800000' }}>
                  Is entry ke delete hone ke baad party ke ledger ka running balance automatically recalculate ho jayega.
                </p>
              </div>
              <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                <button className='win95-btn' onClick={() => setDeletingPurchase(null)}>Cancel</button>
                <button
                  className='win95-btn win95-btn-danger'
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : '🗑️ Yes, Delete Entry'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
