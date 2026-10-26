'use client';
// ADEEB ENTERPRISES — Party Detail & Edit Page
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
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

export default function PartyDetailPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const params = useParams();
  const router = useRouter();
  const partyId = params?.id as string;

  const [party, setParty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ name: '', mobile: '', address: '', notes: '' });
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/parties/${partyId}`);
    if (res.ok) {
      const data = await res.json();
      setParty(data);
      setForm({ name: data.name, mobile: data.mobile ?? '', address: data.address ?? '', notes: data.notes ?? '' });
    }
    setLoading(false);
  }

  useEffect(() => { if (partyId) load(); }, [partyId]);

  async function handleSave() {
    setSaving(true); setError('');
    const res = await fetch(`/api/parties/${partyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
    setParty(data);
    setEditing(false);
    setSuccess('Party updated successfully.');
  }

  async function handleConfirmDeactivate() {
    setDeactivating(true);
    const res = await fetch(`/api/parties/${partyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    setDeactivating(false);
    if (res.ok) {
      setShowDeactivateModal(false);
      router.push('/trash');
    } else {
      setError('Failed to deactivate party.');
    }
  }

  if (loading) return <AppShell currentPage='Party Detail'><div style={{ padding: 16, color: '#808080' }}>Loading...</div></AppShell>;
  if (!party) return <AppShell currentPage='Party Detail'><div className='alert-box error' style={{ margin: 16 }}>Party not found.</div></AppShell>;

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage={`Party — ${party.name}`}>
      <div style={{ padding: 8, maxWidth: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className='section-heading' style={{ marginBottom: 0 }}>👤 {party.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={`/api/statement/${partyId}/pdf`} target='_blank' rel='noreferrer' className='win95-btn' style={{ textDecoration: 'none' }}>🖨️ PDF Statement</a>
            <Link href={`/ledger/${partyId}`} className='win95-btn' style={{ textDecoration: 'none' }}>📒 View Ledger</Link>
            <Link href={`/purchases/new?partyId=${partyId}`} className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>🐃 New Purchase</Link>
            <Link href={`/payments/new?partyId=${partyId}`} className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>💰 New Payment</Link>
          </div>
        </div>

        {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        {/* Party summary tiles */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Opening Balance</div>
            <div className='stat-tile-value'>{fmt(party.openingBalance)}</div>
            <div style={{ fontSize: 10, color: '#808080' }}>{party.openingBalanceDirection} as of {party.openingBalanceDate ? new Date(party.openingBalanceDate).toLocaleDateString('en-IN') : 'N/A'}</div>
          </div>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Total Purchases</div>
            <div className='stat-tile-value'>{fmt(party.purchases?.reduce((s: number, p: any) => s + parseFloat(p.amount), 0) ?? 0)}</div>
            <div style={{ fontSize: 10, color: '#808080' }}>{party.purchases?.length ?? 0} entries</div>
          </div>
          <div className='stat-tile'>
            <div className='stat-tile-label'>Status</div>
            <div className='stat-tile-value' style={{ fontSize: 14 }}>{party.active ? '✅ Active' : '❌ Inactive'}</div>
          </div>
        </div>

        {/* Edit form */}
        <div className='group-box'>
          <div className='group-box-title' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Party Details</span>
            {role !== 'VIEWER' && !editing && (
              <button className='win95-btn' style={{ fontSize: 10 }} onClick={() => setEditing(true)}>✏️ Edit</button>
            )}
          </div>

          {!editing ? (
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div><strong>Name:</strong> {party.name}</div>
              <div><strong>Code:</strong> {party.code || '—'}</div>
              <div><strong>Mobile:</strong> {party.mobile || '—'}</div>
              <div><strong>Address:</strong> {party.address || '—'}</div>
              <div><strong>Notes:</strong> {party.notes || '—'}</div>
            </div>
          ) : (
            <>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 2 }}>
                  <label className='form-label'>Party Name *</label>
                  <input className='win95-input' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
              </div>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 1 }}>
                  <label className='form-label'>Mobile</label>
                  <input className='win95-input' value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
                </div>
              </div>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 1 }}>
                  <label className='form-label'>Address</label>
                  <input className='win95-input' value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
              </div>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 1 }}>
                  <label className='form-label'>Notes</label>
                  <textarea className='win95-input' rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button className='win95-btn' onClick={() => setEditing(false)}>Cancel</button>
                <button className='win95-btn win95-btn-primary' onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : '✅ Save Changes'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Recent purchases */}
        {party.purchases?.length > 0 && (
          <div className='group-box' style={{ marginTop: 8 }}>
            <div className='group-box-title'>Recent Purchases (last 5)</div>
            <div className='table-container'>
              <table className='win95-table' style={{ width: '100%' }}>
                <thead><tr><th>Date</th><th>Receipt</th><th>Cat.</th><th className='num'>Qty</th><th className='num'>Weight</th><th className='num'>Amount</th></tr></thead>
                <tbody>
                  {(party.purchases ?? []).slice(0, 5).map((p: any) => (
                    <tr key={p.id}>
                      <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                      <td>{p.receiptNo || '—'}</td>
                      <td><span className={`category-badge ${p.category === 'BC' ? 'bc' : p.category === 'SC' ? 'sc' : 'vc'}`}>{p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : 'V/C'}</span></td>
                      <td className='num'>{p.qty}</td>
                      <td className='num'>{parseFloat(p.totalWeight).toFixed(1)}</td>
                      <td className='amount'>{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Danger zone */}
        {role === 'ADMIN' && party.active && (
          <div className='group-box' style={{ marginTop: 16, borderColor: '#800000' }}>
            <div className='group-box-title' style={{ color: '#800000' }}>⚠️ Danger Zone</div>
            <div style={{ fontSize: 11, color: '#808080', marginBottom: 8 }}>
              Deactivating moves this party to the Trash Bin for 30 days. Ledger data and transactions remain preserved.
            </div>
            <button className='win95-btn win95-btn-danger' onClick={() => setShowDeactivateModal(true)}>
              🗑️ Deactivate & Move to Trash
            </button>
          </div>
        )}

        {/* Deactivate / Trash Modal */}
        {showDeactivateModal && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 420 }}>
              <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                <span className='title-bar-text'>⚠️ Confirm Move to Trash</span>
                <button
                  style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                  onClick={() => setShowDeactivateModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className='modal-body' style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 32 }}>🗑️</span>
                  <div>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                      Kya aap sure hain ki "{party.name}" ko Trash mein bhejna chahte hain?
                    </p>
                    <p style={{ fontSize: 11, color: '#333', lineHeight: 1.5, marginBottom: 8 }}>
                      Yeh party agle <strong>30 din</strong> tak Sidebar ke <strong>Trash Bin</strong> mein rahegi. Aap ise wahan se kabhi bhi restore (wapas) kar sakte hain ya permanent delete kar sakte hain.
                    </p>
                  </div>
                </div>
              </div>
              <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                <button className='win95-btn' onClick={() => setShowDeactivateModal(false)}>
                  Cancel
                </button>
                <button
                  className='win95-btn win95-btn-danger'
                  onClick={handleConfirmDeactivate}
                  disabled={deactivating}
                >
                  {deactivating ? 'Moving to Trash...' : '🗑️ Haan, Trash me bhejo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
