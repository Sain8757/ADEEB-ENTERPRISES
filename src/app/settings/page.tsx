'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';

export default function SettingsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
    setSaved(true);
    setSettings(data);
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='Settings'>
      <div style={{ padding: 8, maxWidth: 600 }}>
        <div className='section-heading'>⚙️ Settings — Business Profile</div>
        {role !== 'ADMIN' && <div className='alert-box warning' style={{ marginBottom: 8 }}>⚠️ Only administrators can change settings. You can view but not save.</div>}
        {saved && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ Settings saved successfully.</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>{error}</div>}

        <form onSubmit={handleSave}>
          <div className='group-box'>
            <div className='group-box-title'>Business Identity</div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Business Name</label>
                <input className='win95-input' value={settings.name ?? ''} onChange={e => setSettings((s: any) => ({ ...s, name: e.target.value }))} disabled={role !== 'ADMIN'} />
              </div>
            </div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Mobile Number</label>
                <input className='win95-input' value={settings.mobile ?? ''} onChange={e => setSettings((s: any) => ({ ...s, mobile: e.target.value }))} disabled={role !== 'ADMIN'} />
              </div>
            </div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Address</label>
                <textarea className='win95-input' rows={2} value={settings.address ?? ''} onChange={e => setSettings((s: any) => ({ ...s, address: e.target.value }))} disabled={role !== 'ADMIN'} style={{ resize: 'vertical', width: '100%' }} />
              </div>
            </div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Statement Footer Note</label>
                <textarea className='win95-input' rows={2} value={settings.statementFooter ?? ''} onChange={e => setSettings((s: any) => ({ ...s, statementFooter: e.target.value }))} disabled={role !== 'ADMIN'} style={{ resize: 'vertical', width: '100%' }} />
              </div>
            </div>
          </div>

          {role === 'ADMIN' && (
            <div style={{ marginTop: 8 }}>
              <button type='submit' className='win95-btn win95-btn-primary' disabled={saving}>
                {saving ? 'Saving...' : '✅ Save Settings'}
              </button>
            </div>
          )}
        </form>

        {/* ── TRASH BIN (Settings ke andar) ── */}
        <div className='group-box' style={{ marginTop: 16 }}>
          <div className='group-box-title'>🗑️ Trash Bin (Recycle Bin)</div>
          <p style={{ fontSize: 11, color: '#334155', marginBottom: 10 }}>
            Deactivated parties are kept in Trash for 30 days before permanent deletion. You can restore or permanently delete them here.
          </p>
          <a
            href='/trash'
            className='win95-btn'
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              fontWeight: 'bold',
              background: '#f1f5f9',
              color: '#0f172a'
            }}
          >
            🗑️ Open Trash Bin →
          </a>
        </div>

        <div className='group-box' style={{ marginTop: 16 }}>
          <div className='group-box-title'>Your Account</div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Name: <strong>{session?.user?.name}</strong></div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Email: <strong>{session?.user?.email}</strong></div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Role: <strong>{role}</strong></div>
          <a href='/api/auth/signout' className='win95-btn win95-btn-danger' style={{ textDecoration: 'none', display: 'inline-block' }}>Sign Out</a>
        </div>
      </div>
    </AppShell>
  );
}
