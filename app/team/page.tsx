import { AppShell } from '@/components/AppShell';
import { TeamClient } from '@/components/TeamClient';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await getSession();
  return <AppShell active="/team">
    {session?.role === 'admin'
      ? <TeamClient />
      : <section className="panel"><h2>אזור מנהל בלבד</h2><p className="muted">רק מנהל המערכת יכול לנהל מנחים.</p></section>}
  </AppShell>;
}
