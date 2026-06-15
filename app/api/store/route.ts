import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/db';
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
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  console.error('[podkash-store]', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await readStore());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const data = normalizeStore(await request.json());
    return NextResponse.json(await writeStore(data));
  } catch (error) {
    return errorResponse(error);
  }
}
