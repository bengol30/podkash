import { NextResponse } from 'next/server';
import { readStore, writeStore } from '@/lib/db';
import { type Application, type ApplicationType, type Person } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

function text(value: unknown) {
  return String(value || '').trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type = text(body.type) as ApplicationType;
    if (!['guest', 'host'].includes(type)) {
      return NextResponse.json({ error: 'Invalid application type' }, { status: 400 });
    }
    const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
    const name = text(data.name);
    const phone = text(data.phone);
    const email = text(data.email);
    if (!name || !phone || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const store = await readStore();
    const cleanData = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : text(value)]));
    const application: Application = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      createdAt: new Date().toISOString(),
      name,
      phone,
      email,
      city: text(data.city),
      age: text(data.age),
      displayName: text(data.displayName),
      links: text(data.links),
      data: cleanData,
    };

    // Auto-add the registrant to the People contact list (deduped by phone/name).
    const note = [cleanData.mainTopic || cleanData.episodeTopic || cleanData.about || cleanData.whyHost, application.city && `עיר: ${application.city}`, 'נרשם/ה דרך הטופס'].filter(Boolean).join(' · ');
    const person: Person = {
      name,
      role: type === 'host' ? 'מנחה (הרשמה)' : 'מרואיין (הרשמה)',
      type,
      phone,
      episodes: 0,
      note,
      email,
      city: application.city,
      source: 'registration',
    };
    const people = store.people || [];
    const personExists = people.some(p => (phone && p.phone === phone) || (!phone && p.name === name));
    const nextPeople = personExists ? people : [person, ...people];

    await writeStore({ ...store, applications: [application, ...(store.applications || [])], people: nextPeople });
    return NextResponse.json({ ok: true, id: application.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[podkash-applications]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
