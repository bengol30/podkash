import { NextRequest, NextResponse } from 'next/server';
import { readGoogleDriveTokens, readStore } from '@/lib/db';
import { ensureGoogleDriveFolder, listGoogleDriveFolderFiles, refreshGoogleDriveTokensIfNeeded, syncGoogleDriveEpisodes } from '@/lib/google-drive-sync';

export const dynamic = 'force-dynamic';

const OUTPUT_FOLDER_NAME = 'סרטונים ערוכים עם סאונד וכתוביות';
const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

function folderIdFromUrl(value?: string) {
  if (!value) return '';
  return value.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || value.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
}

function isGeneratedMarketingVideo(name: string) {
  return /מיטב הרגעים|כל סרטוני השיווק|עם סאונד רשמי|עם סאונד וכתוביות|סאונד רשמי וכתוביות/i.test(name);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const storeBefore = await readStore();
    const job = (storeBefore.marketingAudioSyncJobs || []).find(j => j.id === jobId);
    if (!job) throw new Error('המשימה לא נמצאה');
    await syncGoogleDriveEpisodes({ episodeId: job.episodeId });
    const store = await readStore();
    const episode = store.episodes.find(ep => ep.id === job.episodeId);
    if (!episode) throw new Error('הפרק לא נמצא');
    const marketingFolderId = folderIdFromUrl(episode.driveMarketingFolderUrl || episode.shortsDriveFolderUrl);
    const audioFolderId = folderIdFromUrl(episode.fullAudioFolderUrl);
    if (!marketingFolderId) throw new Error('חסרה תיקיית סרטוני שיווק בדרייב');
    if (!audioFolderId) throw new Error('חסרה תיקיית קובץ שמע מלא בדרייב');
    const rawTokens = await readGoogleDriveTokens();
    if (!rawTokens) throw new Error('Google Drive לא מחובר');
    const { tokens } = await refreshGoogleDriveTokensIfNeeded(rawTokens);
    const [marketingFiles, audioFiles] = await Promise.all([
      listGoogleDriveFolderFiles(tokens, marketingFolderId),
      listGoogleDriveFolderFiles(tokens, audioFolderId),
    ]);
    const videos = marketingFiles.filter(file => !isGeneratedMarketingVideo(file.name) && (VIDEO_RE.test(file.name) || (file.mimeType || '').startsWith('video/')));
    const audioFile = audioFiles.find(file => AUDIO_RE.test(file.name) || (file.mimeType || '').startsWith('audio/'));
    if (!audioFile) throw new Error('לא נמצא קובץ אודיו בתיקיית קובץ שמע מלא');
    const outputFolder = await ensureGoogleDriveFolder(tokens, OUTPUT_FOLDER_NAME, marketingFolderId);
    return NextResponse.json({ ok: true, accessToken: tokens.accessToken, job, episode, marketingFolderId, audioFolderId, videos, audioFile, outputFolder });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'טעינת נתוני worker נכשלה';
    console.error('[marketing-audio-sync:context]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
