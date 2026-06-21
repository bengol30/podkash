import { NextRequest, NextResponse } from 'next/server';
import {
  getValidYouTubeAccess,
  fetchYouTubeChannel,
  listManageableVideos,
  updateVideo,
  deleteVideo,
  type YouTubePrivacy,
} from '@/lib/youtube';

export const dynamic = 'force-dynamic';

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : 'YouTube management failed';
  const status = message === 'YouTube is not connected' ? 409 : 502;
  return NextResponse.json({ ok: false, message }, { status });
}

// List the channel's own videos with full editable fields.
export async function GET() {
  try {
    const tokens = await getValidYouTubeAccess();
    const channel = await fetchYouTubeChannel(tokens.accessToken);
    const videos = await listManageableVideos(tokens.accessToken, channel?.uploadsPlaylistId);
    return NextResponse.json({ ok: true, videos });
  } catch (error) {
    return fail(error);
  }
}

type PatchBody = {
  id?: string;
  title?: string;
  description?: string;
  tags?: string[] | string;
  categoryId?: string;
  privacyStatus?: YouTubePrivacy;
  publishAt?: string | null;
};

// Edit a video's metadata / privacy / schedule.
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as PatchBody;
    if (!body.id) return NextResponse.json({ ok: false, message: 'missing video id' }, { status: 400 });

    let publishAt: string | null | undefined = undefined;
    if (body.publishAt) {
      const date = new Date(body.publishAt);
      if (Number.isNaN(date.getTime())) return NextResponse.json({ ok: false, message: 'תאריך תזמון לא תקין' }, { status: 400 });
      publishAt = date.toISOString();
    } else if (body.publishAt === null || body.publishAt === '') {
      publishAt = null;
    }

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === 'string'
        ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

    const tokens = await getValidYouTubeAccess();
    await updateVideo(tokens.accessToken, body.id, {
      title: body.title,
      description: body.description,
      tags,
      categoryId: body.categoryId,
      privacyStatus: body.privacyStatus,
      publishAt,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

// Delete a video.
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, message: 'missing video id' }, { status: 400 });
    const tokens = await getValidYouTubeAccess();
    await deleteVideo(tokens.accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
