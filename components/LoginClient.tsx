'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const params = useSearchParams();
  const next = useMemo(() => params.get('next') || '/', [params]);
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
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('הסיסמה לא נכונה. נסו שוב.');
      return;
    }
    window.location.href = next.startsWith('/') ? next : '/';
  }

  return <section className="loginCard">
    <div className="joinBadge">🎙️ פודקש</div>
    <h1>כניסה למערכת</h1>
    <p>מערכת הניהול מוגנת. טופס ההרשמה החיצוני נשאר פתוח לציבור, אבל ניהול הפרקים, הנכסים והחיבורים נשמרים מאחורי סיסמה.</p>
    <form onSubmit={submit} className="loginForm">
      <label><span>סיסמת מנהל</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoFocus required /></label>
      {error ? <p className="joinError">{error}</p> : null}
      <button className="btn gold" disabled={loading}>{loading ? 'בודק…' : 'כניסה'}</button>
    </form>
    <a className="loginPublicLink" href="/join">מעבר לטופס ההרשמה הציבורי</a>
  </section>;
}

export function LoginClient() {
  return <main className="loginPage"><Suspense fallback={null}><LoginForm /></Suspense></main>;
}
