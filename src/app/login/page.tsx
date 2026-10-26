'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) router.push('/dashboard');
    else setError('Invalid email or password.');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#008080', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#c0c0c0', borderTop: '2px solid #fff', borderLeft: '2px solid #fff', borderRight: '2px solid #000', borderBottom: '2px solid #000', width: 320, padding: 0 }}>
        {/* Title bar */}
        <div style={{ background: '#000080', color: '#fff', padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
          <img src='/logo.png' alt='' width={16} height={16} style={{ objectFit: 'contain' }} />
          <span style={{ fontWeight: 'bold', fontSize: 12, flex: 1, fontFamily: 'Tahoma, Arial, sans-serif' }}>ADEEB ENTERPRISES — Login</span>
        </div>
        <div style={{ padding: 16, fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12 }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <img src='/logo.png' alt='ADEEB ENTERPRISES' style={{ height: 60, objectFit: 'contain' }} />
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#0a1628', marginTop: 4 }}>ADEEB ENTERPRISES</div>
            <div style={{ fontSize: 11, color: '#808080' }}>Buffalo Trading Ledger</div>
          </div>
          {error && <div style={{ background: '#fff0f0', border: '1px solid #800000', color: '#800000', padding: '4px 8px', marginBottom: 8, fontSize: 11 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Email Address:</label>
              <input type='email' value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '2px 4px', borderTop: '2px solid #808080', borderLeft: '2px solid #808080', borderRight: '2px solid #fff', borderBottom: '2px solid #fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Password:</label>
              <input type='password' value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: '100%', padding: '2px 4px', borderTop: '2px solid #808080', borderLeft: '2px solid #808080', borderRight: '2px solid #fff', borderBottom: '2px solid #fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button type='submit' disabled={loading}
                style={{ background: '#c0c0c0', borderTop: '2px solid #fff', borderLeft: '2px solid #fff', borderRight: '2px solid #000', borderBottom: '2px solid #000', padding: '4px 24px', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold', minWidth: 80 }}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
          <div style={{ marginTop: 16, borderTop: '1px solid #808080', paddingTop: 8, fontSize: 10, color: '#808080', textAlign: 'center' }}>ADEEB ENTERPRISES — Buffalo Trading Ledger v1.0</div>
        </div>
      </div>
    </div>
  );
}
