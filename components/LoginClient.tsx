'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const params = useSearchParams();
  const next = useMemo(() => params.get('next') || '/', [params]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('שם המשתמש או הסיסמה לא נכונים. נסו שוב.');
      return;
    }
    window.location.href = next.startsWith('/') ? next : '/';
  }

  return <section className="loginCard">
    <div className="joinBadge">🎙️ פודקש</div>
    <h1>כניסה למערכת</h1>
    <p>מנהל המערכת מתחבר עם סיסמת המנהל (בלי שם משתמש). מנחים מתחברים עם שם המשתמש והסיסמה שקיבלו.</p>
    <form onSubmit={submit} className="loginForm">
      <label><span>שם משתמש <small style={{fontWeight:700,color:'#cdbfae'}}>(למנחים — מנהל משאיר ריק)</small></span><input type="text" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" /></label>
      <label><span>סיסמה</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" autoFocus required /></label>
      {error ? <p className="joinError">{error}</p> : null}
      <button className="btn gold" disabled={loading}>{loading ? 'בודק…' : 'כניסה'}</button>
    </form>
    <a className="loginPublicLink" href="/join">מעבר לטופס ההרשמה הציבורי</a>
  </section>;
}

export function LoginClient() {
  return <main className="loginPage"><Suspense fallback={null}><LoginForm /></Suspense></main>;
}
