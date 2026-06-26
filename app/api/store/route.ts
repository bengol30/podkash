import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/db';
import { getSession, storeIdForSession } from '@/lib/auth';
import { seedStore, type Store } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

function normalizeStore(input: Partial<Store> | string | null | undefined): Store {
  const source = typeof input === 'string' ? JSON.parse(input) as Partial<Store> : input || {};
  return {
    episodes: Array.isArray(source.episodes) ? source.episodes : seedStore.episodes,
    people: Array.isArray(source.people) ? source.people : seedStore.people,
    tasks: Array.isArray(source.tasks) ? source.tasks : seedStore.tasks,
    messages: Array.isArray(source.messages) ? source.messages : seedStore.messages,
    platforms: Array.isArray(source.platforms) ? source.platforms : seedStore.platforms,
    sessions: Array.isArray(source.sessions) ? source.sessions : seedStore.sessions,
    applications: Array.isArray(source.applications) ? source.applications : seedStore.applications,
    podcastEpisodes: Array.isArray(source.podcastEpisodes) ? source.podcastEpisodes : seedStore.podcastEpisodes,
    marketingAudioSyncJobs: Array.isArray(source.marketingAudioSyncJobs) ? source.marketingAudioSyncJobs : seedStore.marketingAudioSyncJobs,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  console.error('[podkash-store]', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const storeId = storeIdForSession(await getSession());
    return NextResponse.json(await readStore(storeId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const storeId = storeIdForSession(await getSession());
    const data = normalizeStore(await request.json());
    return NextResponse.json(await writeStore(data, storeId));
  } catch (error) {
    return errorResponse(error);
  }
}
