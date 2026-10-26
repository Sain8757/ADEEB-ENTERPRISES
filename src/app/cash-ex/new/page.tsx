'use client';
// ADEEB ENTERPRISES — New Cash EX Expense Entry Page
// Records Cash EX expense for a party (independent firm expense)

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';
import Link from 'next/link';

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function NewCashExContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prePartyId = searchParams.get('partyId') || '';
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState(prePartyId);
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/parties')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setParties(d);
          if (!partyId && d.length > 0) setPartyId(d[0].id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partyId) {
      setError('Please select a party.');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId,
          date,
          direction: 'RECEIVED',
          method: 'CASH_EX',
          amount,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record Cash EX');
      }

      setSuccess(`Cash EX of ${fmt(amount)} recorded successfully!`);
      setTimeout(() => router.push(`/ledger/${partyId}?tab=cashex`), 1000);
    } catch (err: any) {
      setError(err.message || 'Network error while saving Cash EX');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='New Cash EX Entry'>
      <div style={{ padding: 12, maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className='section-heading' style={{ marginBottom: 0 }}>💸 New Cash EX (Jama Entry)</div>
          <Link href={partyId ? `/ledger/${partyId}` : '/cash-ex'} className='win95-btn' style={{ textDecoration: 'none', fontSize: 11 }}>
            ⬅️ Cancel
          </Link>
        </div>

        <div className='alert-box info' style={{ marginBottom: 12, fontSize: 11 }}>
          <strong>ℹ️ Cash EX:</strong> Party ke khate mein Cash EX jama darj karein. Yeh invoice list mein Date ke sath &ldquo;Cash EX&rdquo; aur Payment amount ke roop mein dikhega.
        </div>

        {success && <div className='alert-box success' style={{ marginBottom: 10 }}>✅ {success}</div>}
        {error && <div className='alert-box error' style={{ marginBottom: 10 }}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit} className='group-box'>
          <div className='group-box-title'>Cash EX Details</div>

          <div className='form-row' style={{ marginTop: 8 }}>
            <div className='form-field' style={{ flex: 1 }}>
              <label className='form-label'>Party (Vyapari) *</label>
              <select
                className='win95-select'
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                required
              >
                <option value=''>— Select Party —</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.mobile ? `(${p.mobile})` : ''}</option>
                ))}
              </select>
            </div>
            <div className='form-field' style={{ flex: 1 }}>
              <label className='form-label'>Date *</label>
              <input
                className='win95-input'
                type='date'
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className='form-field' style={{ marginTop: 8 }}>
            <label className='form-label'>Payment Amount (₹) *</label>
            <input
              className='win95-input'
              type='number'
              step='0.01'
              min='0.01'
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder='e.g. 1500'
              required
            />
          </div>

          <div className='form-field' style={{ marginTop: 8, marginBottom: 12 }}>
            <label className='form-label'>Notes / Reference (Optional)</label>
            <input
              className='win95-input'
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder='e.g. Mandi cash ex'
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Link href={partyId ? `/ledger/${partyId}` : '/cash-ex'} className='win95-btn' style={{ textDecoration: 'none' }}>
              Cancel
            </Link>
            <button
              type='submit'
              className='win95-btn win95-btn-primary'
              disabled={saving}
              style={{ fontWeight: 'bold', minWidth: 140 }}
            >
              {saving ? 'Saving...' : '💾 Save Cash EX'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export default function NewCashExPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading...</div>}>
      <NewCashExContent />
    </Suspense>
  );
}
