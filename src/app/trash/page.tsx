'use client';
// ADEEB ENTERPRISES — Trash / Recycle Bin Page
// Shows deactivated/deleted parties with 30-day retention countdown, restore, and permanent delete.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';
import Link from 'next/link';

function fmt(v: string | number) {
  const n = parseFloat(String(v));
  if (isNaN(n)) return '0.00';
  const abs = Math.abs(n).toFixed(2);
  const [i, d] = abs.split('.');
  const groups: string[] = [];
  let rest = i;
  if (rest.length > 3) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) groups.unshift(rest);
  return `₹${groups.join(',')}.${d}`;
}

export default function TrashPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteModalParty, setDeleteModalParty] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/parties?trash=true');
      const data = await res.json();
      setParties(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load trash parties.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRestore(party: any) {
    setActioningId(party.id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/parties/${party.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) throw new Error('Failed to restore party');
      setSuccess(`Party "${party.name}" has been restored to active list.`);
      load();
    } catch (err: any) {
      setError(err.message || 'Error restoring party.');
    } finally {
      setActioningId(null);
    }
  }

  async function handlePermanentDelete() {
    if (!deleteModalParty) return;
    const p = deleteModalParty;
    setActioningId(p.id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/parties/${p.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete permanently');
      setSuccess(`Party "${p.name}" permanently deleted.`);
      setDeleteModalParty(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting party.');
    } finally {
      setActioningId(null);
    }
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Trash / Recycle Bin'>
      <div style={{ padding: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div className='section-heading' style={{ marginBottom: 2 }}>🗑️ Trash / Recycle Bin (Deactivated Parties)</div>
            <div style={{ fontSize: 11, color: '#808080' }}>
              Deactivated parties remain here for 30 days. You can restore them anytime or permanently delete them.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link href='/settings' className='toolbar-btn' style={{ textDecoration: 'none' }}>⚙️ Settings</Link>
            <button className='toolbar-btn' onClick={load}>⟳ Refresh</button>
          </div>
        </div>

        {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Party Name</th>
                <th>Code</th>
                <th>Mobile</th>
                <th>Opening Bal</th>
                <th>Moved to Trash</th>
                <th>Retention Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>Loading trash items...</td>
                </tr>
              )}
              {!loading && parties.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                    🎉 Trash is empty. No deactivated parties found.
                  </td>
                </tr>
              )}
              {parties.map((p) => {
                const deletedDate = p.deletedAt ? new Date(p.deletedAt) : new Date(p.updatedAt);
                const daysInTrash = Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
                const daysRemaining = Math.max(0, 30 - daysInTrash);

                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td style={{ color: '#808080' }}>{p.code || '—'}</td>
                    <td>{p.mobile || '—'}</td>
                    <td className='amount'>{fmt(p.openingBalance)} {p.openingBalanceDirection}</td>
                    <td>{deletedDate.toLocaleDateString('en-IN')}</td>
                    <td>
                      {daysRemaining > 0 ? (
                        <span style={{ color: daysRemaining < 7 ? '#d9534f' : '#337ab7', fontWeight: 'bold', fontSize: 11 }}>
                          ⏳ {daysRemaining} days left (30d limit)
                        </span>
                      ) : (
                        <span style={{ color: '#800000', fontWeight: 'bold', fontSize: 11 }}>
                          ⚠️ Expired (30+ days)
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className='win95-btn'
                          style={{ fontSize: 11, padding: '2px 8px', color: '#008000', fontWeight: 'bold' }}
                          onClick={() => handleRestore(p)}
                          disabled={actioningId === p.id}
                        >
                          ♻️ Restore
                        </button>
                        {role === 'ADMIN' && (
                          <button
                            className='win95-btn win95-btn-danger'
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={() => setDeleteModalParty(p)}
                            disabled={actioningId === p.id}
                          >
                            ❌ Delete Permanently
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Permanent Delete Modal */}
        {deleteModalParty && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 420 }}>
              <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                <span className='title-bar-text'>⚠️ Confirm Permanent Deletion</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setDeleteModalParty(null)}
                >
                  ✕
                </button>
              </div>
              <div className='modal-body' style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 32 }}>🛑</span>
                  <div>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                      Are you sure you want to permanently delete "{deleteModalParty.name}"?
                    </p>
                    <p style={{ fontSize: 11, color: '#800000', lineHeight: 1.5, marginBottom: 8 }}>
                      This action cannot be undone. All purchases, payments, and ledger entries for this party will be permanently purged from the database.
                    </p>
                  </div>
                </div>
              </div>
              <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                <button className='win95-btn' onClick={() => setDeleteModalParty(null)}>
                  Cancel
                </button>
                <button
                  className='win95-btn win95-btn-danger'
                  onClick={handlePermanentDelete}
                  disabled={actioningId === deleteModalParty.id}
                >
                  {actioningId === deleteModalParty.id ? 'Deleting...' : '🗑️ Yes, Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
