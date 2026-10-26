'use client';
// ADEEB ENTERPRISES — Payment Entries & Management Page
// Allows searching, filtering, adding, editing (modifying), and deleting payments with ledger resync.

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit State
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    partyId: '',
    refNo: '',
    direction: 'RECEIVED' as 'RECEIVED' | 'PAID',
    method: 'CASH',
    amount: '',
    notes: '',
    applyCashEx: false,
    manualCashExAmount: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (partyId) params.set('partyId', partyId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const res = await fetch(`/api/payments?${params}`);
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { load(); }, [partyId, from, to]);

  const totalReceived = payments.filter(p => p.direction === 'RECEIVED').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalPaid = payments.filter(p => p.direction === 'PAID').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  function startEdit(p: any) {
    setEditingPayment(p);
    setError('');
    setSuccess('');
    const d = new Date(p.date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    setEditForm({
      date: `${y}-${m}-${day}`,
      partyId: p.partyId,
      refNo: p.refNo || '',
      direction: p.direction,
      method: p.method,
      amount: String(p.amount),
      notes: p.notes || '',
      applyCashEx: Boolean(p.cashExExpense),
      manualCashExAmount: p.cashExExpense ? String(p.cashExExpense.expenseAmount) : '',
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPayment) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/payments/${editingPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editForm.date,
          partyId: editForm.partyId,
          refNo: editForm.refNo || undefined,
          direction: editForm.direction,
          method: editForm.method,
          amount: editForm.amount,
          notes: editForm.notes || undefined,
          applyCashEx: editForm.applyCashEx,
          manualCashExAmount: editForm.manualCashExAmount || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update payment');

      setSuccess('Payment updated successfully and party ledger resynced.');
      setEditingPayment(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error updating payment');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingPayment) return;
    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/payments/${deletingPayment.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete payment');

      setSuccess('Payment entry deleted and party ledger updated.');
      setDeletingPayment(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting payment');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Payments'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>💰 Payment Entries (Jama / Bhugtan)</div>

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
            <Link href='/payments/new' className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>
              ➕ New Payment
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
                <th>Ref No.</th>
                <th>Direction</th>
                <th>Method</th>
                <th className='num'>Amount (₹)</th>
                <th>Cash EX (Firm)</th>
                <th>Notes</th>
                {role !== 'VIEWER' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && payments.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No payments found.</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    <Link href={`/ledger/${p.partyId}`} className='party-name-link'>
                      {p.party?.name ?? '—'}
                    </Link>
                  </td>
                  <td>{p.refNo || '—'}</td>
                  <td>
                    <span style={{ color: p.direction === 'RECEIVED' ? '#008000' : '#800000', fontWeight: 'bold' }}>
                      {p.direction === 'RECEIVED' ? 'RECEIVED (JAMA)' : 'PAID'}
                    </span>
                  </td>
                  <td>{p.method}</td>
                  <td className='amount' style={{ fontWeight: 'bold' }}>{fmt(p.amount)}</td>
                  <td>
                    {p.cashExExpense ? (
                      <span style={{ color: '#800000', fontSize: 10, fontWeight: 'bold' }}>
                        {fmt(p.cashExExpense.expenseAmount)} exp.
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ maxWidth: 150 }}>{p.notes || '—'}</td>
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
                          onClick={() => setDeletingPayment(p)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  )}
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
                  <td colSpan={role !== 'VIEWER' ? 3 : 2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Edit Payment Modal */}
        {editingPayment && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 480 }}>
              <div className='title-bar'>
                <span className='title-bar-text'>✏️ Edit Payment Entry</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setEditingPayment(null)}
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
                      <label className='form-label'>Direction *</label>
                      <select
                        className='win95-select'
                        value={editForm.direction}
                        onChange={e => setEditForm(f => ({ ...f, direction: e.target.value as any }))}
                        required
                      >
                        <option value='RECEIVED'>RECEIVED (Party se Paisa Aaya / Jama)</option>
                        <option value='PAID'>PAID (Party ko Paisa Diya)</option>
                      </select>
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Payment Method *</label>
                      <select
                        className='win95-select'
                        value={editForm.method}
                        onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))}
                        required
                      >
                        <option value='CASH'>CASH</option>
                        <option value='AC'>A/C (Bank / RTGS / NEFT)</option>
                        <option value='ADVANCE_JAMA'>ADVANCE JAMA</option>
                        <option value='CASH_EX'>CASH EX</option>
                        <option value='CHEQUE'>CHEQUE</option>
                      </select>
                    </div>
                  </div>

                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Amount (₹) *</label>
                      <input
                        className='win95-input' type='number' step='0.01'
                        value={editForm.amount}
                        onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                        required
                      />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Reference / Chq / Txn No.</label>
                      <input
                        className='win95-input'
                        value={editForm.refNo}
                        onChange={e => setEditForm(f => ({ ...f, refNo: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Cash EX Controls */}
                  {editForm.direction === 'RECEIVED' && editForm.method === 'CASH' && (
                    <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', padding: 8, borderRadius: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold' }}>
                        <input
                          type='checkbox'
                          checked={editForm.applyCashEx}
                          onChange={e => setEditForm(f => ({ ...f, applyCashEx: e.target.checked }))}
                        />
                        Apply Cash EX Expense for this Payment
                      </label>
                      {editForm.applyCashEx && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 11 }}>Cash EX Amount (₹):</label>
                          <input
                            className='win95-input' type='number' step='0.01' style={{ width: 120 }}
                            value={editForm.manualCashExAmount}
                            onChange={e => setEditForm(f => ({ ...f, manualCashExAmount: e.target.value }))}
                            placeholder='e.g. 200'
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className='form-row'>
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
                  <button type='button' className='win95-btn' onClick={() => setEditingPayment(null)}>
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
        {deletingPayment && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 400 }}>
              <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                <span className='title-bar-text'>⚠️ Confirm Delete Payment</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setDeletingPayment(null)}
                >
                  ✕
                </button>
              </div>
              <div className='modal-body' style={{ padding: 14 }}>
                <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                  Kya aap is payment entry ko delete karna chahte hain?
                </p>
                <div style={{ fontSize: 11, color: '#333', background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', marginBottom: 8 }}>
                  <div><strong>Party:</strong> {deletingPayment.party?.name}</div>
                  <div><strong>Date:</strong> {new Date(deletingPayment.date).toLocaleDateString('en-IN')}</div>
                  <div><strong>Direction:</strong> {deletingPayment.direction} ({deletingPayment.method})</div>
                  <div><strong>Amount:</strong> {fmt(deletingPayment.amount)}</div>
                </div>
                <p style={{ fontSize: 10, color: '#800000' }}>
                  Is payment aur isse jude Cash EX (agar koi tha) ko delete karke party ka ledger balance resync kiya jayega.
                </p>
              </div>
              <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                <button className='win95-btn' onClick={() => setDeletingPayment(null)}>Cancel</button>
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
