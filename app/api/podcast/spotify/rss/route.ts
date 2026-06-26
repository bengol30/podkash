import { buildPodcastRss } from '@/lib/podcast';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(await buildPodcastRss(), {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}
