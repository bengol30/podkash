import { AppShell } from '@/components/AppShell';
import { EpisodeDetailClient } from '@/components/ClientApp';
import { readStore } from '@/lib/db';
import { seedStore } from '@/lib/store-types';

export const dynamic = 'force-dynamic';

export default async function EpisodeCommandCenter({ params }: { params: Promise<{id:string}> }){
 const { id } = await params;
 let store = seedStore;
 try {
  store = await readStore();
 } catch (error) {
  console.error('[podkash-episode]', error);
 }
 return <AppShell active="/episodes"><EpisodeDetailClient id={id} initialStore={store} /></AppShell>;
}
