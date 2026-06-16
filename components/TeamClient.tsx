'use client';

import { FormEvent, useEffect, useState } from 'react';

type Host = { id: string; name: string; username: string; role: string; hostId: string; createdAt: string };

export function TeamClient() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/hosts', { cache: 'no-store' });
    if (res.ok) { const data = await res.json(); setHosts(data.hosts || []); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError('');
    const form = ev.currentTarget;
    const get = (n: string) => String(new FormData(form).get(n) || '').trim();
    const name = get('name'); const username = get('username'); const password = get('password');
    setSaving(true);
    const res = await fetch('/api/hosts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, username, password }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || 'שגיאה ביצירת מנחה'); return; }
    setCreated({ name, username, password });
    form.reset();
    load();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`להסיר את ${name}? הנתונים שלו יישמרו במערכת, אבל הוא לא יוכל יותר להתחבר.`)) return;
    await fetch(`/api/hosts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  return <>
    <header className="pageHead"><div><p className="eyebrow">ניהול</p><h1>צוות מנחים</h1><p>כל מנחה מקבל שם משתמש וסיסמה, מתחבר בעצמו, ורואה רק את הפרקים, המרואיינים והיומן שלו.</p></div></header>

    {created && <div className="credBox">
      <b>המנחה «{created.name}» נוצר בהצלחה 🎉</b>
      <p className="muted" style={{ margin: '8px 0 0' }}>העבר לו את פרטי הכניסה (לא יוצגו שוב):</p>
      <p style={{ margin: '8px 0 0' }}>שם משתמש: <code>{created.username}</code> · סיסמה: <code>{created.password}</code></p>
    </div>}

    <section className="panel" style={{ marginBottom: 16 }}>
      <h2>הוספת מנחה חדש</h2>
      <form className="smartForm" onSubmit={add}>
        <label className="formRow"><span>שם המנחה *</span><input name="name" required /></label>
        <label className="formRow"><span>שם משתמש לכניסה *</span><input name="username" autoComplete="off" required /></label>
        <label className="formRow"><span>סיסמה *</span><input name="password" type="text" required /></label>
        {error && <p className="joinError" style={{ gridColumn: '1/-1' }}>{error}</p>}
        <div className="formActions"><button className="btn gold" disabled={saving}>{saving ? 'יוצר…' : 'צור מנחה'}</button></div>
      </form>
    </section>

    <section className="panel">
      <h2>מנחים קיימים</h2>
      <div className="list">
        {loading ? <p className="muted">טוען…</p> : hosts.length ? hosts.map(h => <div className="row" key={h.id}>
          <div><h3 style={{ margin: 0 }}>{h.name}</h3><p className="muted" style={{ margin: '4px 0 0' }}>שם משתמש: {h.username}</p></div>
          <button className="deleteTiny" onClick={() => remove(h.id, h.name)}>הסר</button>
        </div>) : <p className="muted">עדיין אין מנחים. הוסף את הראשון למעלה.</p>}
      </div>
    </section>
  </>;
}
