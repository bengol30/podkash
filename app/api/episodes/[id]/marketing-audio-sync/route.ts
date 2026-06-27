import { NextRequest, NextResponse } from 'next/server';
import { enqueueMarketingAudioSync } from '@/lib/marketing-audio-sync';
import { syncGoogleDriveEpisodes } from '@/lib/google-drive-sync';
import { readStore } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const episodeId = Number(id);
    if (!Number.isFinite(episodeId)) throw new Error('מספר פרק לא תקין');

    // The sound/subtitle flow depends on the latest Drive folder mapping.
    // Do this automatically from the button so the user does not have to run
    // a separate Drive sync first.
    const driveSync = await syncGoogleDriveEpisodes({ episodeId });
    const store = await readStore();
    const episode = store.episodes.find(ep => ep.id === episodeId);
    if (!episode) throw new Error('הפרק לא נמצא אחרי סנכרון Drive');
    if (!episode.driveMarketingFolderUrl && !episode.shortsDriveFolderUrl) throw new Error('סנכרון Drive לא מצא/יצר תיקיית סרטוני שיווק לפרק');
    if (!episode.fullAudioFolderUrl) throw new Error('סנכרון Drive לא מצא/יצר תיקיית קובץ שמע מלא לפרק');
    if (episode.driveAssetStatus?.marketing && !episode.driveAssetStatus.marketing.hasFiles) throw new Error('תיקיית סרטוני השיווק קיימת אבל אין בה קבצי וידאו לעיבוד');
    if (episode.driveAssetStatus?.fullAudio && !episode.driveAssetStatus.fullAudio.hasFiles) throw new Error('תיקיית קובץ השמע המלא קיימת אבל אין בה קובץ אודיו');

    const job = await enqueueMarketingAudioSync(episodeId);
    return NextResponse.json({ ok: true, job, driveSync });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'יצירת משימת סנכרון נכשלה';
    const reconnectRequired = /expired|revoked|invalid_grant|Google Drive is not connected|Drive token/i.test(rawMessage);
    const message = reconnectRequired
      ? 'הכפתור ניסה לסנכרן את Drive אוטומטית, אבל החיבור ל־Google Drive פג/בוטל. צריך לחבר את Drive מחדש פעם אחת ואז להפעיל שוב.'
      : rawMessage;
    console.error('[marketing-audio-sync:start]', rawMessage);
    return NextResponse.json({ ok: false, error: message, reconnectRequired }, { status: reconnectRequired ? 409 : 500 });
  }
}
