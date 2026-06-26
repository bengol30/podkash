import { NextRequest, NextResponse } from 'next/server';
import { deletePodcastEpisode, listPodcastEpisodes, savePodcastEpisode } from '@/lib/podcast';

export async function GET() { return NextResponse.json({ episodes: await listPodcastEpisodes() }); }
export async function POST(req: NextRequest) {
  try { return NextResponse.json({ ok: true, episode: await savePodcastEpisode(await req.json()) }); }
  catch (error) { return NextResponse.json({ ok:false, message: error instanceof Error ? error.message : 'save failed' }, { status: 400 }); }
}
export async function PUT(req: NextRequest) {
  try { return NextResponse.json({ ok: true, episode: await savePodcastEpisode(await req.json()) }); }
  catch (error) { return NextResponse.json({ ok:false, message: error instanceof Error ? error.message : 'update failed' }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok:false, message:'missing id' }, { status: 400 });
  await deletePodcastEpisode(id);
  return NextResponse.json({ ok: true });
}
