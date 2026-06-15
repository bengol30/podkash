import Link from 'next/link';

const nav = [
  ['/', 'סקירה', '⌂'],
  ['/episodes', 'פרקים', '🎙'],
  ['/production', 'הפקה', '🎬'],
  ['/calendar', 'יומן', '🗓'],
  ['/distribution', 'הפצה', '📣'],
  ['/people', 'אנשים', '👥'],
  ['/tasks', 'משימות', '✓'],
  ['/messages', 'הודעות', '💬'],
];

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  return <div className="appShell">
    <aside className="side">
      <Link href="/" className="brand"><div className="mark">פ</div><div><b>פודקש</b><span>Podcast OS</span></div></Link>
      <nav className="sideNav">{nav.map(([href,label,icon]) => <Link key={href} className={active === href ? 'on' : ''} href={href}><span>{icon}</span>{label}</Link>)}</nav>
      <div className="sideNote"><b>מה חשוב עכשיו?</b><p>כל מסך עונה על צורך תפעולי אחר: פרקים, צילום, הפצה, אנשים ומשימות.</p></div>
    </aside>
    <main className="content">{children}</main>
    <nav className="tabbar">{nav.map(([href,label,icon]) => <Link key={href} className={active === href ? 'on' : ''} href={href}><span>{icon}</span><small>{label}</small></Link>)}</nav>
  </div>
}

export function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <header className="pageHead"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="headAction">{action}</div>}</header>
}

export function Button({ children, tone='dark', href, disabled=false }: { children: React.ReactNode; tone?: 'dark'|'gold'|'light'; href?: string; disabled?: boolean }) {
  if (href) return <Link className={`btn ${tone}`} href={href}>{children}</Link>;
  return <button className={`btn ${tone}`} disabled={disabled} title={disabled ? 'בקרוב' : undefined}>{children}</button>
}

export function Metric({ n, label }: { n: string|number; label: string }) { return <div className="metric"><strong>{n}</strong><span>{label}</span></div> }
