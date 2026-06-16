'use client';

import Link from 'next/link';
import { useState } from 'react';

export function SessionBar({ name, role }: { name: string; role: 'admin' | 'host' }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return <div className="sessionBar">
    <span className="sessionWho"><b>{role === 'admin' ? 'מנהל' : 'מנחה'}</b> · {name}</span>
    <div className="sessionActions">
      {role === 'admin' && <Link className="pill blue" href="/team">👤 צוות מנחים</Link>}
      <button className="miniBtn" type="button" onClick={logout} disabled={busy}>{busy ? '…' : 'התנתקות'}</button>
    </div>
  </div>;
}
