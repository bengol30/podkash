import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { readGoogleDriveTokens, readStore, writeStore } from './db';
import { ensureGoogleDriveFolder, googleDriveApi, listGoogleDriveFolderFiles, refreshGoogleDriveTokensIfNeeded, syncGoogleDriveEpisodes } from './google-drive-sync';
import { type Episode, type MarketingAudioSyncJob, type MarketingSubtitleSegment, type Store } from './store-types';

type DriveTokens = Awaited<ReturnType<typeof refreshGoogleDriveTokensIfNeeded>>['tokens'];
type DriveFile = { id: string; name: string; mimeType?: string; webViewLink?: string };

const OUTPUT_FOLDER_NAME = 'סרטונים ערוכים עם סאונד וכתוביות';
const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;
const INTERMEDIATE_VIDEO_CRF = process.env.PODKASH_INTERMEDIATE_VIDEO_CRF || '16';
const FINAL_VIDEO_CRF = process.env.PODKASH_FINAL_VIDEO_CRF || '18';
const VIDEO_PRESET = process.env.PODKASH_VIDEO_PRESET || 'medium';
const activeJobs = new Set<string>();

function folderIdFromUrl(value?: string) {
  if (!value) return '';
  return value.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || value.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'video';
}

function outputName(input: string) {
  const ext = path.extname(input) || '.mp4';
  const base = path.basename(input, ext);
  return `${safeName(base)} - עם סאונד רשמי וכתוביות.mp4`;
}

function compactGuestName(value?: string) {
  const first = (value || '').split(/[,،|/]+/)[0]?.replace(/\([^)]*\)/g, '').trim();
  return safeName(first || 'מרואיין').slice(0, 45);
}

function normalizeClipWords(value: string) {
  return value
    .replace(/[`"“”'׳״]/g, '')
    .replace(/[\\/:*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');
}

function namedOutputName(guestName: string | undefined, clipTitle: string | undefined, fallbackInput: string) {
  const guest = compactGuestName(guestName);
  const title = normalizeClipWords(clipTitle || '') || safeName(path.basename(fallbackInput, path.extname(fallbackInput) || '.mp4')).split(' ').slice(0, 4).join(' ');
  return `${guest} - ${safeName(title)}.mp4`;
}

function run(command: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-6000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr || 'no stderr'}`)));
  });
}

async function capture(command: string, args: string[], cwd?: string) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-6000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} exited ${code}: ${stderr || 'no stderr'}`)));
  });
}

async function durationSeconds(filePath: string) {
  const out = await capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath]);
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) throw new Error('לא הצלחתי לזהות אורך קובץ');
  return n;
}

async function downloadDriveFile(tokens: DriveTokens, file: DriveFile, targetPath: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!res.ok || !res.body) throw new Error(`הורדת ${file.name} נכשלה (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(targetPath, bytes);
}

async function uploadDriveFile(tokens: DriveTokens, folderId: string, filePath: string, name: string, mimeType = 'video/mp4') {
  const fileStats = await stat(filePath);
  const metadata = { name, parents: [folderId], mimeType };
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.accessToken}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mimeType, 'x-upload-content-length': String(fileStats.size) },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const json = await start.json().catch(() => ({}));
    throw new Error(json?.error?.message || `פתיחת העלאת ${name} נכשלה (${start.status})`);
  }
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive לא החזיר כתובת העלאה');
  const uploadInit = {
    method: 'PUT',
    headers: { 'content-type': mimeType, 'content-length': String(fileStats.size) },
    body: createReadStream(filePath),
    duplex: 'half',
  } as unknown as RequestInit & { duplex: 'half' };
  const res = await fetch(uploadUrl, uploadInit);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `העלאת ${name} נכשלה (${res.status})`);
  return json as DriveFile;
}

async function extractPreviewAudio(inputAudioPath: string, outputAudioPath: string, startMs: number, endMs: number) {
  const start = Math.max(0, startMs / 1000);
  const duration = Math.max(0.5, (endMs - startMs) / 1000);
  await run('ffmpeg', ['-y', '-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', inputAudioPath, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '80k', outputAudioPath]);
}

async function upsertJob(updater: (job: MarketingAudioSyncJob) => MarketingAudioSyncJob) {
  const store = await readStore();
  const jobs = store.marketingAudioSyncJobs || [];
  const nextJobs = jobs.map(job => updater(job));
  await writeStore({ ...store, marketingAudioSyncJobs: nextJobs });
}

async function updateJob(jobId: string, patch: Partial<MarketingAudioSyncJob>) {
  await upsertJob(job => job.id === jobId ? { ...job, ...patch } : job);
}

async function updateItem(jobId: string, fileId: string | undefined, patch: Partial<MarketingAudioSyncJob['items'][number]>) {
  await upsertJob(job => job.id === jobId ? { ...job, items: job.items.map(item => item.fileId === fileId ? { ...item, ...patch } : item) } : job);
}

function summarize(job: MarketingAudioSyncJob) {
  const done = job.items.filter(item => item.status === 'completed');
  const failed = job.items.filter(item => item.status === 'failed');
  const skipped = job.items.filter(item => item.status === 'skipped');
  const lines = [
    `סנכרון סאונד וכתוביות לפרק “${job.episodeTitle}” הסתיים.`,
    `הצליחו: ${done.length} · נכשלו: ${failed.length} · דולגו: ${skipped.length}`,
  ];
  if (job.outputFolderUrl) lines.push(`התיקייה בדרייב: ${job.outputFolderUrl}`);
  if (done.length) lines.push(`\nהצליחו:\n${done.map(item => `• ${item.fileName}${item.outputFileUrl ? ` → ${item.outputFileUrl}` : ''}`).join('\n')}`);
  if (failed.length) lines.push(`\nנכשלו:\n${failed.map(item => `• ${item.fileName}: ${item.message || 'שגיאה לא ידועה'}`).join('\n')}`);
  if (skipped.length) lines.push(`\nדולגו:\n${skipped.map(item => `• ${item.fileName}: ${item.message || 'לא עובד'}`).join('\n')}`);
  return lines.join('\n');
}

async function extractWave(input: string, output: string, audioStream = '0:a:0') {
  await run('ffmpeg', ['-y', '-i', input, '-map', audioStream, '-vn', '-ac', '1', '-ar', '8000', '-acodec', 'pcm_s16le', output]);
}

async function extractCaptionAudio(input: string, output: string) {
  await run('ffmpeg', ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '96k', output]);
}

async function extractOfficialCaptionAudio(input: string, output: string, offsetSeconds: number, duration: number) {
  await run('ffmpeg', ['-y', '-ss', offsetSeconds.toFixed(3), '-t', duration.toFixed(3), '-i', input, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '128k', output]);
}

function escapeSubtitlePath(filePath: string) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

async function transcribeToSrt(inputAudioPath: string, outputSrtPath: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('חסר OPENAI_API_KEY ליצירת כתוביות');

  const bytes = await readFile(inputAudioPath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(inputAudioPath));
  form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe');
  form.append('response_format', 'srt');
  form.append('language', 'he');
  form.append('prompt', 'תמלול עברית מדויק לפודקאסט/ראיון. שמור שמות, מונחים מקצועיים, מספרים וסלנג ישראלי בצורה טבעית.');

  let res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok && (process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe') !== 'whisper-1') {
    const fallback = new FormData();
    fallback.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(inputAudioPath));
    fallback.append('model', 'whisper-1');
    fallback.append('response_format', 'srt');
    fallback.append('language', 'he');
    fallback.append('prompt', 'תמלול עברית מדויק לפודקאסט/ראיון. שמור שמות, מונחים מקצועיים, מספרים וסלנג ישראלי בצורה טבעית.');
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: fallback,
    });
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`תמלול OpenAI נכשל (${res.status}): ${text.slice(0, 500)}`);
  if (!text.trim()) throw new Error('OpenAI החזיר תמלול ריק');
  const readable = formatSrtForReadableCaptions(text);
  await writeFile(outputSrtPath, readable);
  return readable;
}

function srtTimeToMs(value: string) {
  const match = value.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function msToSrtTime(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const milli = safe % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

function chunkCaptionWords(text: string) {
  const words = normalizeHebrewCaptionText(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    if (current.length && current.length >= 8) {
      chunks.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks.length ? chunks : [''];
}

function splitCaptionLine(text: string) {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(' '));
  return lines.slice(0, 2).map(line => `‫${line}‬`).join('\n');
}

function normalizeHebrewCaptionText(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?=\S)/g, '$1 ')
    .replace(/(^|\s)([,.!?;:]+)(\S)/g, '$1$3$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSrtForReadableCaptions(srt: string) {
  const blocks = srt.replace(/\r/g, '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const output: string[] = [];
  let index = 1;
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const timing = lines.find(line => line.includes('-->'));
    if (!timing) continue;
    const [startRaw, endRaw] = timing.split('-->').map(value => value.trim().split(' ')[0]);
    const start = srtTimeToMs(startRaw);
    const end = srtTimeToMs(endRaw);
    const text = lines.filter(line => !/^\d+$/.test(line) && !line.includes('-->')).join(' ');
    const chunks = chunkCaptionWords(text);
    const duration = Math.max(900, end - start);
    const step = duration / chunks.length;
    chunks.forEach((chunk, i) => {
      const chunkStart = start + (step * i);
      const chunkEnd = i === chunks.length - 1 ? end : start + (step * (i + 1));
      output.push(`${index++}\n${msToSrtTime(chunkStart)} --> ${msToSrtTime(chunkEnd)}\n${splitCaptionLine(chunk)}`);
    });
  }
  return output.join('\n\n') + '\n';
}

function parseSrtSegments(srt: string): MarketingSubtitleSegment[] {
  return srt.replace(/\r/g, '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map((block, idx) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const timing = lines.find(line => line.includes('-->')) || '';
    const [startRaw = '00:00:00,000', endRaw = '00:00:00,900'] = timing.split('-->').map(value => value.trim().split(' ')[0]);
    const text = lines.filter(line => !/^\d+$/.test(line) && !line.includes('-->')).join(' ').replace(/[‫‬]/g, '').trim();
    return { id: `seg_${idx + 1}`, index: idx + 1, startMs: srtTimeToMs(startRaw), endMs: srtTimeToMs(endRaw), text, originalText: text };
  }).filter(segment => segment.text || segment.endMs > segment.startMs);
}

function segmentsToSrt(segments: MarketingSubtitleSegment[]) {
  return segments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((segment, idx) => `${idx + 1}\n${msToSrtTime(segment.startMs)} --> ${msToSrtTime(Math.max(segment.endMs, segment.startMs + 500))}\n${splitCaptionLine(segment.text || '')}`)
    .join('\n\n') + '\n';
}

async function suggestClipTitleFromTranscript(srtText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('חסר OPENAI_API_KEY ליצירת שם קובץ');
  const clean = srtText
    .replace(/^\d+$/gm, '')
    .replace(/\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_FILENAME_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'אתה נותן שם קצר בעברית לקליפ פודקאסט. החזר רק שם, בלי מרכאות, בלי נקודה, עד 4 מילים, לפי הדבר הכי מעניין שנאמר. לא לכלול שם מרואיין.' },
        { role: 'user', content: clean },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `יצירת שם קובץ נכשלה (${res.status})`);
  return normalizeClipWords(json?.choices?.[0]?.message?.content || '');
}

async function burnSubtitles(inputVideoPath: string, srtPath: string, outputVideoPath: string) {
  await run('ffmpeg', [
    '-y',
    '-i', inputVideoPath,
    '-vf', `subtitles='${escapeSubtitlePath(srtPath)}':force_style='Fontname=Arial,Fontsize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.7,Shadow=0.5,Alignment=2,MarginL=110,MarginR=110,MarginV=38'`,
    '-c:v', 'libx264',
    '-preset', VIDEO_PRESET,
    '-crf', FINAL_VIDEO_CRF,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputVideoPath,
  ]);
}

async function addOpenAiSubtitles(inputVideoPath: string, outputVideoPath: string, workDir: string, basename: string, captionAudioSourcePath?: string) {
  const captionAudio = path.join(workDir, `${basename}-caption-audio.mp3`);
  const srtPath = path.join(workDir, `${basename}.srt`);
  if (captionAudioSourcePath) {
    await writeFile(captionAudio, await readFile(captionAudioSourcePath));
  } else {
    await extractCaptionAudio(inputVideoPath, captionAudio);
  }
  const srtText = await transcribeToSrt(captionAudio, srtPath);
  await burnSubtitles(inputVideoPath, srtPath, outputVideoPath);
  let clipTitle = '';
  try {
    clipTitle = await suggestClipTitleFromTranscript(srtText);
  } catch (error) {
    console.warn('[marketing-audio-sync:filename]', error instanceof Error ? error.message : error);
  }
  return { srtText, clipTitle };
}

async function detectOfficialAudioOffset(fullWav: string, videoWav: string) {
  const script = path.join(os.tmpdir(), `podkash-align-${randomUUID()}.py`);
  await writeFile(script, String.raw`
import json, math, sys, wave

def envelope(path, chunk=400):
    with wave.open(path, 'rb') as w:
        n = w.getnframes()
        raw = w.readframes(n)
    vals = []
    for i in range(0, len(raw), chunk*2):
        block = raw[i:i+chunk*2]
        if not block: break
        total = 0
        count = 0
        for j in range(0, len(block)-1, 2):
            v = int.from_bytes(block[j:j+2], 'little', signed=True)
            total += abs(v)
            count += 1
        vals.append(total / max(count, 1))
    mean = sum(vals) / max(len(vals), 1)
    sd = math.sqrt(sum((v-mean)*(v-mean) for v in vals) / max(len(vals), 1)) or 1
    return [(v-mean)/sd for v in vals]

full = envelope(sys.argv[1])
clip = envelope(sys.argv[2])
if len(clip) < 80 or len(full) <= len(clip):
    raise SystemExit('audio too short for alignment')
anchor_len = min(max(120, len(clip)//2), 600)
anchor_start = max(0, (len(clip)-anchor_len)//2)
anchor = clip[anchor_start:anchor_start+anchor_len]
anchor_energy = math.sqrt(sum(v*v for v in anchor)) or 1
best_score = -999
best_i = 0
step = 1
limit = len(full) - anchor_len
for i in range(0, limit, step):
    window = full[i:i+anchor_len]
    energy = math.sqrt(sum(v*v for v in window)) or 1
    score = sum(a*b for a,b in zip(anchor, window)) / (anchor_energy * energy)
    if score > best_score:
        best_score = score
        best_i = i
seconds_per_frame = 0.05
print(json.dumps({"offsetSeconds": (best_i - anchor_start) * seconds_per_frame, "confidence": best_score}))
`);
  try {
    const out = await capture('python3', [script, fullWav, videoWav]);
    const json = JSON.parse(out || '{}') as { offsetSeconds?: number; confidence?: number };
    if (!Number.isFinite(json.offsetSeconds) || (json.confidence || 0) < 0.35) throw new Error(`ביטחון סנכרון נמוך (${Number(json.confidence || 0).toFixed(2)})`);
    return { offsetSeconds: Math.max(0, Number(json.offsetSeconds)), confidence: Number(json.confidence || 0) };
  } finally {
    await rm(script, { force: true }).catch(() => undefined);
  }
}

async function prepareSingleVideoSubtitles(options: { tokens: DriveTokens; jobId: string; file: DriveFile; audioFile: DriveFile; outputFolderId: string; workDir: string }) {
  const { tokens, jobId, file, audioFile, outputFolderId, workDir } = options;
  await updateItem(jobId, file.id, { status: 'running', message: 'מוריד ומסנכרן…' });
  const videoPath = path.join(workDir, safeName(file.name));
  const audioPath = path.join(workDir, safeName(audioFile.name));
  const videoWav = path.join(workDir, `${file.id}.wav`);
  const fullWav = path.join(workDir, `${audioFile.id}.wav`);
  const syncedPath = path.join(workDir, `${file.id}-synced.mp4`);
  const captionAudioPath = path.join(workDir, `${file.id}-official-caption-audio.mp3`);
  const srtPath = path.join(workDir, `${file.id}.srt`);

  await downloadDriveFile(tokens, file, videoPath);
  await downloadDriveFile(tokens, audioFile, audioPath);
  await extractWave(videoPath, videoWav);
  await extractWave(audioPath, fullWav);
  const duration = await durationSeconds(videoPath);
  const alignment = await detectOfficialAudioOffset(fullWav, videoWav);
  // Re-encode and reset timestamps instead of copying the camera video stream.
  // Several phone/camera files carry non-zero or irregular PTS; stream-copying them
  // can look fine in isolation but drift after Drive preview/transcode or concat.
  await run('ffmpeg', [
    '-y',
    '-fflags', '+genpts',
    '-i', videoPath,
    '-ss', alignment.offsetSeconds.toFixed(3),
    '-t', duration.toFixed(3),
    '-i', audioPath,
    '-filter_complex', '[0:v:0]setpts=PTS-STARTPTS[v];[1:a:0]asetpts=PTS-STARTPTS[a]',
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', VIDEO_PRESET,
    '-crf', INTERMEDIATE_VIDEO_CRF,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    syncedPath,
  ]);
  await extractOfficialCaptionAudio(audioPath, captionAudioPath, alignment.offsetSeconds, duration);
  await updateItem(jobId, file.id, { message: 'מתמלל מהאודיו הרשמי — ממתין לעריכת כתוביות לפני רינדור…' });
  const srtText = await transcribeToSrt(captionAudioPath, srtPath);
  const subtitleSegments = parseSrtSegments(srtText);
  const previewFolder = await ensureGoogleDriveFolder(tokens, 'קטעי שמע לבדיקת כתוביות', outputFolderId);
  for (const segment of subtitleSegments) {
    try {
      const previewPath = path.join(workDir, `${file.id}-${segment.index}.mp3`);
      await extractPreviewAudio(captionAudioPath, previewPath, segment.startMs, segment.endMs);
      const uploadedPreview = await uploadDriveFile(tokens, previewFolder.id, previewPath, `${safeName(path.basename(file.name, path.extname(file.name)))} - משפט ${segment.index}.mp3`, 'audio/mpeg');
      segment.previewAudioUrl = uploadedPreview.id ? `https://drive.google.com/uc?export=download&id=${uploadedPreview.id}` : uploadedPreview.webViewLink;
    } catch (error) {
      console.warn('[marketing-audio-sync:preview-audio]', error instanceof Error ? error.message : error);
    }
  }
  await updateItem(jobId, file.id, {
    status: 'needs_subtitle_review',
    message: `התמלול מוכן לבדיקה (${subtitleSegments.length} משפטים/שורות כתובית)`,
    detectedOffsetSeconds: alignment.offsetSeconds,
    durationSeconds: duration,
    subtitleSegments,
  });
}

async function renderSingleVideo(options: { tokens: DriveTokens; jobId: string; file: DriveFile; audioFile: DriveFile; outputFolderId: string; workDir: string; guestName?: string; item: MarketingAudioSyncJob['items'][number] }) {
  const { tokens, jobId, file, audioFile, outputFolderId, workDir, guestName, item } = options;
  await updateItem(jobId, file.id, { status: 'rendering', message: 'מרנדר עם הכתוביות המאושרות ומעלה ל־Drive…' });
  const videoPath = path.join(workDir, safeName(file.name));
  const audioPath = path.join(workDir, safeName(audioFile.name));
  const syncedPath = path.join(workDir, `${file.id}-synced.mp4`);
  const srtPath = path.join(workDir, `${file.id}-edited.srt`);
  const outPath = path.join(workDir, outputName(file.name));

  await downloadDriveFile(tokens, file, videoPath);
  await downloadDriveFile(tokens, audioFile, audioPath);
  const duration = item.durationSeconds || await durationSeconds(videoPath);
  const offsetSeconds = item.detectedOffsetSeconds;
  if (!Number.isFinite(offsetSeconds)) throw new Error('חסר offset סנכרון — צריך להריץ תמלול מחדש');
  await run('ffmpeg', [
    '-y',
    '-fflags', '+genpts',
    '-i', videoPath,
    '-ss', Number(offsetSeconds).toFixed(3),
    '-t', duration.toFixed(3),
    '-i', audioPath,
    '-filter_complex', '[0:v:0]setpts=PTS-STARTPTS[v];[1:a:0]asetpts=PTS-STARTPTS[a]',
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', VIDEO_PRESET,
    '-crf', INTERMEDIATE_VIDEO_CRF,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    syncedPath,
  ]);
  const editedSrt = segmentsToSrt(item.subtitleSegments || []);
  await writeFile(srtPath, editedSrt);
  await burnSubtitles(syncedPath, srtPath, outPath);
  let clipTitle = '';
  try {
    clipTitle = await suggestClipTitleFromTranscript(editedSrt);
  } catch (error) {
    console.warn('[marketing-audio-sync:filename]', error instanceof Error ? error.message : error);
  }
  const finalName = namedOutputName(guestName, clipTitle, file.name);
  const uploaded = await uploadDriveFile(tokens, outputFolderId, outPath, finalName);
  await updateItem(jobId, file.id, {
    status: 'completed',
    message: `סונכרן בהצלחה עם כתוביות שאושרו ידנית (offset ${Number(offsetSeconds).toFixed(2)} שנ׳)`,
    outputFileName: uploaded.name,
    outputFileUrl: uploaded.webViewLink,
  });
}

function pickAudioFile(files: DriveFile[]) {
  return files.find(file => AUDIO_RE.test(file.name) || (file.mimeType || '').startsWith('audio/')) || null;
}

function videoFiles(files: DriveFile[]) {
  return files.filter(file => !isGeneratedMarketingVideo(file.name) && (VIDEO_RE.test(file.name) || (file.mimeType || '').startsWith('video/')));
}

function isGeneratedMarketingVideo(name: string) {
  return /מיטב הרגעים|כל סרטוני השיווק|עם סאונד רשמי|עם סאונד וכתוביות|סאונד רשמי וכתוביות/i.test(name);
}

export async function enqueueMarketingAudioSync(episodeId: number) {
  const store = await readStore();
  const episode = store.episodes.find(ep => ep.id === episodeId);
  if (!episode) throw new Error('הפרק לא נמצא');
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const job: MarketingAudioSyncJob = { id: jobId, episodeId, episodeTitle: episode.title, status: 'queued', createdAt: now, unread: false, items: [] };
  await writeStore({ ...store, marketingAudioSyncJobs: [job, ...(store.marketingAudioSyncJobs || []).slice(0, 19)] });
  if (!process.env.VERCEL) {
    runMarketingAudioSync(jobId).catch(error => console.error('[marketing-audio-sync]', error));
  }
  return job;
}

export async function runMarketingAudioSync(jobId: string) {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  const workDir = path.join(os.tmpdir(), `podkash-audio-sync-${jobId}`);
  try {
    await mkdir(workDir, { recursive: true });
    await updateJob(jobId, { status: 'running', startedAt: new Date().toISOString() });
    const rawTokens = await readGoogleDriveTokens();
    if (!rawTokens) throw new Error('Google Drive לא מחובר');
    const { tokens } = await refreshGoogleDriveTokensIfNeeded(rawTokens);

    const beforeSyncStore = await readStore();
    const beforeSyncJob = beforeSyncStore.marketingAudioSyncJobs?.find(j => j.id === jobId);
    if (!beforeSyncJob) throw new Error('המשימה לא נמצאה');
    await syncGoogleDriveEpisodes({ episodeId: beforeSyncJob.episodeId });
    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(j => j.id === jobId);
    if (!job) throw new Error('המשימה לא נמצאה');
    const episode = store.episodes.find(ep => ep.id === job.episodeId) as Episode | undefined;
    if (!episode) throw new Error('הפרק לא נמצא');

    const marketingFolderId = folderIdFromUrl(episode.driveMarketingFolderUrl || episode.shortsDriveFolderUrl);
    const audioFolderId = folderIdFromUrl(episode.fullAudioFolderUrl);
    if (!marketingFolderId) throw new Error('חסרה תיקיית סרטוני שיווק בדרייב');
    if (!audioFolderId) throw new Error('חסרה תיקיית קובץ שמע מלא בדרייב');

    const [marketing, audio] = await Promise.all([
      listGoogleDriveFolderFiles(tokens, marketingFolderId),
      listGoogleDriveFolderFiles(tokens, audioFolderId),
    ]);
    const videos = videoFiles(marketing);
    const audioFile = pickAudioFile(audio);
    if (!videos.length) throw new Error('לא נמצאו סרטונים בתיקיית סרטוני השיווק');
    if (!audioFile) throw new Error('לא נמצא קובץ אודיו בתיקיית קובץ שמע מלא');

    const outputFolder = await ensureGoogleDriveFolder(tokens, OUTPUT_FOLDER_NAME, marketingFolderId);
    await updateJob(jobId, {
      outputFolderUrl: outputFolder.webViewLink,
      items: videos.map(file => ({ fileId: file.id, fileName: file.name, status: 'pending' })),
    });

    for (const file of videos) {
      try {
        await prepareSingleVideoSubtitles({ tokens, jobId, file, audioFile, outputFolderId: outputFolder.id, workDir });
      } catch (error) {
        await updateItem(jobId, file.id, { status: 'failed', message: error instanceof Error ? error.message : 'שגיאה לא ידועה' });
      }
    }

    const reviewStore = await readStore();
    const reviewJob = reviewStore.marketingAudioSyncJobs?.find(j => j.id === jobId);
    if (!reviewJob) throw new Error('המשימה לא נמצאה בסיום התמלול');
    const readyForReview = reviewJob.items.filter(item => item.status === 'needs_subtitle_review');
    const failed = reviewJob.items.some(item => item.status === 'failed');
    if (readyForReview.length) {
      const totalSegments = readyForReview.reduce((sum, item) => sum + (item.subtitleSegments?.length || 0), 0);
      const summaryHebrew = `התמלול לפרק “${reviewJob.episodeTitle}” מוכן לבדיקה.\nצריך לדייק כתוביות עבור ${readyForReview.length} סרטונים (${totalSegments} משפטים/שורות כתובית).\nאחרי אישור הכתוביות המערכת תמשיך אוטומטית לרינדור, העלאה ל־Drive ושאר התהליך.`;
      await updateJob(jobId, { status: 'needs_subtitle_review', summaryHebrew, unread: true });
    } else {
      const summary = summarize(reviewJob);
      await updateJob(jobId, { status: failed ? 'failed' : 'completed', finishedAt: new Date().toISOString(), summaryHebrew: summary, unread: true });
    }
  } catch (error) {
    const current = (await readStore()).marketingAudioSyncJobs?.find(job => job.id === jobId);
    const next: MarketingAudioSyncJob = current || { id: jobId, episodeId: 0, episodeTitle: 'פרק', status: 'failed', createdAt: new Date().toISOString(), items: [] };
    const summaryHebrew = `סנכרון סאונד וכתוביות נכשל עבור “${next.episodeTitle}”.\nסיבה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`;
    await updateJob(jobId, { status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'שגיאה לא ידועה', summaryHebrew, unread: true });
  } finally {
    activeJobs.delete(jobId);
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function updateMarketingAudioSyncSubtitles(jobId: string, items: Array<{ fileId?: string; subtitleSegments?: MarketingSubtitleSegment[] }>) {
  const store = await readStore();
  const jobs = (store.marketingAudioSyncJobs || []).map(job => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      items: job.items.map(item => {
        const next = items.find(candidate => candidate.fileId === item.fileId);
        if (!next || !Array.isArray(next.subtitleSegments)) return item;
        return {
          ...item,
          subtitleSegments: next.subtitleSegments.map((segment, index) => ({
            ...segment,
            id: segment.id || `seg_${index + 1}`,
            index: index + 1,
            text: String(segment.text || '').trim(),
          })),
        };
      }),
    };
  });
  await writeStore({ ...store, marketingAudioSyncJobs: jobs });
}

export async function continueMarketingAudioSyncAfterSubtitleReview(jobId: string) {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  const workDir = path.join(os.tmpdir(), `podkash-audio-sync-render-${jobId}`);
  try {
    await mkdir(workDir, { recursive: true });
    await updateJob(jobId, { status: 'rendering', reviewedAt: new Date().toISOString(), renderingStartedAt: new Date().toISOString(), unread: false });
    const rawTokens = await readGoogleDriveTokens();
    if (!rawTokens) throw new Error('Google Drive לא מחובר');
    const { tokens } = await refreshGoogleDriveTokensIfNeeded(rawTokens);

    const store = await readStore();
    const job = store.marketingAudioSyncJobs?.find(j => j.id === jobId);
    if (!job) throw new Error('המשימה לא נמצאה');
    const episode = store.episodes.find(ep => ep.id === job.episodeId) as Episode | undefined;
    if (!episode) throw new Error('הפרק לא נמצא');

    const marketingFolderId = folderIdFromUrl(episode.driveMarketingFolderUrl || episode.shortsDriveFolderUrl);
    const audioFolderId = folderIdFromUrl(episode.fullAudioFolderUrl);
    if (!marketingFolderId) throw new Error('חסרה תיקיית סרטוני שיווק בדרייב');
    if (!audioFolderId) throw new Error('חסרה תיקיית קובץ שמע מלא בדרייב');
    const [marketing, audio] = await Promise.all([
      listGoogleDriveFolderFiles(tokens, marketingFolderId),
      listGoogleDriveFolderFiles(tokens, audioFolderId),
    ]);
    const videos = videoFiles(marketing);
    const audioFile = pickAudioFile(audio);
    if (!audioFile) throw new Error('לא נמצא קובץ אודיו בתיקיית קובץ שמע מלא');
    const outputFolder = await ensureGoogleDriveFolder(tokens, OUTPUT_FOLDER_NAME, marketingFolderId);

    for (const item of job.items.filter(item => item.status === 'needs_subtitle_review' || item.status === 'rendering')) {
      const file = videos.find(video => video.id === item.fileId);
      if (!file) {
        await updateItem(jobId, item.fileId, { status: 'failed', message: 'סרטון המקור לא נמצא יותר בתיקיית השיווק' });
        continue;
      }
      try {
        await renderSingleVideo({ tokens, jobId, file, audioFile, outputFolderId: outputFolder.id, workDir, guestName: episode.guests, item });
      } catch (error) {
        await updateItem(jobId, item.fileId, { status: 'failed', message: error instanceof Error ? error.message : 'שגיאה לא ידועה' });
      }
    }

    const finalStore = await readStore();
    const finalJob = finalStore.marketingAudioSyncJobs?.find(j => j.id === jobId);
    if (!finalJob) throw new Error('המשימה לא נמצאה בסיום');
    const failed = finalJob.items.some(item => item.status === 'failed');
    const summary = summarize(finalJob);
    await updateJob(jobId, { status: failed ? 'failed' : 'completed', finishedAt: new Date().toISOString(), outputFolderUrl: outputFolder.webViewLink, summaryHebrew: summary, unread: true });
  } catch (error) {
    const current = (await readStore()).marketingAudioSyncJobs?.find(job => job.id === jobId);
    const next: MarketingAudioSyncJob = current || { id: jobId, episodeId: 0, episodeTitle: 'פרק', status: 'failed', createdAt: new Date().toISOString(), items: [] };
    const summaryHebrew = `המשך סנכרון סאונד וכתוביות נכשל עבור “${next.episodeTitle}”.\nסיבה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`;
    await updateJob(jobId, { status: 'failed', finishedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'שגיאה לא ידועה', summaryHebrew, unread: true });
  } finally {
    activeJobs.delete(jobId);
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function markMarketingAudioSyncRead(jobId: string) {
  const store = await readStore();
  const jobs = (store.marketingAudioSyncJobs || []).map(job => job.id === jobId ? { ...job, unread: false } : job);
  await writeStore({ ...store, marketingAudioSyncJobs: jobs });
}
