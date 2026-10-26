'use client';
// ADEEB ENTERPRISES — Purchase Entry Form
// Calculates average weight and amount automatically using Decimal.js rules.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

function safeDiv(num: number, den: number): string {
  if (!den || den === 0) return '0.000';
  return (num / den).toFixed(3);
}

function safeMul(a: string, b: string): string {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (isNaN(na) || isNaN(nb)) return '0.00';
  return (na * nb).toFixed(2);
}

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

export default function NewPurchasePage() {
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
    receiptNo: '',
    qty: '',
    category: '' as 'BC' | 'SC' | '',
    totalWeight: '',
    rate: '',
    notes: '',
  });

  // Calculated values
  const avgWeight = form.qty && form.totalWeight
    ? safeDiv(parseFloat(form.totalWeight), parseFloat(form.qty))
    : '';
  const amount = form.totalWeight && form.rate
    ? safeMul(form.totalWeight, form.rate)
    : '';

  useEffect(() => {
    fetch('/api/parties').then(r => r.json()).then(d => setParties(Array.isArray(d) ? d : []));
  }, []);

  // Suggest last rate for this party + category
  useEffect(() => {
    if (!form.partyId || !form.category) return;
    fetch(`/api/purchases?partyId=${form.partyId}&limit=1`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const last = data.find((p: any) => p.category === form.category);
          if (last && !form.rate) {
            setForm(f => ({ ...f, rate: last.rate.toString() }));
          }
        }
      }).catch(() => {});
  }, [form.partyId, form.category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyId) { setError('Please select a party.'); return; }
    if (!form.qty || parseFloat(form.qty) <= 0) { setError('Quantity must be greater than zero.'); return; }
    if (!form.totalWeight || parseFloat(form.totalWeight) <= 0) { setError('Total weight must be greater than zero.'); return; }
    if (!form.rate || parseFloat(form.rate) <= 0) { setError('Rate must be greater than zero.'); return; }

    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        qty: parseInt(form.qty),
        category: form.category ? form.category : null,
      };

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      setSaving(false);

      if (!res.ok) {
        setError(data.error || 'Failed to save purchase.');
        return;
      }
      router.push(`/purchases?success=Purchase+saved`);
    } catch (err: any) {
      setSaving(false);
      setError(err.message || 'Network error occurred while saving.');
    }
  }

  if (role === 'VIEWER') {
    return <AppShell currentPage='Purchase Entry'><div className='alert-box error'>You do not have permission to create purchase entries.</div></AppShell>;
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='New Purchase Entry'>
      <div style={{ padding: 8, maxWidth: 680 }}>
        <div className='section-heading'>🐃 New Purchase Entry</div>

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
                <label className='form-label'>Receipt / Voucher No.</label>
                <input className='win95-input' value={form.receiptNo} onChange={e => setForm(f => ({ ...f, receiptNo: e.target.value }))} placeholder='e.g. 46-50' />
              </div>
            </div>
          </div>

          <div className='group-box'>
            <div className='group-box-title'>Buffalo Details</div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Category (optional)</label>
                <select className='win95-select' value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as 'BC' | 'SC' | '' }))}>
                  <option value=''>— None / Blank —</option>
                  <option value='BC'>B/C — Big Cattle</option>
                  <option value='SC'>S/C — Small Cattle</option>
                </select>
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Quantity (no. of buffaloes) *</label>
                <input className='win95-input' type='number' min='1' step='1' value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} required />
              </div>
            </div>

            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Total Weight (kg) *</label>
                <input className='win95-input' type='number' min='0.001' step='0.001' value={form.totalWeight}
                  onChange={e => setForm(f => ({ ...f, totalWeight: e.target.value }))} required />
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Average Weight (kg)</label>
                <input className='win95-input' value={avgWeight} readOnly
                  style={{ background: '#dfdfdf', color: '#808080' }}
                  title='Auto-calculated: Total Weight ÷ Quantity' />
              </div>
            </div>

            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Rate per kg (₹) *</label>
                <input className='win95-input' type='number' min='0.01' step='0.01' value={form.rate}
                  onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} required />
              </div>
              <div className='form-field' style={{ flex: 1 }}>
                <label className='form-label'>Amount (₹)</label>
                <input className='win95-input' value={amount ? fmt(amount) : ''} readOnly
                  style={{ background: '#dfdfdf', color: '#000', fontWeight: 'bold' }}
                  title='Auto-calculated: Total Weight × Rate' />
              </div>
            </div>

            {/* Calculation display */}
            {avgWeight && amount && (
              <div style={{ background: '#fffacc', border: '1px solid #808000', padding: '4px 8px', fontSize: 10, marginTop: 4 }}>
                📐 <strong>Calculation:</strong> Avg. Weight = {form.totalWeight} ÷ {form.qty} = <strong>{avgWeight} kg</strong>
                &nbsp;|&nbsp; Amount = {form.totalWeight} × ₹{form.rate} = <strong>{fmt(amount)}</strong>
              </div>
            )}
          </div>

          <div className='group-box'>
            <div className='group-box-title'>Notes</div>
            <div className='form-row'>
              <div className='form-field' style={{ flex: 1 }}>
                <textarea className='win95-input' rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder='Optional notes...' style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type='button' className='win95-btn' onClick={() => router.back()}>Cancel</button>
            <button type='submit' className='win95-btn win95-btn-primary' disabled={saving}>
              {saving ? 'Saving...' : '✅ Save Purchase Entry'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
