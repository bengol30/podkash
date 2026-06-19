import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listHosts, createHost, deleteHost, setHostDriveFolder } from '@/lib/db';
import { ensureHostDriveFolder } from '@/lib/google-drive-sync';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === 'admin' ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ hosts: await listHosts() });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const host = await createHost({
      name: String(body.name || ''),
      username: String(body.username || ''),
      password: String(body.password || ''),
    });
    // Open the host's main Drive folder ("<name> מנחה פודק״ש"); best-effort.
    const folder = await ensureHostDriveFolder(host.name);
    if (folder) await setHostDriveFolder(host.hostId, folder.id, folder.url || '');
    return NextResponse.json({ ok: true, host: { ...host, driveFolderUrl: folder?.url } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  await deleteHost(id);
  return NextResponse.json({ ok: true });
}
