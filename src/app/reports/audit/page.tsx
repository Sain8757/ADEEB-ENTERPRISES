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

export default function AuditPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  async function load() {
    if (role !== 'ADMIN') { setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (entity) params.set('entity', entity);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/audit?${params}`);
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, entity, from, to, role]);

  if (role !== 'ADMIN') {
    return (
      <AppShell currentPage='Audit Log'>
        <div className='alert-box error' style={{ margin: 16 }}>🔒 Audit log is restricted to Administrators only.</div>
      </AppShell>
    );
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Audit Log'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>🔍 Audit Log</div>
        <div className='toolbar' style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <select className='win95-select' style={{ width: 160 }} value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}>
            <option value=''>All Entities</option>
            <option value='Party'>Party</option>
            <option value='PurchaseEntry'>Purchase</option>
            <option value='Payment'>Payment</option>
            <option value='CashExExpense'>Cash EX</option>
            <option value='Business'>Settings</option>
          </select>
          <label className='form-label' style={{ marginLeft: 8 }}>From:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => setFrom(e.target.value)} />
          <label className='form-label' style={{ marginLeft: 4 }}>To:</label>
          <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className='toolbar-btn' onClick={() => { setPage(1); load(); }}>⟳ Refresh</button>
        </div>

        <div className='table-container'>
          <table className='win95-table' style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Timestamp</th><th>User</th><th>Action</th>
                <th>Entity</th><th>Entity ID</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>Loading...</td></tr>}
              {!loading && logs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No audit records found.</td></tr>}
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 10 }}>{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                  <td>{log.user?.name || log.userEmail || 'System'}</td>
                  <td><span style={{ fontWeight: 'bold', fontSize: 10 }}>{log.action}</span></td>
                  <td>{log.entity}</td>
                  <td style={{ fontSize: 9, color: '#808080', maxWidth: 100 }}>{log.entityId?.slice(0, 12) ?? '—'}…</td>
                  <td style={{ maxWidth: 200, fontSize: 10 }}>{log.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className='win95-btn' onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>◀ Prev</button>
          <span style={{ fontSize: 11 }}>Page {page}</span>
          <button className='win95-btn' onClick={() => setPage(page + 1)} disabled={logs.length < 50}>Next ▶</button>
        </div>
      </div>
    </AppShell>
  );
}
