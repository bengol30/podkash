#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

process.loadEnvFile?.('.env.local');
process.loadEnvFile?.('.env.production.local');

const BASE_URL = process.env.PODKASH_BASE_URL || 'https://podkash.vercel.app';
const PASSWORD = process.env.PODKASH_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error('Missing PODKASH_ADMIN_PASSWORD or ADMIN_PASSWORD');
const jobIdArg = process.argv[2];
const FORCE_STRICT_REBUILD = process.env.FORCE_STRICT_REBUILD === '1' || process.argv.includes('--strict-rebuild');
const INTERMEDIATE_VIDEO_CRF = process.env.PODKASH_INTERMEDIATE_VIDEO_CRF || '16';
const FINAL_VIDEO_CRF = process.env.PODKASH_FINAL_VIDEO_CRF || '18';
const COMBINED_VIDEO_CRF = process.env.PODKASH_COMBINED_VIDEO_CRF || '18';
const VIDEO_PRESET = process.env.PODKASH_VIDEO_PRESET || 'medium';
const KEEP_ORIGINALS = process.env.PODKASH_KEEP_ORIGINALS === '1' || process.argv.includes('--keep-originals');
const VIDEO_LIMIT = Number(process.env.PODKASH_VIDEO_LIMIT || 0);
const SKIP_COMBINED = process.env.PODKASH_SKIP_COMBINED === '1' || process.argv.includes('--skip-combined');
const cookieJar = new Map();

function cookieHeader() { return [...cookieJar.entries()].map(([k,v]) => `${k}=${v}`).join('; '); }
function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const line of raw) {
    const [pair] = line.split(';');
    const [k,v] = pair.split('=');
    if (k && v) cookieJar.set(k, v);
  }
}
async function api(pathname, init = {}) {
  const headers = { ...(init.headers || {}) };
  const cookies = cookieHeader();
  if (cookies) headers.cookie = cookies;
  const res = await fetch(`${BASE_URL}${pathname}`, { ...init, headers });
  saveCookies(res);
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || json.ok === false) throw new Error(json.error || json.message || `API ${pathname} failed (${res.status})`);
  return json;
}
async function login() {
  await api('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
}
async function getStore() { return await api('/api/store'); }
async function putStore(store) { return await api('/api/store', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(store) }); }
async function patchJob(jobId, patch) {
  const store = await getStore();
  store.marketingAudioSyncJobs = (store.marketingAudioSyncJobs || []).map(job => job.id === jobId ? { ...job, ...patch } : job);
  await putStore(store);
}
async function patchItem(jobId, fileId, patch) {
  const store = await getStore();
  store.marketingAudioSyncJobs = (store.marketingAudioSyncJobs || []).map(job => job.id === jobId ? { ...job, items: (job.items || []).map(item => item.fileId === fileId ? { ...item, ...patch } : item) } : job);
  await putStore(store);
}
function safeName(value) { return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'video'; }
function outputName(input) { return `${safeName(path.basename(input, path.extname(input) || '.mp4'))} - עם סאונד רשמי וכתוביות.mp4`; }
function compactGuestName(value = '') {
  const first = String(value).split(/[,،|/]+/)[0]?.replace(/\([^)]*\)/g, '').trim();
  return safeName(first || 'מרואיין').slice(0, 45);
}
function normalizeClipWords(value = '') {
  return String(value).replace(/[`"“”'׳״]/g, '').replace(/[\\/:*?<>|]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 4).join(' ');
}
function namedOutputName(guestName, clipTitle, fallbackInput) {
  const guest = compactGuestName(guestName);
  const title = normalizeClipWords(clipTitle) || safeName(path.basename(fallbackInput, path.extname(fallbackInput) || '.mp4')).split(' ').slice(0, 4).join(' ');
  return `${guest} - ${safeName(title)}.mp4`;
}
function isGeneratedMarketingVideo(name = '') {
  return /מיטב הרגעים|כל סרטוני השיווק|עם סאונד רשמי|עם סאונד וכתוביות|סאונד רשמי וכתוביות/i.test(String(name));
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr || 'no stderr'}`)));
  });
}
function capture(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} exited ${code}: ${stderr || 'no stderr'}`)));
  });
}
async function durationSeconds(filePath) {
  const out = await capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath]);
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) throw new Error('לא הצלחתי לזהות אורך קובץ');
  return n;
}
async function downloadDriveFile(accessToken, file, targetPath) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`הורדת ${file.name} נכשלה (${res.status})`);
  await writeFile(targetPath, Buffer.from(await res.arrayBuffer()));
}
async function uploadDriveFile(accessToken, folderId, filePath, name) {
  const st = await stat(filePath);
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(st.size) },
    body: JSON.stringify({ name, parents: [folderId], mimeType: 'video/mp4' }),
  });
  if (!start.ok) throw new Error(`פתיחת העלאת ${name} נכשלה (${start.status})`);
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive לא החזיר כתובת העלאה');
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(st.size) }, body: createReadStream(filePath), duplex: 'half' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `העלאת ${name} נכשלה (${res.status})`);
  return json;
}

function driveFileIdFromUrl(url = '') {
  return url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
}
async function trashDriveFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) throw new Error(`מחיקת קובץ מדרייב נכשלה (${res.status})`);
}
async function untrashDriveFile(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: false }),
  });
  if (!res.ok) throw new Error(`שחזור קובץ מקור מדרייב נכשל (${res.status})`);
}
async function meanVolumeDb(filePath) {
  return await new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('close', () => {
      const db = Number(stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1]);
      resolve(Number.isFinite(db) ? db : -30);
    });
    child.on('error', () => resolve(-30));
  });
}
async function extractCaptionAudio(input, output) {
  await run('ffmpeg', ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '96k', output]);
}
async function extractOfficialCaptionAudio(input, output, offsetSeconds, duration) {
  await run('ffmpeg', ['-y', '-ss', offsetSeconds.toFixed(3), '-t', duration.toFixed(3), '-i', input, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '128k', output]);
}
function escapeSubtitlePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}
async function transcribeToSrt(inputAudioPath, outputSrtPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('חסר OPENAI_API_KEY ליצירת כתוביות');
  const bytes = await readFile(inputAudioPath);
  const prompt = 'תמלול עברית מדויק לפודקאסט/ראיון. שמור שמות, מונחים מקצועיים, מספרים וסלנג ישראלי בצורה טבעית.';

  async function request(model) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(inputAudioPath));
    form.append('model', model);
    form.append('response_format', 'srt');
    form.append('language', 'he');
    form.append('prompt', prompt);
    return await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
  }

  let res = await request(process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe');
  if (!res.ok && (process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe') !== 'whisper-1') res = await request('whisper-1');
  const text = await res.text();
  if (!res.ok) throw new Error(`תמלול OpenAI נכשל (${res.status}): ${text.slice(0, 500)}`);
  if (!text.trim()) throw new Error('OpenAI החזיר תמלול ריק');
  const readable = formatSrtForReadableCaptions(text);
  await writeFile(outputSrtPath, readable);
  return readable;
}
function srtTimeToMs(value) {
  const match = String(value).match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}
function msToSrtTime(ms) {
  const safe = Math.max(0, Math.round(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const milli = safe % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}
function chunkCaptionWords(text) {
  const words = normalizeHebrewCaptionText(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks = [];
  let current = [];
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
function splitCaptionLine(text) {
  const words = String(text).split(' ').filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(' '));
  return lines.slice(0, 2).map(line => `‫${line}‬`).join('\n');
}
function normalizeHebrewCaptionText(text) {
  return String(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?=\S)/g, '$1 ')
    .replace(/(^|\s)([,.!?;:]+)(\S)/g, '$1$3$2')
    .replace(/\s+/g, ' ')
    .trim();
}
function formatSrtForReadableCaptions(srt) {
  const blocks = String(srt).replace(/\r/g, '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const output = [];
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
  return `${output.join('\n\n')}\n`;
}
async function suggestClipTitleFromTranscript(srtText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('חסר OPENAI_API_KEY ליצירת שם קובץ');
  const clean = String(srtText)
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
async function burnSubtitles(inputVideoPath, srtPath, outputVideoPath) {
  await run('ffmpeg', [
    '-y', '-i', inputVideoPath,
    '-vf', `subtitles='${escapeSubtitlePath(srtPath)}':force_style='Fontname=Arial,Fontsize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.7,Shadow=0.5,Alignment=2,MarginL=110,MarginR=110,MarginV=38'`,
    '-c:v', 'libx264', '-preset', VIDEO_PRESET, '-crf', FINAL_VIDEO_CRF, '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart', outputVideoPath,
  ]);
}
async function addOpenAiSubtitles(inputVideoPath, outputVideoPath, workDir, basename, captionAudioSourcePath) {
  const captionAudio = path.join(workDir, `${basename}-caption-audio.mp3`);
  const srtPath = path.join(workDir, `${basename}.srt`);
  if (captionAudioSourcePath) {
    await writeFile(captionAudio, await readFile(captionAudioSourcePath));
  } else if (SKIP_COMBINED) {
    const finalStore = await getStore();
    const finalJob = (finalStore.marketingAudioSyncJobs || []).find(j => j.id === job.id);
    const failed = (finalJob.items || []).some(i => i.status === 'failed');
    await patchJob(job.id, { status: failed ? 'failed' : 'completed', finishedAt: new Date().toISOString(), summaryHebrew: summarize(finalJob), unread: true });
  } else {
    await extractCaptionAudio(inputVideoPath, captionAudio);
  }
  const srtText = await transcribeToSrt(captionAudio, srtPath);
  await burnSubtitles(inputVideoPath, srtPath, outputVideoPath);
  let clipTitle = '';
  try {
    clipTitle = await suggestClipTitleFromTranscript(srtText);
  } catch (error) {
    console.warn(`[marketing-audio-sync:filename] ${error instanceof Error ? error.message : error}`);
  }
  return { srtText, clipTitle };
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function seededRandom(seed) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}
function chooseSegment({ duration, meanDb, seed }) {
  const loudnessFactor = clamp((meanDb + 35) / 30, 0, 1); // -35dB quiet, -5dB loud
  const durationFactor = clamp(duration / 90, 0, 1);
  const randomFactor = seededRandom(`${seed}:length`);
  const wanted = 8 + loudnessFactor * 10 + durationFactor * 8 + randomFactor * 4;
  const length = clamp(Math.min(wanted, Math.max(1, duration - 0.5)), Math.min(8, duration), Math.min(30, duration));
  const maxStart = Math.max(0, duration - length - 0.25);
  const start = maxStart * seededRandom(`${seed}:start`);
  return { start, length, meanDb };
}
async function createCombinedVideo({ accessToken, job, ctx, workDir }) {
  const store = await getStore();
  const freshJob = (store.marketingAudioSyncJobs || []).find(j => j.id === job.id) || job;
  const completed = (freshJob.items || []).filter(item => item.status === 'completed' && item.outputFileUrl);
  if (!completed.length) throw new Error('אין סרטונים מסונכרנים לבניית סרטון מאוחד');

  const segmentPaths = [];
  for (let index = 0; index < completed.length; index += 1) {
    const item = completed[index];
    const outputId = driveFileIdFromUrl(item.outputFileUrl);
    if (!outputId) continue;
    const inputPath = path.join(workDir, `combined-source-${index}.mp4`);
    const segmentPath = path.join(workDir, `combined-segment-${String(index).padStart(2, '0')}.mp4`);
    await downloadDriveFile(accessToken, { id: outputId, name: item.outputFileName || item.fileName }, inputPath);
    const duration = await durationSeconds(inputPath);
    const meanDb = await meanVolumeDb(inputPath);
    const segment = chooseSegment({ duration, meanDb, seed: `${job.id}:${item.fileId}:${item.fileName}` });
    await run('ffmpeg', [
      '-y', '-ss', segment.start.toFixed(3), '-t', segment.length.toFixed(3), '-i', inputPath,
      '-vf', 'setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
      '-af', 'asetpts=PTS-STARTPTS',
      '-c:v', 'libx264', '-preset', VIDEO_PRESET, '-crf', COMBINED_VIDEO_CRF, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', segmentPath,
    ]);
    segmentPaths.push(segmentPath);
  }
  if (!segmentPaths.length) throw new Error('לא נוצרו מקטעים לסרטון המאוחד');
  const concatList = path.join(workDir, 'combined-list.txt');
  await writeFile(concatList, segmentPaths.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));
  const combinedPath = path.join(workDir, 'combined-marketing-video.mp4');
  await run('ffmpeg', [
    '-y', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-vf', 'setpts=PTS-STARTPTS,fps=30', '-af', 'asetpts=PTS-STARTPTS',
    '-c:v', 'libx264', '-preset', VIDEO_PRESET, '-crf', COMBINED_VIDEO_CRF, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', combinedPath,
  ]);
  const combinedName = `${compactGuestName(ctx.episode?.guests)} - מיטב הרגעים.mp4`;
  const uploaded = await uploadDriveFile(accessToken, ctx.marketingFolderId, combinedPath, combinedName);
  await patchJob(job.id, { combinedVideoUrl: uploaded.webViewLink, combinedVideoName: uploaded.name });
  return uploaded;
}
async function trashCompletedOriginals({ accessToken, job }) {
  if (KEEP_ORIGINALS) return;
  const store = await getStore();
  const freshJob = (store.marketingAudioSyncJobs || []).find(j => j.id === job.id) || job;
  for (const item of freshJob.items || []) {
    if (item.status !== 'completed' || !item.fileId || item.originalRemovedAt) continue;
    await trashDriveFile(accessToken, item.fileId);
    await patchItem(job.id, item.fileId, { originalRemovedAt: new Date().toISOString() });
  }
}

async function extractWave(input, output) {
  await run('ffmpeg', ['-y', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-acodec', 'pcm_s16le', output]);
}
async function detectOffset(fullWav, videoWav) {
  const script = path.join(os.tmpdir(), `podkash-align-${crypto.randomUUID()}.py`);
  await writeFile(script, String.raw`
import json, math, sys, wave

def envelope(path, chunk=400):
    with wave.open(path, 'rb') as w:
        raw = w.readframes(w.getnframes())
    vals=[]
    for i in range(0,len(raw),chunk*2):
        block=raw[i:i+chunk*2]
        total=count=0
        for j in range(0,len(block)-1,2):
            total += abs(int.from_bytes(block[j:j+2],'little',signed=True)); count += 1
        vals.append(total/max(count,1))
    # light smoothing: camera audio and mastered audio have different dynamics
    if len(vals) >= 5:
        vals=[sum(vals[max(0,i-2):min(len(vals),i+3)])/len(vals[max(0,i-2):min(len(vals),i+3)]) for i in range(len(vals))]
    mean=sum(vals)/max(len(vals),1); sd=math.sqrt(sum((v-mean)*(v-mean) for v in vals)/max(len(vals),1)) or 1
    return [(v-mean)/sd for v in vals]

def corr(a,b):
    ae=math.sqrt(sum(x*x for x in a)) or 1
    be=math.sqrt(sum(x*x for x in b)) or 1
    return sum(x*y for x,y in zip(a,b))/(ae*be)

def best_global(full, anchor, min_gap):
    results=[]; limit=len(full)-len(anchor)
    if limit <= 0: return []
    for i in range(0, limit):
        score=corr(anchor, full[i:i+len(anchor)])
        # keep several separated candidates
        if all(abs(i-j) > min_gap for _,j in results):
            results.append((score,i)); results.sort(reverse=True); results=results[:8]
        elif results and score > results[-1][0]:
            # replace a nearby weaker candidate if relevant
            for idx,(_,j) in enumerate(results):
                if abs(i-j) <= min_gap and score > results[idx][0]:
                    results[idx]=(score,i); results.sort(reverse=True); results=results[:8]; break
    return results

def best_local(full, anchor, expected, radius):
    lo=max(0, int(expected-radius)); hi=min(len(full)-len(anchor), int(expected+radius))
    if hi <= lo: return None
    best=(-999, lo)
    for i in range(lo, hi+1):
        score=corr(anchor, full[i:i+len(anchor)])
        if score > best[0]: best=(score,i)
    return best

full=envelope(sys.argv[1]); clip=envelope(sys.argv[2])
if len(clip)<80 or len(full)<=len(clip): raise SystemExit('audio too short for reliable alignment')
spf=0.05
# Use shorter anchors so noisy phone/camera audio still matches mastered audio.
anchor_len=min(180, max(80, len(clip)//6))  # 4-9 seconds
fractions=[0.12,0.28,0.44,0.60,0.76,0.88]
anchors=[]
for frac in fractions:
    start=int((len(clip)-anchor_len)*frac)
    if start >= 0 and start + anchor_len <= len(clip): anchors.append(start)
if len(anchors) < 2: raise SystemExit('not enough anchors for reliable alignment')

# Step 1: generate offset candidates from several anchors.
candidates=[]; raw=[]
for start in anchors:
    anchor=clip[start:start+anchor_len]
    matches=best_global(full, anchor, anchor_len*2)
    if not matches: continue
    best_score,best_i=matches[0]
    second=matches[1][0] if len(matches)>1 else -1
    offset=best_i-start
    raw.append({'anchorStart': start*spf, 'bestScore': best_score, 'secondScore': second, 'offsetSeconds': offset*spf})
    # include top candidates, weighted later by local consistency
    for score,i in matches[:4]:
        if score >= 0.32:
            candidates.append({'offset': i-start, 'score': score, 'anchorStart': start})
if not candidates:
    print(json.dumps({'ok': False, 'reason': 'no candidate offsets', 'raw': raw})); raise SystemExit(0)

# Cluster candidate offsets. This allows repeated words/noise, but rewards the offset supported by multiple anchors.
clusters=[]
for c in sorted(candidates, key=lambda x: -x['score']):
    placed=False
    for cl in clusters:
        center=sum(x['offset']*x['score'] for x in cl)/sum(x['score'] for x in cl)
        if abs(c['offset']-center) <= 50: # 2.5 sec tolerance
            cl.append(c); placed=True; break
    if not placed: clusters.append([c])
clusters.sort(key=lambda cl: (len(set(round(x['anchorStart']/max(anchor_len,1),2) for x in cl)), sum(x['score'] for x in cl)), reverse=True)

best_result=None
for cl in clusters[:5]:
    candidate_offset=sum(x['offset']*x['score'] for x in cl)/sum(x['score'] for x in cl)
    # Step 2: verify locally around the candidate. We no longer require global second-best separation;
    # we require that many anchors re-lock near the expected position with low drift.
    ver=[]
    for start in anchors:
        anchor=clip[start:start+anchor_len]
        local=best_local(full, anchor, candidate_offset+start, radius=60) # +/-3 sec
        if not local: continue
        score,i=local
        ver.append({'anchorStart': start*spf, 'score': score, 'offset': i-start, 'driftSeconds': (i-start-candidate_offset)*spf})
    good=[v for v in ver if v['score'] >= 0.40 and abs(v['driftSeconds']) <= 1.6]
    if len(good) < 2: continue
    offsets=sorted(v['offset'] for v in good)
    median=offsets[len(offsets)//2]
    spread=max(abs(o-median) for o in offsets)*spf
    avg_score=sum(v['score'] for v in good)/len(good)
    # Practical pass: at least 3 anchors decent, OR 2 strong anchors with very low spread.
    ok=(len(good)>=3 and avg_score>=0.43 and spread<=1.75) or (len(good)>=2 and avg_score>=0.55 and spread<=0.9)
    result={'ok': ok, 'offsetSeconds': max(0, median*spf), 'confidence': avg_score, 'spreadSeconds': spread, 'validAnchors': len(good), 'candidateSupport': len(cl), 'verification': ver, 'raw': raw}
    if best_result is None or (result['ok'], result['validAnchors'], -result['spreadSeconds'], result['confidence']) > (best_result['ok'], best_result['validAnchors'], -best_result['spreadSeconds'], best_result['confidence']):
        best_result=result

if not best_result:
    print(json.dumps({'ok': False, 'reason': 'no locally consistent offset', 'raw': raw})); raise SystemExit(0)
print(json.dumps(best_result))
`);
  try {
    const json = JSON.parse(await capture('python3', [script, fullWav, videoWav]));
    if (!json.ok) {
      const reason = json.reason || `confidence ${Number(json.confidence || 0).toFixed(2)}, spread ${Number(json.spreadSeconds || 999).toFixed(2)}s, anchors ${json.validAnchors || 0}`;
      throw new Error(`לא אושר סנכרון מספיק בטוח (${reason})`);
    }
    return {
      offsetSeconds: Math.max(0, Number(json.offsetSeconds)),
      confidence: Number(json.confidence || 0),
      spreadSeconds: Number(json.spreadSeconds || 0),
      validAnchors: Number(json.validAnchors || 0),
      candidateSupport: Number(json.candidateSupport || 0),
    };
  } finally { await rm(script, { force: true }).catch(()=>{}); }
}

function summarize(job) {
  const done = (job.items || []).filter(i => i.status === 'completed');
  const failed = (job.items || []).filter(i => i.status === 'failed');
  const removed = done.filter(i => i.originalRemovedAt);
  const lines = [`סנכרון סאונד וכתוביות לפרק “${job.episodeTitle}” הסתיים.`, `הצליחו: ${done.length} · נכשלו: ${failed.length} · מקורות שהוסרו מתיקיית השיווק: ${removed.length}`];
  if (job.outputFolderUrl) lines.push(`תיקיית הסרטונים הערוכים: ${job.outputFolderUrl}`);
  if (job.combinedVideoUrl) lines.push(`הסרטון המאוחד בתיקיית השיווק: ${job.combinedVideoUrl}`);
  if (done.length) lines.push(`\nהצליחו:\n${done.map(i => `• ${i.fileName}${i.outputFileUrl ? ` → ${i.outputFileUrl}` : ''}`).join('\n')}`);
  if (failed.length) lines.push(`\nנכשלו:\n${failed.map(i => `• ${i.fileName}: ${i.message || 'שגיאה לא ידועה'}`).join('\n')}`);
  return lines.join('\n');
}
async function main() {
  await login();
  const store = await getStore();
  const jobs = store.marketingAudioSyncJobs || [];
  const job = jobIdArg ? jobs.find(j => j.id === jobIdArg) : jobs.find(j => ['queued','running'].includes(j.status));
  if (!job) throw new Error('No queued/running marketing audio sync job found');
  let ctx = await api(`/api/marketing-audio-sync/${job.id}/context`);
  ctx = { ...ctx, videos: ctx.videos.filter(v => !isGeneratedMarketingVideo(v.name)) };
  if (Number.isFinite(VIDEO_LIMIT) && VIDEO_LIMIT > 0) ctx = { ...ctx, videos: ctx.videos.slice(0, VIDEO_LIMIT) };
  if (FORCE_STRICT_REBUILD) {
    console.log('Strict rebuild: restoring originals and removing previous outputs before reprocessing');
    for (const item of job.items || []) {
      if (item.fileId) await untrashDriveFile(ctx.accessToken, item.fileId).catch(error => console.warn(`restore original failed ${item.fileName}: ${error.message}`));
      const outputId = driveFileIdFromUrl(item.outputFileUrl || '');
      if (outputId) await trashDriveFile(ctx.accessToken, outputId).catch(error => console.warn(`trash previous output failed ${item.fileName}: ${error.message}`));
    }
    const combinedId = driveFileIdFromUrl(job.combinedVideoUrl || '');
    if (combinedId) await trashDriveFile(ctx.accessToken, combinedId).catch(error => console.warn(`trash previous combined failed: ${error.message}`));
    await patchJob(job.id, { status: 'running', combinedVideoUrl: undefined, combinedVideoName: undefined, finishedAt: undefined, summaryHebrew: undefined, unread: false, items: (job.items || []).map(item => ({ fileId: item.fileId, fileName: item.fileName, status: 'pending' })) });
    ctx = await api(`/api/marketing-audio-sync/${job.id}/context`);
    ctx = { ...ctx, videos: ctx.videos.filter(v => !isGeneratedMarketingVideo(v.name)) };
    if (Number.isFinite(VIDEO_LIMIT) && VIDEO_LIMIT > 0) ctx = { ...ctx, videos: ctx.videos.slice(0, VIDEO_LIMIT) };
  }
  const workDir = path.join(os.tmpdir(), `podkash-audio-sync-${job.id}`);
  await mkdir(workDir, { recursive: true });
  const existingItems = new Map((job.items || []).map(item => [item.fileId, item]));
  const visibleIds = new Set(ctx.videos.map(v => v.id));
  const preservedItems = FORCE_STRICT_REBUILD ? [] : [...existingItems.values()].filter(item => !visibleIds.has(item.fileId));
  await patchJob(job.id, {
    status: 'running',
    startedAt: job.startedAt || new Date().toISOString(),
    outputFolderUrl: ctx.outputFolder.webViewLink,
    items: [
      ...ctx.videos.map(v => FORCE_STRICT_REBUILD ? ({ fileId: v.id, fileName: v.name, status: 'pending' }) : (existingItems.get(v.id) || ({ fileId: v.id, fileName: v.name, status: 'pending' }))),
      ...preservedItems,
    ],
  });
  const audioPath = path.join(workDir, safeName(ctx.audioFile.name));
  const fullWav = path.join(workDir, `${ctx.audioFile.id}.wav`);
  await downloadDriveFile(ctx.accessToken, ctx.audioFile, audioPath);
  await extractWave(audioPath, fullWav);
  for (const file of ctx.videos) {
    const latestStore = await getStore();
    const latestJob = (latestStore.marketingAudioSyncJobs || []).find(j => j.id === job.id) || job;
    const latestItem = (latestJob.items || []).find(item => item.fileId === file.id);
    if (!FORCE_STRICT_REBUILD && latestItem?.status === 'completed' && latestItem.outputFileUrl) continue;
    if (!FORCE_STRICT_REBUILD && ['failed','skipped'].includes(latestItem?.status)) continue;
    try {
      await patchItem(job.id, file.id, { status: 'running', message: 'מוריד ומסנכרן מקומית…' });
      const videoPath = path.join(workDir, safeName(file.name));
      const videoWav = path.join(workDir, `${file.id}.wav`);
      const syncedPath = path.join(workDir, `${file.id}-synced.mp4`);
      const captionAudioPath = path.join(workDir, `${file.id}-official-caption-audio.mp3`);
      const outPath = path.join(workDir, outputName(file.name));
      await downloadDriveFile(ctx.accessToken, file, videoPath);
      await extractWave(videoPath, videoWav);
      const duration = await durationSeconds(videoPath);
      const alignment = await detectOffset(fullWav, videoWav);
      await run('ffmpeg', [
        '-y','-fflags','+genpts','-i',videoPath,
        '-ss',alignment.offsetSeconds.toFixed(3),'-t',duration.toFixed(3),'-i',audioPath,
        '-filter_complex','[0:v:0]setpts=PTS-STARTPTS[v];[1:a:0]asetpts=PTS-STARTPTS[a]',
        '-map','[v]','-map','[a]',
        '-c:v','libx264','-preset',VIDEO_PRESET,'-crf',INTERMEDIATE_VIDEO_CRF,'-pix_fmt','yuv420p',
        '-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
        '-shortest','-avoid_negative_ts','make_zero','-movflags','+faststart',syncedPath,
      ]);
      await extractOfficialCaptionAudio(audioPath, captionAudioPath, alignment.offsetSeconds, duration);
      await patchItem(job.id, file.id, { message: 'מתמלל מהאודיו הרשמי, צורב כתוביות ובונה שם קובץ…' });
      const caption = await addOpenAiSubtitles(syncedPath, outPath, workDir, file.id, captionAudioPath);
      const finalName = namedOutputName(ctx.episode?.guests, caption.clipTitle, file.name);
      const uploaded = await uploadDriveFile(ctx.accessToken, ctx.outputFolder.id, outPath, finalName);
      await patchItem(job.id, file.id, { status: 'completed', message: `סונכרן בוודאות גבוהה ונוצרו כתוביות OpenAI (offset ${alignment.offsetSeconds.toFixed(2)} שנ׳, confidence ${alignment.confidence.toFixed(2)}, spread ${alignment.spreadSeconds.toFixed(2)} שנ׳, anchors ${alignment.validAnchors}, support ${alignment.candidateSupport})`, outputFileName: uploaded.name, outputFileUrl: uploaded.webViewLink, detectedOffsetSeconds: alignment.offsetSeconds });
    } catch (error) {
      await patchItem(job.id, file.id, { status: 'failed', message: error instanceof Error ? error.message : 'שגיאה לא ידועה' });
    }
  }
  const beforeCombineStore = await getStore();
  const beforeCombineJob = (beforeCombineStore.marketingAudioSyncJobs || []).find(j => j.id === job.id);
  const completedBeforeCombine = (beforeCombineJob?.items || []).filter(i => i.status === 'completed' && i.outputFileUrl);
  if (!completedBeforeCombine.length) {
    const summaryHebrew = `סנכרון סאונד וכתוביות לפרק “${job.episodeTitle}” הסתיים ללא סרטונים מאושרים.\nכל ${beforeCombineJob?.items?.length || 0} הסרטונים לא עברו בדיקת ודאות מחמירה, ולכן לא נוצרו סרטונים ערוכים ולא נוצר סרטון מאוחד. הסרטונים המקוריים נשארו בתיקיית השיווק.`;
    await patchJob(job.id, { status: 'failed', finishedAt: new Date().toISOString(), summaryHebrew, unread: true });
  } else if (SKIP_COMBINED) {
    const finalStore = await getStore();
    const finalJob = (finalStore.marketingAudioSyncJobs || []).find(j => j.id === job.id);
    const failed = (finalJob.items || []).some(i => i.status === 'failed');
    await patchJob(job.id, { status: failed ? 'failed' : 'completed', finishedAt: new Date().toISOString(), summaryHebrew: summarize(finalJob), unread: true });
  } else {
    const previousCombinedId = driveFileIdFromUrl(beforeCombineJob?.combinedVideoUrl || '');
    if (previousCombinedId) await trashDriveFile(ctx.accessToken, previousCombinedId).catch(error => console.warn(`trash previous combined failed: ${error.message}`));
    const combined = await createCombinedVideo({ accessToken: ctx.accessToken, job, ctx, workDir });
    await trashCompletedOriginals({ accessToken: ctx.accessToken, job });
    const finalStore = await getStore();
    const finalJob = (finalStore.marketingAudioSyncJobs || []).find(j => j.id === job.id);
    const failed = (finalJob.items || []).some(i => i.status === 'failed');
    const completeJob = { ...finalJob, combinedVideoUrl: combined.webViewLink, combinedVideoName: combined.name };
    await patchJob(job.id, { status: failed ? 'failed' : 'completed', finishedAt: new Date().toISOString(), combinedVideoUrl: combined.webViewLink, combinedVideoName: combined.name, summaryHebrew: summarize(completeJob), unread: true });
  }
  await rm(workDir, { recursive: true, force: true }).catch(()=>{});
  console.log(`Done: ${job.id}`);
}
main().catch(async error => {
  console.error(error);
  process.exit(1);
});
