'use client';
// ADEEB ENTERPRISES — Party Management Page
// List, create, search, and manage parties.

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

export default function PartiesPage() {
  const { data: session } = useSession();
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dupWarning, setDupWarning] = useState<{ existingId: string; message: string } | null>(null);
  const [pendingData, setPendingData] = useState<any>(null);

  const [form, setForm] = useState({
    name: '', mobile: '', address: '', code: '',
    openingBalance: '0', openingBalanceDirection: 'DR',
    openingBalanceDate: '', notes: '',
  });

  const role = (session?.user as any)?.role;

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/parties?search=${encodeURIComponent(search)}&includeInactive=${showInactive}`);
    const data = await res.json();
    setParties(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, showInactive]);

  async function handleCreate(confirmDuplicate = false) {
    setSaving(true);
    setError('');
    const body = confirmDuplicate ? { ...pendingData, confirmDuplicate: true } : form;
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);

    if (res.status === 409 && data.warning === 'DUPLICATE') {
      setDupWarning({ existingId: data.existingId, message: data.message });
      setPendingData(form);
      return;
    }
    if (!res.ok) {
      setError(data.error || 'Failed to create party.');
      return;
    }
    setSuccess(`Party "${data.name}" created successfully.`);
    setShowNew(false);
    setDupWarning(null);
    setForm({ name: '', mobile: '', address: '', code: '', openingBalance: '0', openingBalanceDirection: 'DR', openingBalanceDate: '', notes: '' });
    load();
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Parties'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>👥 Party Management</div>

        {/* Toolbar */}
        <div className='toolbar' style={{ marginBottom: 8 }}>
          <input
            type='text' placeholder='Search parties...'
            value={search} onChange={e => setSearch(e.target.value)}
            className='win95-input' style={{ width: 200 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginLeft: 8 }}>
            <input type='checkbox' checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className='win95-checkbox' />
            Show inactive
          </label>
          <div className='toolbar-separator' />
          {role !== 'VIEWER' && (
            <button className='win95-btn win95-btn-primary' onClick={() => { setShowNew(true); setError(''); setSuccess(''); }}>
              ➕ New Party
            </button>
          )}
          <button className='toolbar-btn' onClick={load} title='Refresh'>⟳ Refresh</button>
        </div>

        {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        {/* Party table */}
        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Party Name</th>
                <th>Mobile</th>
                <th className='num'>Opening Balance</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#808080', padding: 8 }}>Loading...</td></tr>}
              {!loading && parties.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#808080', padding: 8 }}>No parties found. Create the first party.</td></tr>
              )}
              {parties.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: '#808080' }}>{p.code || '—'}</td>
                  <td>
                    <Link href={`/ledger/${p.id}`} className='party-name-link'>
                      {p.name}
                    </Link>
                  </td>
                  <td>{p.mobile || '—'}</td>
                  <td className='amount'>{fmt(p.openingBalance)}</td>
                  <td>
                    <span className={p.openingBalanceDirection === 'DR' ? 'ledger-balance-dr' : 'ledger-balance-cr'}>
                      {p.openingBalanceDirection === 'DR' ? 'Receivable (DR)' : 'Payable (CR)'}
                    </span>
                  </td>
                  <td>{p.active ? '✅ Active' : '❌ Inactive'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Link href={`/ledger/${p.id}`} className='win95-btn' style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px', fontWeight: 'bold' }}>
                        📒 Ledger
                      </Link>
                      <Link href={`/ledger/${p.id}?tab=purchases`} className='win95-btn' style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px' }}>
                        🐃 Kharid
                      </Link>
                      <Link href={`/ledger/${p.id}?tab=payments`} className='win95-btn' style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px' }}>
                        💰 Jama
                      </Link>
                      <a href={`/api/statement/${p.id}/pdf`} target='_blank' rel='noreferrer' className='win95-btn' style={{ textDecoration: 'none', fontSize: 10, padding: '2px 6px' }}>
                        🖨️ PDF
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Duplicate warning dialog */}
        {dupWarning && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 380 }}>
              <div className='title-bar'>
                <span className='title-bar-text'>⚠️ Duplicate Party Warning</span>
              </div>
              <div className='modal-body'>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 32 }}>⚠️</span>
                  <div>
                    <p style={{ marginBottom: 8 }}>{dupWarning.message}</p>
                    <p style={{ fontSize: 11, color: '#808080' }}>
                      If this is a different party with a similar name, click <strong>Create Anyway</strong>.
                      To view the existing party, click <strong>View Existing</strong>.
                    </p>
                  </div>
                </div>
              </div>
              <div className='modal-footer'>
                <Link href={`/parties/${dupWarning.existingId}`} className='win95-btn' style={{ textDecoration: 'none' }}>View Existing</Link>
                <button className='win95-btn' onClick={() => setDupWarning(null)}>Cancel</button>
                <button className='win95-btn win95-btn-primary' onClick={() => handleCreate(true)}>Create Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* New Party Dialog */}
        {showNew && (
          <div className='modal-overlay'>
            <div className='modal-window' style={{ width: 480 }}>
              <div className='title-bar'>
                <span className='title-bar-text'>➕ New Party</span>
                <button className='title-btn' onClick={() => setShowNew(false)}>✕</button>
              </div>
              <div className='modal-body'>
                {error && <div className='alert-box error' style={{ marginBottom: 8 }}>{error}</div>}
                <div className='form-row'>
                  <div className='form-field' style={{ flex: 2 }}>
                    <label className='form-label'>Party Name *</label>
                    <input className='win95-input' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className='form-field' style={{ flex: 1 }}>
                    <label className='form-label'>Code</label>
                    <input className='win95-input' value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
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
                <div className='group-box' style={{ marginTop: 8 }}>
                  <div className='group-box-title'>Opening Balance</div>
                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Amount (₹)</label>
                      <input className='win95-input' type='number' min='0' step='0.01' value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Direction</label>
                      <select className='win95-select' value={form.openingBalanceDirection} onChange={e => setForm(f => ({ ...f, openingBalanceDirection: e.target.value }))}>
                        <option value='DR'>DR — Party owes us (Receivable)</option>
                        <option value='CR'>CR — We owe party (Payable)</option>
                      </select>
                    </div>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Effective Date</label>
                      <input className='win95-input' type='date' value={form.openingBalanceDate} onChange={e => setForm(f => ({ ...f, openingBalanceDate: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#808080', marginTop: 4 }}>
                    Opening balance = back dues before this system&apos;s history. DR = party owes ADEEB ENTERPRISES. CR = ADEEB ENTERPRISES owes party.
                  </div>
                </div>
                <div className='form-row'>
                  <div className='form-field' style={{ flex: 1 }}>
                    <label className='form-label'>Notes</label>
                    <textarea className='win95-input' rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                  </div>
                </div>
              </div>
              <div className='modal-footer'>
                <button className='win95-btn' onClick={() => setShowNew(false)}>Cancel</button>
                <button className='win95-btn win95-btn-primary' disabled={saving || !form.name} onClick={() => handleCreate()}>
                  {saving ? 'Saving...' : 'Create Party'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
