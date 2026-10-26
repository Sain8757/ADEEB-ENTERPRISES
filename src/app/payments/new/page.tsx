'use client';
// ADEEB ENTERPRISES — Payment Entry Form
// Handles direction (RECEIVED/PAID), method, Cash EX preview.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const PAYMENT_METHODS = [
  { code: 'CASH', label: 'Cash' },
  { code: 'AC', label: 'A/C (Bank Transfer)' },
  { code: 'ADVANCE_JAMA', label: 'Advance Jama' },
  { code: 'CASH_EX', label: 'Cash EX' },
];

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

export default function NewPaymentPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;

  const [parties, setParties] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    date: today,
    partyId: '',
    refNo: '',
    direction: 'RECEIVED' as 'RECEIVED' | 'PAID',
    method: 'CASH',
    amount: '',
    notes: '',
    bankRef: '',
  });

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyId) { setError('Please select a party.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Amount must be greater than zero.'); return; }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);

      if (!res.ok) {
        setError(data.error || 'Failed to save payment.');
        return;
      }
      router.push('/payments?success=Payment+saved');
    } catch (err: any) {
      setSaving(false);
      setError(err.message || 'Network error occurred while saving.');
    }
  }

  if (role === 'VIEWER') {
    return <AppShell currentPage='New Payment'><div className='alert-box error'>Read-only access — cannot create payments.</div></AppShell>;
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='New Payment Entry'>
      <div style={{ padding: 8, maxWidth: 620 }}>
        <div className='section-heading'>💰 New Payment Entry</div>

        <form onSubmit={handleSubmit}>
          {error && <div className='alert-box error' style={{ marginBottom: 8 }}>{error}</div>}

          <div className='group-box'>
            <div className='group-box-title'>Transaction Details</div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Date *</label>
                <input className='win95-input' type='date' value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className='form-field' style={{ flex: 2 }}>
                <label className='form-label'>Party *</label>
                <select className='win95-select' value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))} required>
                  <option value=''>— Select Party —</option>
                  {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Reference / Voucher No.</label>
                <input className='win95-input' value={form.refNo} onChange={e => setForm(f => ({ ...f, refNo: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className='group-box'>
            <div className='group-box-title'>Payment Details</div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Direction *</label>
                <select className='win95-select' value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as 'RECEIVED' | 'PAID' }))}>
                  <option value='RECEIVED'>RECEIVED — from party</option>
                  <option value='PAID'>PAID — to party</option>
                </select>
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Payment Method *</label>
                <select className='win95-select' value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Amount (₹) *</label>
                <input className='win95-input' type='number' min='0.01' step='0.01' value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Bank / Transaction Reference</label>
                <input className='win95-input' value={form.bankRef} onChange={e => setForm(f => ({ ...f, bankRef: e.target.value }))} placeholder='Optional' />
              </div>
            </div>

          </div>

          <div className='group-box'>
            <div className='group-box-title'>Notes</div>
            <textarea className='win95-input' rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder='Optional notes...' style={{ resize: 'vertical', width: '100%' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type='button' className='win95-btn' onClick={() => router.back()}>Cancel</button>
            <button type='submit' className='win95-btn win95-btn-primary' disabled={saving}>
              {saving ? 'Saving...' : '✅ Save Payment Entry'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
