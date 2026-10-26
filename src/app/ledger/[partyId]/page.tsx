'use client';
// ADEEB ENTERPRISES — Enhanced Party Ledger Page
// Shows default 10 entries, quick date presets (Today, Yesterday, 1M, 2M, 6M, All),
// custom date range filtering, direct PDF print/download, and WhatsApp share.

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
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

export default function PartyLedgerPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const params = useParams();
  const partyId = params?.partyId as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [activePreset, setActivePreset] = useState<'all' | 'today' | 'yesterday' | '1m' | '2m' | '6m' | 'custom'>('all');

  async function load() {
    setLoading(true);
    const qp = new URLSearchParams();
    if (from) qp.set('from', from);
    if (to) qp.set('to', to);
    try {
      const res = await fetch(`/api/ledger/${partyId}?${qp}`);
      if (res.ok) setData(await res.json());
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

  // Default: Show recent 10 entries unless showAllEntries is checked
  const displayedEntries = useMemo(() => {
    if (showAllEntries || allEntries.length <= 10) return allEntries;
    return allEntries.slice(-10);
  }, [allEntries, showAllEntries]);

  const lastEntry = allEntries[allEntries.length - 1];
  const lastBal = lastEntry ? parseFloat(lastEntry.runningBalance) : (party ? parseFloat(party.openingBalance) : 0);
  const balDir = lastBal > 0 ? 'DR' : lastBal < 0 ? 'CR' : 'NIL';

  const totalPeriodDebits = allEntries.reduce((s, e) => s + parseFloat(e.debit || 0), 0);
  const totalPeriodCredits = allEntries.reduce((s, e) => s + parseFloat(e.credit || 0), 0);

  // WhatsApp Message
  const whatsappUrl = useMemo(() => {
    if (!party) return '';
    const phone = party.mobile ? party.mobile.replace(/[^0-9]/g, '') : '';
    const dateRangeStr = from && to ? `${from} se ${to}` : 'Shuru se Aaj tak';
    const text = `*ADEEB ENTERPRISES*\n*Khata Parcha — ${party.name}*\nTareekh: ${dateRangeStr}\n---------------------------------\nKharid (Debits): ${fmt(totalPeriodDebits)}\nJama (Credits): ${fmt(totalPeriodCredits)}\n*Baki Hisab (Balance Due): ${fmt(Math.abs(lastBal))} ${balDir}*\n---------------------------------\nComputer-generated statement.`;
    return `https://api.whatsapp.com/send?${phone ? `phone=${phone}&` : ''}text=${encodeURIComponent(text)}`;
  }, [party, from, to, totalPeriodDebits, totalPeriodCredits, lastBal, balDir]);

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage={`Ledger — ${party?.name ?? '...'}`}>
      <div style={{ padding: 8 }}>
        {loading && <div style={{ color: '#808080', padding: 8 }}>Loading ledger...</div>}
        {!loading && party && (
          <>
            {/* Top Header & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className='section-heading' style={{ marginBottom: 2 }}>📒 Party Ledger — {party.name}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
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
                <Link href={`/purchases/new?partyId=${partyId}`} className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>
                  🐃 + Nayi Kharid
                </Link>
                <Link href={`/payments/new?partyId=${partyId}`} className='win95-btn win95-btn-primary' style={{ textDecoration: 'none' }}>
                  💰 + Jama Paisa
                </Link>
                <Link href={`/parties/${partyId}`} className='win95-btn' style={{ textDecoration: 'none' }}>
                  👤 Details
                </Link>
              </div>
            </div>

            {/* Summary Stat Tiles */}
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
                <div style={{ fontSize: 10, color: '#808080' }}>Bhains Bill / Purchases</div>
              </div>
              <div className='stat-tile'>
                <div className='stat-tile-label'>Period Jama (Credits)</div>
                <div className='stat-tile-value' style={{ color: '#008000' }}>{fmt(totalPeriodCredits)}</div>
                <div style={{ fontSize: 10, color: '#808080' }}>Payments Received</div>
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

            {/* Date Filters & Presets */}
            <div className='group-box' style={{ marginBottom: 10, padding: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {/* Quick Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 'bold', marginRight: 4 }}>Date Filter:</span>
                  <button
                    className={`win95-btn ${activePreset === 'today' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('today')}
                  >
                    📅 Aaj (Today)
                  </button>
                  <button
                    className={`win95-btn ${activePreset === 'yesterday' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('yesterday')}
                  >
                    📅 Kal se Aaj
                  </button>
                  <button
                    className={`win95-btn ${activePreset === '1m' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('1m')}
                  >
                    📅 1 Mahina
                  </button>
                  <button
                    className={`win95-btn ${activePreset === '2m' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('2m')}
                  >
                    📅 2 Mahine
                  </button>
                  <button
                    className={`win95-btn ${activePreset === '6m' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('6m')}
                  >
                    📅 6 Mahine
                  </button>
                  <button
                    className={`win95-btn ${activePreset === 'all' ? 'win95-btn-primary' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => applyPreset('all')}
                  >
                    📅 Shuru se End tak (All)
                  </button>
                </div>

                {/* Custom Date Inputs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <label className='form-label'>From:</label>
                  <input
                    className='win95-input' type='date' style={{ width: 130 }}
                    value={from}
                    onChange={e => { setFrom(e.target.value); setActivePreset('custom'); }}
                  />
                  <label className='form-label'>To:</label>
                  <input
                    className='win95-input' type='date' style={{ width: 130 }}
                    value={to}
                    onChange={e => { setTo(e.target.value); setActivePreset('custom'); }}
                  />
                  <button className='toolbar-btn' onClick={load}>⟳ Apply</button>
                </div>
              </div>
            </div>

            {/* Entries Display Toggle Bar */}
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

            {/* Ledger Table */}
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
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>
                        No ledger entries found for this period.
                      </td>
                    </tr>
                  )}
                  {displayedEntries.map((e: any) => {
                    const bal = parseFloat(e.runningBalance);
                    return (
                      <tr key={e.id}>
                        <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                        <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: 3,
                            fontSize: 9,
                            fontWeight: 'bold',
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

            <div style={{ marginTop: 10, padding: '6px 10px', background: '#f0f4ff', border: '1px solid #000080', fontSize: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <strong>Ledger Rule:</strong> DR = Party owes ADEEB ENTERPRISES (Receivable). CR = ADEEB ENTERPRISES owes party (Payable).
                Cash EX is tracked separately in the Cash EX register.
              </div>
              <div>
                <a
                  href={`/api/statement/${partyId}/pdf?from=${from}&to=${to}`}
                  target='_blank' rel='noreferrer'
                  style={{ color: '#000080', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  🖨️ Open Full Statement for Selected Dates ({from || 'Start'} to {to || 'Today'}) ↗
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
