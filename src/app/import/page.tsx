'use client';
// ADEEB ENTERPRISES — PDF Import Workflow
// Upload → Extract → Review → Confirm → Save

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/AppShell';

type ImportRow = {
  rowIndex: number;
  txType: string;
  date?: string;
  partyName?: string;
  receiptNo?: string;
  qty?: number;
  category?: string;
  totalWeight?: number;
  avgWeight?: number;
  rate?: number;
  amount?: number;
  paymentMethod?: string;
  paymentAmount?: number;
  warnings: string[];
  hasVc?: boolean;
  vcMappingConfirmed?: boolean;
};

export default function ImportPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [batchWarnings, setBatchWarnings] = useState<string[]>([]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }
    if (file.type !== 'application/pdf') { setError('Only PDF files are accepted.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return; }
    if (!selectedPartyId) { setError('Please select the party this statement belongs to.'); return; }

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('partyId', selectedPartyId);

    const res = await fetch('/api/import/upload', { method: 'POST', body: formData });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(data.error || 'Upload failed.');
      return;
    }

    setBatchId(data.batchId);
    setRows(data.rows || []);
    setBatchWarnings(data.warnings || []);
    setStep('review');
  }

  function updateRow(rowIndex: number, field: string, value: any) {
    setRows(prev => prev.map(r => r.rowIndex === rowIndex ? { ...r, [field]: value } : r));
  }

  async function handleConfirm() {
    const hasUnconfirmedVc = rows.some(r => r.hasVc && !r.vcMappingConfirmed);
    if (hasUnconfirmedVc) {
      setError('Please confirm the V/C category mapping for all highlighted rows before importing.');
      return;
    }

    setConfirming(true);
    setError('');

    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, rows }),
    });
    const data = await res.json();
    setConfirming(false);

    if (!res.ok) {
      setError(data.error || 'Import confirmation failed.');
      return;
    }

    setResult(data);
    setStep('done');
  }

  if (role === 'VIEWER') {
    return <AppShell currentPage='PDF Import'><div className='alert-box error' style={{ margin: 16 }}>Read-only access — cannot import documents.</div></AppShell>;
  }

  return (
    <AppShell userName={session?.user?.name ?? ''} userRole={role} currentPage='PDF Import'>
      <div style={{ padding: 8 }}>
        <div className='section-heading'>📄 PDF Statement Import</div>

        {/* STEP INDICATOR */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid #808080' }}>
          {(['upload', 'review', 'done'] as const).map((s, i) => (
            <div key={s} style={{
              padding: '3px 16px', fontSize: 11, fontWeight: step === s ? 'bold' : 'normal',
              background: step === s ? '#000080' : '#c0c0c0',
              color: step === s ? '#fff' : '#000',
              borderRight: '1px solid #808080',
            }}>
              {i + 1}. {s === 'upload' ? 'Upload PDF' : s === 'review' ? 'Review & Edit' : 'Import Complete'}
            </div>
          ))}
        </div>

        {error && <div className='alert-box error' style={{ marginBottom: 8 }}>⚠️ {error}</div>}

        {/* ─── STEP 1: UPLOAD ─── */}
        {step === 'upload' && (
          <form onSubmit={handleUpload}>
            <div className='group-box'>
              <div className='group-box-title'>Select Document</div>
              <div className='alert-box info' style={{ marginBottom: 8 }}>
                Upload a PDF party statement. Data will be extracted and shown for review before saving.
                <strong> Nothing is saved until you confirm.</strong>
              </div>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 1 }}>
                  <label className='form-label'>PDF File (max 10 MB)</label>
                  <input type='file' accept='application/pdf' className='win95-input'
                    onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
                </div>
              </div>
              <div className='form-row'>
                <div className='form-field' style={{ flex: 1 }}>
                  <label className='form-label'>Party *</label>
                  <select className='win95-select' value={selectedPartyId} onChange={e => setSelectedPartyId(e.target.value)}
                    onClick={async () => {
                      if (partyOptions.length === 0) {
                        const r = await fetch('/api/parties'); const d = await r.json();
                        setPartyOptions(Array.isArray(d) ? d : []);
                      }
                    }}>
                    <option value=''>— Select party for this statement —</option>
                    {partyOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <button type='submit' className='win95-btn win95-btn-primary' disabled={uploading || !file || !selectedPartyId}>
                {uploading ? 'Uploading & Extracting...' : '📤 Upload & Extract'}
              </button>
            </div>
          </form>
        )}

        {/* ─── STEP 2: REVIEW ─── */}
        {step === 'review' && (
          <div>
            {batchWarnings.length > 0 && (
              <div className='alert-box warning' style={{ marginBottom: 8 }}>
                <strong>⚠️ Import Warnings ({batchWarnings.length}):</strong>
                <ul style={{ margin: '4px 0 0 16px', fontSize: 11 }}>
                  {batchWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            <div className='alert-box info' style={{ marginBottom: 8 }}>
              Review the extracted data below. Edit any fields that were incorrectly parsed.
              <strong> V/C category rows must be explicitly confirmed before import.</strong>
              No data will be saved until you click &quot;Confirm Import&quot;.
            </div>

            <div className='table-container' style={{ maxHeight: 400 }}>
              <table className='win95-table' style={{ width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Type</th><th>Date</th>
                    <th>Receipt</th><th>Qty</th><th>Category</th>
                    <th>Total Wt</th><th>Rate</th><th>Amount</th>
                    <th>Pay Method</th><th>Pay Amt</th><th>Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>No rows extracted. PDF may be scanned or unrecognised format.</td></tr>}
                  {rows.map((row) => (
                    <tr key={row.rowIndex} style={{ background: row.hasVc ? '#fff0e0' : row.warnings.length > 0 ? '#fffacc' : undefined }}>
                      <td style={{ fontSize: 10, color: '#808080' }}>{row.rowIndex + 1}</td>
                      <td style={{ fontSize: 10 }}>{row.txType}</td>
                      <td>
                        <input className='win95-input' type='date' value={row.date ?? ''} style={{ width: 115 }}
                          onChange={e => updateRow(row.rowIndex, 'date', e.target.value)} />
                      </td>
                      <td><input className='win95-input' value={row.receiptNo ?? ''} style={{ width: 80 }}
                        onChange={e => updateRow(row.rowIndex, 'receiptNo', e.target.value)} /></td>
                      <td><input className='win95-input' type='number' value={row.qty ?? ''} style={{ width: 50 }}
                        onChange={e => updateRow(row.rowIndex, 'qty', parseInt(e.target.value))} /></td>
                      <td>
                        {row.hasVc ? (
                          <div>
                            <span className='category-badge vc' style={{ marginBottom: 2, display: 'block' }}>V/C (original)</span>
                            <select className='win95-select' style={{ width: 80, fontSize: 10 }}
                              value={row.vcMappingConfirmed ? (row.category ?? '') : ''}
                              onChange={e => updateRow(row.rowIndex, 'category', e.target.value)}>
                              <option value=''>Keep V/C</option>
                              <option value='SC'>Map → S/C</option>
                              <option value='BC'>Map → B/C</option>
                            </select>
                            <label style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                              <input type='checkbox' checked={row.vcMappingConfirmed ?? false}
                                onChange={e => updateRow(row.rowIndex, 'vcMappingConfirmed', e.target.checked)} />
                              Confirm mapping
                            </label>
                          </div>
                        ) : (
                          <span className={`category-badge ${row.category === 'BC' ? 'bc' : 'sc'}`}>{row.category}</span>
                        )}
                      </td>
                      <td><input className='win95-input' type='number' value={row.totalWeight ?? ''} style={{ width: 70 }}
                        onChange={e => updateRow(row.rowIndex, 'totalWeight', parseFloat(e.target.value))} /></td>
                      <td><input className='win95-input' type='number' value={row.rate ?? ''} style={{ width: 60 }}
                        onChange={e => updateRow(row.rowIndex, 'rate', parseFloat(e.target.value))} /></td>
                      <td className='amount'>{row.amount?.toFixed(2) ?? '—'}</td>
                      <td style={{ fontSize: 10 }}>{row.paymentMethod ?? '—'}</td>
                      <td className='amount'>{row.paymentAmount?.toFixed(2) ?? '—'}</td>
                      <td style={{ fontSize: 9, color: '#800000', maxWidth: 140 }}>
                        {row.warnings.length > 0 ? row.warnings.join('; ') : '✓'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className='win95-btn' onClick={() => { setStep('upload'); setBatchId(''); setRows([]); }}>
                ← Back
              </button>
              <button className='win95-btn win95-btn-primary' disabled={confirming} onClick={handleConfirm}>
                {confirming ? 'Importing...' : '✅ Confirm Import'}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: DONE ─── */}
        {step === 'done' && result && (
          <div>
            <div className='alert-box success' style={{ marginBottom: 8 }}>
              ✅ <strong>Import complete!</strong> {result.saved} transaction(s) saved successfully.
              {result.skipped > 0 && ` ${result.skipped} skipped (duplicates or errors).`}
            </div>
            {result.errors?.length > 0 && (
              <div className='alert-box error' style={{ marginBottom: 8 }}>
                ⚠️ {result.errors.length} row(s) failed: {result.errors.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a href='/purchases' className='win95-btn' style={{ textDecoration: 'none' }}>View Purchases</a>
              <a href='/payments' className='win95-btn' style={{ textDecoration: 'none' }}>View Payments</a>
              <button className='win95-btn win95-btn-primary' onClick={() => { setStep('upload'); setFile(null); setRows([]); setResult(null); setBatchId(''); }}>
                Import Another
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
