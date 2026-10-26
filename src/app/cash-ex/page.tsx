'use client';
// ADEEB ENTERPRISES — Cash EX Register & Management Page
// Allows searching, filtering, editing expense amount, and deleting Cash EX records.

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

export default function CashExPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit State
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ expenseAmount: '', overrideReason: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deletingExpense, setDeletingExpense] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const [resCex, resPay] = await Promise.all([
        fetch(`/api/cash-ex?${params}`),
        fetch(`/api/payments?${params}`),
      ]);
      const dataCex = await resCex.json();
      const dataPay = await resPay.json();

      const combined: any[] = [];
      if (Array.isArray(dataPay)) {
        for (const p of dataPay) {
          if (p.method === 'CASH_EX') {
            combined.push({
              id: p.id,
              date: p.date,
              partyId: p.partyId,
              party: p.party,
              amount: p.amount,
              notes: p.notes || p.refNo || '',
              source: 'PAYMENT',
            });
          }
        }
      }
      if (Array.isArray(dataCex)) {
        for (const e of dataCex) {
          combined.push({
            id: e.id,
            date: e.date,
            partyId: e.partyId || e.payment?.partyId,
            party: e.party || e.payment?.party,
            amount: e.expenseAmount || e.cashAmount,
            notes: e.overrideReason || '',
            source: 'EXPENSE',
          });
        }
      }
      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(combined);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [from, to]);

  const totalExpense = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  function startEdit(e: any) {
    setEditingExpense(e);
    setError('');
    setSuccess('');
    setEditForm({
      expenseAmount: String(e.amount),
      overrideReason: e.notes || '',
    });
  }

  async function handleSaveEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editingExpense) return;
    setSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      const isPayment = editingExpense.source === 'PAYMENT';
      const url = isPayment ? `/api/payments/${editingExpense.id}` : `/api/cash-ex/${editingExpense.id}`;
      const body = isPayment
        ? {
            amount: editForm.expenseAmount,
            notes: editForm.overrideReason || undefined,
          }
        : {
            cashAmount: editForm.expenseAmount,
            expenseAmount: editForm.expenseAmount,
            overrideReason: editForm.overrideReason || undefined,
          };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update Cash EX');

      setSuccess('Cash EX entry updated successfully.');
      setEditingExpense(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error updating Cash EX');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingExpense) return;
    setDeleting(true);
    setError('');
    setSuccess('');

    try {
      const isPayment = deletingExpense.source === 'PAYMENT';
      const url = isPayment ? `/api/payments/${deletingExpense.id}` : `/api/cash-ex/${deletingExpense.id}`;
      const res = await fetch(url, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete Cash EX');

      setSuccess('Cash EX entry deleted.');
      setDeletingExpense(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting Cash EX');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Cash EX Expenses'>
      <div style={{ padding: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className='section-heading' style={{ marginBottom: 0 }}>💸 Cash EX Entries (Jama List)</div>
          <Link href='/cash-ex/new' className='win95-btn win95-btn-primary' style={{ textDecoration: 'none', fontWeight: 'bold' }}>
            ➕ New Cash EX
          </Link>
        </div>
        <div className='alert-box info' style={{ marginBottom: 8 }}>
          <strong>💸 Cash EX:</strong> Manual Cash EX jama entries. Yeh vyapari khate mein jama hote hain aur invoice statement mein Date ke sath &ldquo;Cash EX&rdquo; aur Payment amount ke roop mein aate hain.
        </div>

        {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        <div className='toolbar' style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
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
                <th>Date</th>
                <th>Party</th>
                <th className='num'>Payment Amount (₹)</th>
                <th>Notes / Reference</th>
                {role !== 'VIEWER' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && expenses.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No Cash EX entries found.</td></tr>
              )}
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    {e.partyId ? (
                      <Link href={`/ledger/${e.partyId}`} className='party-name-link'>
                        {e.party?.name ?? '—'}
                      </Link>
                    ) : (
                      e.party?.name ?? '—'
                    )}
                  </td>
                  <td className='amount' style={{ color: '#15803d', fontWeight: 'bold' }}>{fmt(e.amount)}</td>
                  <td style={{ fontSize: 11 }}>{e.notes || '—'}</td>
                  {role !== 'VIEWER' && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className='win95-btn'
                          style={{ fontSize: 10, padding: '1px 6px' }}
                          onClick={() => startEdit(e)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className='win95-btn win95-btn-danger'
                          style={{ fontSize: 10, padding: '1px 6px' }}
                          onClick={() => setDeletingExpense(e)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>TOTAL CASH EX</strong></td>
                  <td className='amount' style={{ color: '#15803d' }}><strong>{fmt(totalExpense)}</strong></td>
                  <td colSpan={role !== 'VIEWER' ? 2 : 1}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Edit Cash EX Modal */}
        {editingExpense && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 380 }}>
              <div className='title-bar'>
                <span className='title-bar-text'>✏️ Edit Cash EX</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setEditingExpense(null)}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSaveEdit}>
                <div className='modal-body' style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: '#333', background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1' }}>
                    <div><strong>Party:</strong> {editingExpense.party?.name || editingExpense.payment?.party?.name || '—'}</div>
                  </div>

                  <div className='form-field'>
                    <label className='form-label'>Payment Amount (₹) *</label>
                    <input
                      className='win95-input' type='number' step='0.01'
                      value={editForm.expenseAmount}
                      onChange={e => setEditForm(f => ({ ...f, expenseAmount: e.target.value }))}
                      required
                    />
                  </div>

                  <div className='form-field'>
                    <label className='form-label'>Notes / Reference (Optional)</label>
                    <input
                      className='win95-input'
                      value={editForm.overrideReason}
                      onChange={e => setEditForm(f => ({ ...f, overrideReason: e.target.value }))}
                      placeholder='e.g. Mandi cash ex'
                    />
                  </div>
                </div>

                <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                  <button type='button' className='win95-btn' onClick={() => setEditingExpense(null)}>
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
        {deletingExpense && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 380 }}>
              <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                <span className='title-bar-text'>⚠️ Confirm Delete Cash EX</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setDeletingExpense(null)}
                >
                  ✕
                </button>
              </div>
              <div className='modal-body' style={{ padding: 14 }}>
                <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                  Kya aap is Cash EX entry ko delete karna chahte hain?
                </p>
                <div style={{ fontSize: 11, color: '#333', background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', marginBottom: 8 }}>
                  <div><strong>Party:</strong> {deletingExpense.party?.name || deletingExpense.payment?.party?.name || '—'}</div>
                  <div><strong>Payment Amount:</strong> {fmt(deletingExpense.amount)}</div>
                </div>
              </div>
              <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                <button className='win95-btn' onClick={() => setDeletingExpense(null)}>Cancel</button>
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
