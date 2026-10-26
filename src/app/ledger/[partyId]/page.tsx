'use client';
// ADEEB ENTERPRISES — All-in-One Party Hub
// Unifies Party Ledger, Purchases, Payments, Cash EX, and Profile into a single seamless screen.

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PartyLedgerHubPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const partyId = params?.partyId as string;

  // Tabs: 'ledger' | 'purchases' | 'payments' | 'cashex' | 'profile'
  const initialTab = (searchParams.get('tab') as any) || 'ledger';
  const [activeTab, setActiveTab] = useState<'ledger' | 'purchases' | 'payments' | 'cashex' | 'profile'>(initialTab);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [activePreset, setActivePreset] = useState<'all' | 'today' | 'yesterday' | '1m' | '2m' | '6m' | 'custom'>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Purchase Modal State ─────────────────────────────
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({
    date: toIsoDate(new Date()),
    receiptNo: '',
    qty: 1,
    category: '',
    totalWeight: '',
    rate: '',
    notes: '',
  });
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [deletingPurchase, setDeletingPurchase] = useState<any | null>(null);
  const [deletingPurchaseState, setDeletingPurchaseState] = useState(false);

  // ── Payment Modal State ──────────────────────────────
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: toIsoDate(new Date()),
    refNo: '',
    direction: 'RECEIVED' as 'RECEIVED' | 'PAID',
    method: 'CASH',
    amount: '',
    notes: '',
    applyCashEx: false,
    manualCashExAmount: '',
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [deletingPaymentState, setDeletingPaymentState] = useState(false);

  // ── Cash EX Modal State ──────────────────────────────
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [expenseForm, setExpenseForm] = useState({ expenseAmount: '', overrideReason: '' });
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<any | null>(null);
  const [deletingExpenseState, setDeletingExpenseState] = useState(false);

  // ── Profile / Deactivate State ───────────────────────
  const [profileForm, setProfileForm] = useState({ name: '', mobile: '', address: '', notes: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatingParty, setDeactivatingParty] = useState(false);

  async function load() {
    setLoading(true);
    const qp = new URLSearchParams();
    if (from) qp.set('from', from);
    if (to) qp.set('to', to);
    try {
      const res = await fetch(`/api/ledger/${partyId}?${qp}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (d.party) {
          setProfileForm({
            name: d.party.name,
            mobile: d.party.mobile || '',
            address: d.party.address || '',
            notes: d.party.notes || '',
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (partyId) load();
  }, [partyId, from, to]);

  // Quick Date Range Preset Handlers
  function applyPreset(preset: 'all' | 'today' | 'yesterday' | '1m' | '2m' | '6m') {
    setActivePreset(preset);
    const now = new Date();
    const todayStr = toIsoDate(now);

    if (preset === 'all') {
      setFrom('');
      setTo('');
    } else if (preset === 'today') {
      setFrom(todayStr);
      setTo(todayStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      setFrom(toIsoDate(yest));
      setTo(todayStr);
    } else if (preset === '1m') {
      const m1 = new Date(now);
      m1.setMonth(m1.getMonth() - 1);
      setFrom(toIsoDate(m1));
      setTo(todayStr);
    } else if (preset === '2m') {
      const m2 = new Date(now);
      m2.setMonth(m2.getMonth() - 2);
      setFrom(toIsoDate(m2));
      setTo(todayStr);
    } else if (preset === '6m') {
      const m6 = new Date(now);
      m6.setMonth(m6.getMonth() - 6);
      setFrom(toIsoDate(m6));
      setTo(todayStr);
    }
  }

  const party = data?.party;
  const allEntries: any[] = data?.entries ?? [];
  const purchases: any[] = data?.purchases ?? [];
  const payments: any[] = data?.payments ?? [];
  const cashExExpenses: any[] = data?.cashExExpenses ?? [];

  // Default 10 entries for Ledger
  const displayedEntries = useMemo(() => {
    if (showAllEntries || allEntries.length <= 10) return allEntries;
    return allEntries.slice(-10);
  }, [allEntries, showAllEntries]);

  const lastEntry = allEntries[allEntries.length - 1];
  const lastBal = lastEntry ? parseFloat(lastEntry.runningBalance) : (party ? parseFloat(party.openingBalance) : 0);
  const balDir = lastBal > 0 ? 'DR' : lastBal < 0 ? 'CR' : 'NIL';

  const totalPeriodDebits = allEntries.reduce((s, e) => s + parseFloat(e.debit || 0), 0);
  const totalPeriodCredits = allEntries.reduce((s, e) => s + parseFloat(e.credit || 0), 0);

  // WhatsApp Link
  const whatsappUrl = useMemo(() => {
    if (!party) return '';
    const phone = party.mobile ? party.mobile.replace(/[^0-9]/g, '') : '';
    const dateRangeStr = from && to ? `${from} se ${to}` : 'Shuru se Aaj tak';
    const text = `*ADEEB ENTERPRISES*\n*Khata Parcha — ${party.name}*\nTareekh: ${dateRangeStr}\n---------------------------------\nKharid (Debits): ${fmt(totalPeriodDebits)}\nJama (Credits): ${fmt(totalPeriodCredits)}\n*Baki Hisab (Balance Due): ${fmt(Math.abs(lastBal))} ${balDir}*\n---------------------------------\nComputer-generated statement.`;
    return `https://api.whatsapp.com/send?${phone ? `phone=${phone}&` : ''}text=${encodeURIComponent(text)}`;
  }, [party, from, to, totalPeriodDebits, totalPeriodCredits, lastBal, balDir]);

  // ── Purchase Handlers ────────────────────────────────
  function openNewPurchaseModal() {
    setEditingPurchase(null);
    setPurchaseForm({
      date: toIsoDate(new Date()),
      receiptNo: '',
      qty: 1,
      category: '',
      totalWeight: '',
      rate: '',
      notes: '',
    });
    setPurchaseModalOpen(true);
  }

  function startEditPurchase(p: any) {
    setEditingPurchase(p);
    setPurchaseForm({
      date: toIsoDate(new Date(p.date)),
      receiptNo: p.receiptNo || '',
      qty: p.qty,
      category: p.category || '',
      totalWeight: String(p.totalWeight),
      rate: String(p.rate),
      notes: p.notes || '',
    });
    setPurchaseModalOpen(true);
  }

  async function handleSavePurchase(e: React.FormEvent) {
    e.preventDefault();
    setSavingPurchase(true);
    setError(''); setSuccess('');

    try {
      const url = editingPurchase ? `/api/purchases/${editingPurchase.id}` : `/api/purchases`;
      const method = editingPurchase ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId,
          date: purchaseForm.date,
          receiptNo: purchaseForm.receiptNo || undefined,
          qty: Number(purchaseForm.qty),
          category: purchaseForm.category || null,
          totalWeight: purchaseForm.totalWeight,
          rate: purchaseForm.rate,
          notes: purchaseForm.notes || undefined,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to save purchase');
      setSuccess(editingPurchase ? 'Purchase updated successfully.' : 'New purchase added successfully.');
      setPurchaseModalOpen(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Error saving purchase');
    } finally {
      setSavingPurchase(false);
    }
  }

  async function handleConfirmDeletePurchase() {
    if (!deletingPurchase) return;
    setDeletingPurchaseState(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/purchases/${deletingPurchase.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete purchase');
      setSuccess('Purchase deleted and ledger resynced.');
      setDeletingPurchase(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting purchase');
    } finally {
      setDeletingPurchaseState(false);
    }
  }

  // ── Payment Handlers ─────────────────────────────────
  function openNewPaymentModal() {
    setEditingPayment(null);
    setPaymentForm({
      date: toIsoDate(new Date()),
      refNo: '',
      direction: 'RECEIVED',
      method: 'CASH',
      amount: '',
      notes: '',
      applyCashEx: false,
      manualCashExAmount: '',
    });
    setPaymentModalOpen(true);
  }

  function startEditPayment(p: any) {
    setEditingPayment(p);
    setPaymentForm({
      date: toIsoDate(new Date(p.date)),
      refNo: p.refNo || '',
      direction: p.direction,
      method: p.method,
      amount: String(p.amount),
      notes: p.notes || '',
      applyCashEx: Boolean(p.cashExExpense),
      manualCashExAmount: p.cashExExpense ? String(p.cashExExpense.expenseAmount) : '',
    });
    setPaymentModalOpen(true);
  }

  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault();
    setSavingPayment(true);
    setError(''); setSuccess('');

    try {
      const url = editingPayment ? `/api/payments/${editingPayment.id}` : `/api/payments`;
      const method = editingPayment ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId,
          date: paymentForm.date,
          refNo: paymentForm.refNo || undefined,
          direction: paymentForm.direction,
          method: paymentForm.method,
          amount: paymentForm.amount,
          notes: paymentForm.notes || undefined,
          applyCashEx: paymentForm.applyCashEx,
          manualCashExAmount: paymentForm.manualCashExAmount || undefined,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to save payment');
      setSuccess(editingPayment ? 'Payment updated successfully.' : 'New payment added successfully.');
      setPaymentModalOpen(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Error saving payment');
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleConfirmDeletePayment() {
    if (!deletingPayment) return;
    setDeletingPaymentState(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/payments/${deletingPayment.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete payment');
      setSuccess('Payment deleted and ledger resynced.');
      setDeletingPayment(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting payment');
    } finally {
      setDeletingPaymentState(false);
    }
  }

  // ── Cash EX Handlers ─────────────────────────────────
  function startEditExpense(e: any) {
    setEditingExpense(e);
    setExpenseForm({
      expenseAmount: String(e.expenseAmount),
      overrideReason: e.overrideReason || '',
    });
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    setSavingExpense(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/cash-ex/${editingExpense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseAmount: expenseForm.expenseAmount,
          overrideReason: expenseForm.overrideReason || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to update Cash EX');
      setSuccess('Cash EX expense updated.');
      setEditingExpense(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error updating Cash EX');
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleConfirmDeleteExpense() {
    if (!deletingExpense) return;
    setDeletingExpenseState(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/cash-ex/${deletingExpense.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete Cash EX');
      setSuccess('Cash EX expense deleted.');
      setDeletingExpense(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Error deleting Cash EX');
    } finally {
      setDeletingExpenseState(false);
    }
  }

  // ── Profile / Deactivate Handlers ────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) throw new Error('Failed to update party profile');
      setSuccess('Party details updated successfully.');
      load();
    } catch (err: any) {
      setError(err.message || 'Error updating party');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleConfirmDeactivate() {
    setDeactivatingParty(true);
    setError('');
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (!res.ok) throw new Error('Failed to deactivate party');
      router.push('/trash');
    } catch (err: any) {
      setError(err.message || 'Error moving to trash');
      setDeactivatingParty(false);
      setShowDeactivateModal(false);
    }
  }

  const calcPurchaseAmount = (parseFloat(purchaseForm.totalWeight || '0') * parseFloat(purchaseForm.rate || '0')) || 0;

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage={`Party — ${party?.name ?? '...'}`}>
      <div style={{ padding: 8 }}>
        {loading && <div style={{ color: '#808080', padding: 12 }}>Loading party workspace...</div>}
        {!loading && party && (
          <>
            {/* ── TOP HEADER & MAIN ACTION BUTTONS ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Link href="/parties" className="win95-btn" style={{ textDecoration: 'none', fontSize: 11, padding: '2px 8px' }}>
                    ⬅️ All Parties
                  </Link>
                  <div className='section-heading' style={{ marginBottom: 0 }}>👤 {party.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {party.mobile && <span>📞 <strong>Mobile:</strong> {party.mobile}</span>}
                  {party.code && <span>🏷️ <strong>Code:</strong> {party.code}</span>}
                  {party.address && <span>📍 <strong>Address:</strong> {party.address}</span>}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a
                  href={`/api/statement/${partyId}/pdf?from=${from}&to=${to}`}
                  className='win95-btn' target='_blank' rel='noreferrer'
                  style={{ textDecoration: 'none', background: '#000080', color: '#fff', fontWeight: 'bold' }}
                >
                  🖨️ PDF Statement / Print
                </a>
                <a
                  href={whatsappUrl}
                  target='_blank' rel='noreferrer'
                  className='win95-btn'
                  style={{ textDecoration: 'none', background: '#25D366', color: '#fff', fontWeight: 'bold' }}
                >
                  💬 WhatsApp Share
                </a>
                {role !== 'VIEWER' && (
                  <>
                    <button
                      className='win95-btn win95-btn-primary'
                      onClick={openNewPurchaseModal}
                      style={{ fontWeight: 'bold' }}
                    >
                      🐃 + Nayi Kharid
                    </button>
                    <button
                      className='win95-btn win95-btn-primary'
                      onClick={openNewPaymentModal}
                      style={{ fontWeight: 'bold' }}
                    >
                      💰 + Jama Paisa
                    </button>
                  </>
                )}
              </div>
            </div>

            {success && <div className='alert-box success' style={{ marginBottom: 8 }}>✅ {success}</div>}
            {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

            {/* ── TOP STAT TILES ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Total Entries</div>
                <div className='stat-tile-value'>{allEntries.length}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>
                  {!showAllEntries && allEntries.length > 10 ? `Showing last 10 entries` : `Showing all entries`}
                </div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Period Kharid (Debits)</div>
                <div className='stat-tile-value' style={{ color: '#800000' }}>{fmt(totalPeriodDebits)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>{purchases.length} buffalo loads</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Period Jama (Credits)</div>
                <div className='stat-tile-value' style={{ color: '#008000' }}>{fmt(totalPeriodCredits)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>{payments.length} payment entries</div>
              </div>
              <div className='stat-tile' style={{ border: '2px solid #000080', background: '#f8fafc' }}>
                <div className='stat-tile-label' style={{ color: '#000080', fontWeight: 'bold' }}>Current Balance Due</div>
                <div className='stat-tile-value' style={{ fontSize: 18, color: balDir === 'DR' ? '#800000' : balDir === 'CR' ? '#008000' : '#000' }}>
                  {fmt(Math.abs(lastBal))} {balDir}
                </div>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: balDir === 'DR' ? '#800000' : '#008000' }}>
                  {balDir === 'DR' ? 'Party owes ADEEB ENTERPRISES' : balDir === 'CR' ? 'ADEEB ENTERPRISES owes party' : 'Settled (Hisab Barabar)'}
                </div>
              </div>
            </div>

            {/* ── UNIFIED TABS BAR (All sections right inside Party) ── */}
            <div style={{ display: 'flex', borderBottom: '2px solid #808080', marginBottom: 10, gap: 4, flexWrap: 'wrap' }}>
              <button
                className={`win95-btn ${activeTab === 'ledger' ? 'win95-btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontWeight: 'bold', borderBottom: 'none' }}
                onClick={() => setActiveTab('ledger')}
              >
                📒 Party Ledger ({allEntries.length})
              </button>
              <button
                className={`win95-btn ${activeTab === 'purchases' ? 'win95-btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontWeight: 'bold', borderBottom: 'none' }}
                onClick={() => setActiveTab('purchases')}
              >
                🐃 Purchases / Kharid ({purchases.length})
              </button>
              <button
                className={`win95-btn ${activeTab === 'payments' ? 'win95-btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontWeight: 'bold', borderBottom: 'none' }}
                onClick={() => setActiveTab('payments')}
              >
                💰 Payments / Jama ({payments.length})
              </button>
              <button
                className={`win95-btn ${activeTab === 'cashex' ? 'win95-btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontWeight: 'bold', borderBottom: 'none' }}
                onClick={() => setActiveTab('cashex')}
              >
                💸 Cash EX ({cashExExpenses.length})
              </button>
              <button
                className={`win95-btn ${activeTab === 'profile' ? 'win95-btn-primary' : ''}`}
                style={{ padding: '4px 12px', fontWeight: 'bold', borderBottom: 'none' }}
                onClick={() => setActiveTab('profile')}
              >
                ⚙️ Party Profile & Settings
              </button>
            </div>

            {/* ── TAB 1: PARTY LEDGER ── */}
            {activeTab === 'ledger' && (
              <div>
                {/* Date Filters & Presets */}
                <div className='group-box' style={{ marginBottom: 10, padding: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 'bold', marginRight: 4 }}>Date Filter:</span>
                      <button className={`win95-btn ${activePreset === 'today' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('today')}>
                        📅 Aaj (Today)
                      </button>
                      <button className={`win95-btn ${activePreset === 'yesterday' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('yesterday')}>
                        📅 Kal se Aaj
                      </button>
                      <button className={`win95-btn ${activePreset === '1m' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('1m')}>
                        📅 1 Mahina
                      </button>
                      <button className={`win95-btn ${activePreset === '2m' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('2m')}>
                        📅 2 Mahine
                      </button>
                      <button className={`win95-btn ${activePreset === '6m' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('6m')}>
                        📅 6 Mahine
                      </button>
                      <button className={`win95-btn ${activePreset === 'all' ? 'win95-btn-primary' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('all')}>
                        📅 Shuru se End tak (All)
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <label className='form-label'>From:</label>
                      <input className='win95-input' type='date' style={{ width: 130 }} value={from} onChange={e => { setFrom(e.target.value); setActivePreset('custom'); }} />
                      <label className='form-label'>To:</label>
                      <input className='win95-input' type='date' style={{ width: 130 }} value={to} onChange={e => { setTo(e.target.value); setActivePreset('custom'); }} />
                      <button className='toolbar-btn' onClick={load}>⟳ Apply</button>
                    </div>
                  </div>
                </div>

                {/* Entries Count Toggle Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    Showing <strong>{displayedEntries.length}</strong> of <strong>{allEntries.length}</strong> entries
                    {from && to ? ` between ${from} and ${to}` : ''}
                  </div>
                  {allEntries.length > 10 && (
                    <button
                      className='win95-btn'
                      style={{ fontSize: 11, padding: '2px 10px', fontWeight: 'bold' }}
                      onClick={() => setShowAllEntries(!showAllEntries)}
                    >
                      {showAllEntries ? '📋 Show Recent 10 Entries Only' : `👁️ Show All Entries (${allEntries.length})`}
                    </button>
                  )}
                </div>

                <div className='table-container'>
                  <table className='win95-table' style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th className='num'>Debit (Kharid ₹)</th>
                        <th className='num'>Credit (Jama ₹)</th>
                        <th className='num'>Running Balance (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedEntries.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>No ledger entries found.</td></tr>
                      )}
                      {displayedEntries.map((e: any) => {
                        const bal = parseFloat(e.runningBalance);
                        return (
                          <tr key={e.id}>
                            <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                            <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 'bold',
                                background: e.txType === 'PURCHASE' ? '#fee2e2' : e.txType.includes('PAYMENT') ? '#dcfce7' : '#f1f5f9',
                                color: e.txType === 'PURCHASE' ? '#991b1b' : e.txType.includes('PAYMENT') ? '#166534' : '#475569',
                              }}>
                                {e.txType === 'PURCHASE' ? 'KHARID' : e.txType === 'PAYMENT_RECEIVED' ? 'JAMA' : e.txType}
                              </span>
                            </td>
                            <td>{e.refNo || '—'}</td>
                            <td style={{ maxWidth: 260 }}>{e.description}</td>
                            <td className='amount' style={{ color: '#800000', fontWeight: 'bold' }}>
                              {parseFloat(e.debit) > 0 ? fmt(e.debit) : ''}
                            </td>
                            <td className='amount' style={{ color: '#008000', fontWeight: 'bold' }}>
                              {parseFloat(e.credit) > 0 ? fmt(e.credit) : ''}
                            </td>
                            <td className={`amount ${bal > 0 ? 'ledger-balance-dr' : bal < 0 ? 'ledger-balance-cr' : ''}`}>
                              {fmt(Math.abs(bal))} {bal > 0 ? 'DR' : bal < 0 ? 'CR' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {allEntries.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'right' }}><strong>PERIOD TOTAL / CLOSING:</strong></td>
                          <td className='amount' style={{ color: '#800000' }}><strong>{fmt(totalPeriodDebits)}</strong></td>
                          <td className='amount' style={{ color: '#008000' }}><strong>{fmt(totalPeriodCredits)}</strong></td>
                          <td className={`amount ${lastBal > 0 ? 'ledger-balance-dr' : lastBal < 0 ? 'ledger-balance-cr' : ''}`}>
                            <strong>{fmt(Math.abs(lastBal))} {balDir}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 2: PURCHASES / KHARID ── */}
            {activeTab === 'purchases' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold' }}>🐃 Purchases for {party.name}</div>
                  {role !== 'VIEWER' && (
                    <button className='win95-btn win95-btn-primary' onClick={openNewPurchaseModal}>
                      ➕ New Purchase
                    </button>
                  )}
                </div>

                <div className='table-container'>
                  <table className='win95-table' style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Receipt No.</th>
                        <th className='num'>Buffaloes (Qty)</th>
                        <th>Category</th>
                        <th className='num'>Total Wt (kg)</th>
                        <th className='num'>Avg Wt (kg)</th>
                        <th className='num'>Rate (₹/kg)</th>
                        <th className='num'>Amount (₹)</th>
                        <th>Notes</th>
                        {role !== 'VIEWER' && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.length === 0 && (
                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>No purchases recorded for this party.</td></tr>
                      )}
                      {purchases.map(p => (
                        <tr key={p.id}>
                          <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                          <td>{p.receiptNo || '—'}</td>
                          <td className='num'>{p.qty}</td>
                          <td>
                            {p.category ? (
                              <span className={`category-badge ${p.category === 'BC' ? 'bc' : p.category === 'SC' ? 'sc' : 'vc'}`}>
                                {p.category === 'BC' ? 'B/C' : p.category === 'SC' ? 'S/C' : 'V/C'}
                              </span>
                            ) : (
                              <span style={{ color: '#808080' }}>—</span>
                            )}
                          </td>
                          <td className='num'>{parseFloat(p.totalWeight).toFixed(1)}</td>
                          <td className='num'>{parseFloat(p.avgWeight).toFixed(2)}</td>
                          <td className='num'>{parseFloat(p.rate).toFixed(2)}</td>
                          <td className='amount' style={{ fontWeight: 'bold' }}>{fmt(p.amount)}</td>
                          <td style={{ maxWidth: 120 }}>{p.notes || '—'}</td>
                          {role !== 'VIEWER' && (
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className='win95-btn' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => startEditPurchase(p)}>
                                  ✏️ Edit
                                </button>
                                <button className='win95-btn win95-btn-danger' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setDeletingPurchase(p)}>
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {purchases.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={2}><strong>TOTAL</strong></td>
                          <td className='num'><strong>{purchases.reduce((s, p) => s + (p.qty || 0), 0)}</strong></td>
                          <td></td>
                          <td className='num'><strong>{purchases.reduce((s, p) => s + parseFloat(p.totalWeight || 0), 0).toFixed(1)}</strong></td>
                          <td></td>
                          <td></td>
                          <td className='amount'><strong>{fmt(purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0))}</strong></td>
                          <td colSpan={role !== 'VIEWER' ? 2 : 1}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 3: PAYMENTS / JAMA ── */}
            {activeTab === 'payments' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold' }}>💰 Payments / Jama for {party.name}</div>
                  {role !== 'VIEWER' && (
                    <button className='win95-btn win95-btn-primary' onClick={openNewPaymentModal}>
                      ➕ New Payment
                    </button>
                  )}
                </div>

                <div className='table-container'>
                  <table className='win95-table' style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
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
                      {payments.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>No payments recorded for this party.</td></tr>
                      )}
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
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
                                <button className='win95-btn' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => startEditPayment(p)}>
                                  ✏️ Edit
                                </button>
                                <button className='win95-btn win95-btn-danger' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setDeletingPayment(p)}>
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
                          <td colSpan={4}><strong>TOTAL PAYMENTS</strong></td>
                          <td className='amount'>
                            <strong style={{ color: '#008000' }}>
                              {fmt(payments.filter(p => p.direction === 'RECEIVED').reduce((s, p) => s + parseFloat(p.amount || 0), 0))}
                            </strong>
                          </td>
                          <td colSpan={role !== 'VIEWER' ? 3 : 2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 4: CASH EX ── */}
            {activeTab === 'cashex' && (
              <div>
                <div className='alert-box info' style={{ marginBottom: 8 }}>
                  <strong>Cash EX Rule:</strong> Cash EX is a SEPARATE firm business expense (₹200 per ₹1,00,000 cash received).
                  It is recorded here for firm accounting and does NOT reduce the party balance.
                </div>

                <div className='table-container'>
                  <table className='win95-table' style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className='num'>Cash Received (₹)</th>
                        <th>Rate Applied</th>
                        <th>Basis Applied</th>
                        <th className='num'>Expense Amount (₹)</th>
                        <th>Formula / Note</th>
                        {role !== 'VIEWER' && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {cashExExpenses.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>No Cash EX expenses recorded for this party.</td></tr>
                      )}
                      {cashExExpenses.map(e => (
                        <tr key={e.id}>
                          <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                          <td className='amount'>{fmt(e.cashAmount)}</td>
                          <td>{e.rateApplied}</td>
                          <td>{fmt(e.basisApplied)}</td>
                          <td className='amount' style={{ color: '#800000', fontWeight: 'bold' }}>{fmt(e.expenseAmount)}</td>
                          <td style={{ fontSize: 10 }}>
                            {e.overrideReason ? `Override: ${e.overrideReason}` : `${fmt(e.cashAmount)} × ${e.rateApplied} ÷ ${fmt(e.basisApplied)}`}
                          </td>
                          {role !== 'VIEWER' && (
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className='win95-btn' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => startEditExpense(e)}>
                                  ✏️ Edit
                                </button>
                                <button className='win95-btn win95-btn-danger' style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setDeletingExpense(e)}>
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {cashExExpenses.length > 0 && (
                      <tfoot>
                        <tr>
                          <td><strong>TOTAL EXPENSE</strong></td>
                          <td className='amount'><strong>{fmt(cashExExpenses.reduce((s, e) => s + parseFloat(e.cashAmount || 0), 0))}</strong></td>
                          <td colSpan={2}></td>
                          <td className='amount' style={{ color: '#800000' }}>
                            <strong>{fmt(cashExExpenses.reduce((s, e) => s + parseFloat(e.expenseAmount || 0), 0))}</strong>
                          </td>
                          <td colSpan={role !== 'VIEWER' ? 2 : 1}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 5: PARTY PROFILE & SETTINGS ── */}
            {activeTab === 'profile' && (
              <div style={{ maxWidth: 600 }}>
                <form onSubmit={handleSaveProfile} className='group-box'>
                  <div className='group-box-title'>Party Details</div>
                  <div className='form-row' style={{ marginTop: 6 }}>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Party Name *</label>
                      <input
                        className='win95-input' value={profileForm.name}
                        onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Mobile Number</label>
                      <input
                        className='win95-input' value={profileForm.mobile}
                        onChange={e => setProfileForm(f => ({ ...f, mobile: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Address</label>
                      <input
                        className='win95-input' value={profileForm.address}
                        onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className='form-row'>
                    <div className='form-field' style={{ flex: 1 }}>
                      <label className='form-label'>Notes</label>
                      <textarea
                        className='win95-input' rows={2} value={profileForm.notes}
                        onChange={e => setProfileForm(f => ({ ...f, notes: e.target.value }))}
                        style={{ resize: 'vertical' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button type='submit' className='win95-btn win95-btn-primary' disabled={savingProfile}>
                      {savingProfile ? 'Saving...' : '💾 Save Profile Details'}
                    </button>
                  </div>
                </form>

                {/* Danger Zone: Move to Trash */}
                {role === 'ADMIN' && (
                  <div className='group-box' style={{ marginTop: 16, borderColor: '#800000' }}>
                    <div className='group-box-title' style={{ color: '#800000' }}>⚠️ Danger Zone</div>
                    <div style={{ fontSize: 11, color: '#808080', marginBottom: 8 }}>
                      Deactivating moves this party to the Trash Bin for 30 days. Ledger data and transactions remain preserved.
                    </div>
                    <button
                      type='button'
                      className='win95-btn win95-btn-danger'
                      onClick={() => setShowDeactivateModal(true)}
                    >
                      🗑️ Deactivate & Move to Trash
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── PURCHASE MODAL (Add / Edit) ── */}
            {purchaseModalOpen && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 480 }}>
                  <div className='title-bar'>
                    <span className='title-bar-text'>
                      {editingPurchase ? '✏️ Edit Purchase' : '🐃 + New Purchase'} — {party.name}
                    </span>
                    <button
                      style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                      onClick={() => setPurchaseModalOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleSavePurchase}>
                    <div className='modal-body' style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className='form-row'>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Date *</label>
                          <input
                            className='win95-input' type='date'
                            value={purchaseForm.date}
                            onChange={e => setPurchaseForm(f => ({ ...f, date: e.target.value }))}
                            required
                          />
                        </div>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Buffaloes (Nug / Qty) *</label>
                          <input
                            className='win95-input' type='number' min='1'
                            value={purchaseForm.qty}
                            onChange={e => setPurchaseForm(f => ({ ...f, qty: Number(e.target.value) }))}
                            required
                          />
                        </div>
                      </div>

                      <div className='form-row'>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Total Weight (Kg) *</label>
                          <input
                            className='win95-input' type='number' step='0.001'
                            value={purchaseForm.totalWeight}
                            onChange={e => setPurchaseForm(f => ({ ...f, totalWeight: e.target.value }))}
                            required
                          />
                        </div>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Rate (₹/Kg) *</label>
                          <input
                            className='win95-input' type='number' step='0.01'
                            value={purchaseForm.rate}
                            onChange={e => setPurchaseForm(f => ({ ...f, rate: e.target.value }))}
                            required
                          />
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 'bold' }}>Calculated Total:</span>
                        <span style={{ fontSize: 16, fontWeight: 'bold', color: '#000080' }}>{fmt(calcPurchaseAmount)}</span>
                      </div>

                      <div className='form-row'>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Category (Optional)</label>
                          <select
                            className='win95-select'
                            value={purchaseForm.category}
                            onChange={e => setPurchaseForm(f => ({ ...f, category: e.target.value }))}
                          >
                            <option value=''>— None / Blank —</option>
                            <option value='BC'>B/C (Big Cattle)</option>
                            <option value='SC'>S/C (Small Cattle)</option>
                          </select>
                        </div>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Receipt No. (Optional)</label>
                          <input
                            className='win95-input'
                            value={purchaseForm.receiptNo}
                            onChange={e => setPurchaseForm(f => ({ ...f, receiptNo: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className='form-field'>
                        <label className='form-label'>Notes (Optional)</label>
                        <input
                          className='win95-input'
                          value={purchaseForm.notes}
                          onChange={e => setPurchaseForm(f => ({ ...f, notes: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                      <button type='button' className='win95-btn' onClick={() => setPurchaseModalOpen(false)}>Cancel</button>
                      <button type='submit' className='win95-btn win95-btn-primary' disabled={savingPurchase}>
                        {savingPurchase ? 'Saving...' : '💾 Save Purchase'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── DELETE PURCHASE MODAL ── */}
            {deletingPurchase && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 400 }}>
                  <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                    <span className='title-bar-text'>⚠️ Confirm Delete Purchase</span>
                    <button style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }} onClick={() => setDeletingPurchase(null)}>✕</button>
                  </div>
                  <div className='modal-body' style={{ padding: 14 }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Kya aap is purchase entry ko delete karna chahte hain?</p>
                    <div style={{ fontSize: 11, background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', marginBottom: 8 }}>
                      <div><strong>Date:</strong> {new Date(deletingPurchase.date).toLocaleDateString('en-IN')}</div>
                      <div><strong>Buffaloes:</strong> {deletingPurchase.qty} ({deletingPurchase.totalWeight} kg @ ₹{deletingPurchase.rate})</div>
                      <div><strong>Amount:</strong> {fmt(deletingPurchase.amount)}</div>
                    </div>
                  </div>
                  <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                    <button className='win95-btn' onClick={() => setDeletingPurchase(null)}>Cancel</button>
                    <button className='win95-btn win95-btn-danger' onClick={handleConfirmDeletePurchase} disabled={deletingPurchaseState}>
                      {deletingPurchaseState ? 'Deleting...' : '🗑️ Yes, Delete Entry'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── PAYMENT MODAL (Add / Edit) ── */}
            {paymentModalOpen && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 480 }}>
                  <div className='title-bar'>
                    <span className='title-bar-text'>
                      {editingPayment ? '✏️ Edit Payment' : '💰 + New Payment'} — {party.name}
                    </span>
                    <button
                      style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }}
                      onClick={() => setPaymentModalOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleSavePayment}>
                    <div className='modal-body' style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className='form-row'>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Date *</label>
                          <input
                            className='win95-input' type='date'
                            value={paymentForm.date}
                            onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                            required
                          />
                        </div>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Amount (₹) *</label>
                          <input
                            className='win95-input' type='number' step='0.01'
                            value={paymentForm.amount}
                            onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                            required
                          />
                        </div>
                      </div>

                      <div className='form-row'>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Direction *</label>
                          <select
                            className='win95-select'
                            value={paymentForm.direction}
                            onChange={e => setPaymentForm(f => ({ ...f, direction: e.target.value as any }))}
                            required
                          >
                            <option value='RECEIVED'>RECEIVED (Party se Jama)</option>
                            <option value='PAID'>PAID (Party ko Diya)</option>
                          </select>
                        </div>
                        <div className='form-field' style={{ flex: 1 }}>
                          <label className='form-label'>Method *</label>
                          <select
                            className='win95-select'
                            value={paymentForm.method}
                            onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}
                            required
                          >
                            <option value='CASH'>CASH</option>
                            <option value='AC'>A/C (Bank / RTGS / NEFT)</option>
                            <option value='ADVANCE_JAMA'>ADVANCE JAMA</option>
                            <option value='CHEQUE'>CHEQUE</option>
                          </select>
                        </div>
                      </div>

                      <div className='form-field'>
                        <label className='form-label'>Reference / Chq / Txn No.</label>
                        <input
                          className='win95-input'
                          value={paymentForm.refNo}
                          onChange={e => setPaymentForm(f => ({ ...f, refNo: e.target.value }))}
                        />
                      </div>

                      {/* Cash EX Controls */}
                      {paymentForm.direction === 'RECEIVED' && paymentForm.method === 'CASH' && (
                        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', padding: 8, borderRadius: 4 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold' }}>
                            <input
                              type='checkbox'
                              checked={paymentForm.applyCashEx}
                              onChange={e => setPaymentForm(f => ({ ...f, applyCashEx: e.target.checked }))}
                            />
                            Apply Cash EX Expense for this Payment
                          </label>
                          {paymentForm.applyCashEx && (
                            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 11 }}>Cash EX Amount (₹):</label>
                              <input
                                className='win95-input' type='number' step='0.01' style={{ width: 120 }}
                                value={paymentForm.manualCashExAmount}
                                onChange={e => setPaymentForm(f => ({ ...f, manualCashExAmount: e.target.value }))}
                                placeholder='Auto: ₹200/Lakh'
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className='form-field'>
                        <label className='form-label'>Notes (Optional)</label>
                        <input
                          className='win95-input'
                          value={paymentForm.notes}
                          onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                      <button type='button' className='win95-btn' onClick={() => setPaymentModalOpen(false)}>Cancel</button>
                      <button type='submit' className='win95-btn win95-btn-primary' disabled={savingPayment}>
                        {savingPayment ? 'Saving...' : '💾 Save Payment'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── DELETE PAYMENT MODAL ── */}
            {deletingPayment && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 400 }}>
                  <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                    <span className='title-bar-text'>⚠️ Confirm Delete Payment</span>
                    <button style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }} onClick={() => setDeletingPayment(null)}>✕</button>
                  </div>
                  <div className='modal-body' style={{ padding: 14 }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Kya aap is payment entry ko delete karna chahte hain?</p>
                    <div style={{ fontSize: 11, background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1', marginBottom: 8 }}>
                      <div><strong>Date:</strong> {new Date(deletingPayment.date).toLocaleDateString('en-IN')}</div>
                      <div><strong>Direction:</strong> {deletingPayment.direction} ({deletingPayment.method})</div>
                      <div><strong>Amount:</strong> {fmt(deletingPayment.amount)}</div>
                    </div>
                  </div>
                  <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                    <button className='win95-btn' onClick={() => setDeletingPayment(null)}>Cancel</button>
                    <button className='win95-btn win95-btn-danger' onClick={handleConfirmDeletePayment} disabled={deletingPaymentState}>
                      {deletingPaymentState ? 'Deleting...' : '🗑️ Yes, Delete Entry'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── EDIT CASH EX MODAL ── */}
            {editingExpense && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 380 }}>
                  <div className='title-bar'>
                    <span className='title-bar-text'>✏️ Edit Cash EX Expense</span>
                    <button style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }} onClick={() => setEditingExpense(null)}>✕</button>
                  </div>
                  <form onSubmit={handleSaveExpense}>
                    <div className='modal-body' style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1' }}>
                        <div><strong>Party:</strong> {party.name}</div>
                        <div><strong>Cash Amount:</strong> {fmt(editingExpense.cashAmount)}</div>
                      </div>
                      <div className='form-field'>
                        <label className='form-label'>Expense Amount (₹) *</label>
                        <input
                          className='win95-input' type='number' step='0.01'
                          value={expenseForm.expenseAmount}
                          onChange={e => setExpenseForm(f => ({ ...f, expenseAmount: e.target.value }))}
                          required
                        />
                      </div>
                      <div className='form-field'>
                        <label className='form-label'>Override Reason (Optional)</label>
                        <input
                          className='win95-input'
                          value={expenseForm.overrideReason}
                          onChange={e => setExpenseForm(f => ({ ...f, overrideReason: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                      <button type='button' className='win95-btn' onClick={() => setEditingExpense(null)}>Cancel</button>
                      <button type='submit' className='win95-btn win95-btn-primary' disabled={savingExpense}>
                        {savingExpense ? 'Saving...' : '💾 Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── DELETE CASH EX MODAL ── */}
            {deletingExpense && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 380 }}>
                  <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                    <span className='title-bar-text'>⚠️ Confirm Delete Cash EX</span>
                    <button style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }} onClick={() => setDeletingExpense(null)}>✕</button>
                  </div>
                  <div className='modal-body' style={{ padding: 14 }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Kya aap is Cash EX record ko delete karna chahte hain?</p>
                    <div style={{ fontSize: 11, background: '#f8fafc', padding: 8, border: '1px solid #cbd5e1' }}>
                      <div><strong>Expense Amount:</strong> {fmt(deletingExpense.expenseAmount)}</div>
                    </div>
                  </div>
                  <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                    <button className='win95-btn' onClick={() => setDeletingExpense(null)}>Cancel</button>
                    <button className='win95-btn win95-btn-danger' onClick={handleConfirmDeleteExpense} disabled={deletingExpenseState}>
                      {deletingExpenseState ? 'Deleting...' : '🗑️ Yes, Delete Expense'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── DEACTIVATE / TRASH MODAL ── */}
            {showDeactivateModal && (
              <div className='modal-overlay'>
                <div className='modal-window' style={{ width: 420 }}>
                  <div className='title-bar' style={{ background: 'linear-gradient(90deg, #800000, #b30000)' }}>
                    <span className='title-bar-text'>⚠️ Confirm Move to Trash</span>
                    <button style={{ background: '#c0c0c0', border: '1px solid #808080', cursor: 'pointer', fontSize: 10 }} onClick={() => setShowDeactivateModal(false)}>✕</button>
                  </div>
                  <div className='modal-body' style={{ padding: 14 }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Kya aap sure hain ki "{party.name}" ko Trash mein bhejna chahte hain?</p>
                    <p style={{ fontSize: 11, color: '#333', lineHeight: 1.5, marginBottom: 8 }}>
                      Yeh party agle <strong>30 din</strong> tak Sidebar ke <strong>Trash Bin</strong> mein rahegi. Aap ise wahan se kabhi bhi restore kar sakte hain.
                    </p>
                  </div>
                  <div className='modal-footer' style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 8 }}>
                    <button className='win95-btn' onClick={() => setShowDeactivateModal(false)}>Cancel</button>
                    <button className='win95-btn win95-btn-danger' onClick={handleConfirmDeactivate} disabled={deactivatingParty}>
                      {deactivatingParty ? 'Moving to Trash...' : '🗑️ Haan, Trash me bhejo'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
