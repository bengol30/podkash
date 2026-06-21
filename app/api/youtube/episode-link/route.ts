import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/db';
import { getSession, storeIdForSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Authoritatively saves a YouTube link onto an episode in the caller's store.
// Done server-side so the page's debounced full-store autosave can't clobber it.
export async function POST(request: Request) {
  try {
    const { episodeId, url } = await request.json();
    const id = Number(episodeId);
    if (!id || typeof url !== 'string' || !url) {
      return NextResponse.json({ ok: false, message: 'missing episodeId or url' }, { status: 400 });
    }
    const storeId = storeIdForSession(await getSession());
    const store = await readStore(storeId);
    let matched = false;
    const episodes = store.episodes.map(e => {
      if (e.id === id) { matched = true; return { ...e, youtubeUrl: url }; }
      return e;
    });
    if (!matched) return NextResponse.json({ ok: false, message: 'episode not found' }, { status: 404 });
    await writeStore({ ...store, episodes }, storeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'save failed' }, { status: 500 });
  }
}
