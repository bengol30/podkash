#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

process.loadEnvFile?.('.env.local');
process.loadEnvFile?.('.env.production.local');

const BASE_URL = process.env.PODKASH_BASE_URL || 'https://podkash.vercel.app';
const PASSWORD = process.env.PODKASH_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const JOB_ID = process.argv[2];
if (!PASSWORD) throw new Error('Missing ADMIN_PASSWORD');
if (!JOB_ID) throw new Error('Usage: render-reviewed-marketing-audio-sync.mjs <jobId>');

const INTERMEDIATE_VIDEO_CRF = process.env.PODKASH_INTERMEDIATE_VIDEO_CRF || '16';
const FINAL_VIDEO_CRF = process.env.PODKASH_FINAL_VIDEO_CRF || '18';
const COMBINED_VIDEO_CRF = process.env.PODKASH_COMBINED_VIDEO_CRF || '18';
const VIDEO_PRESET = process.env.PODKASH_VIDEO_PRESET || 'medium';
const SUBTITLE_END_PADDING_MS = Number(process.env.PODKASH_SUBTITLE_END_PADDING_MS || '1200');
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'sqsxmvbqabftbmuyutlu';
process.env.SUPABASE_URL ||= `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const cookieJar = new Map();
function cookieHeader(){ return [...cookieJar.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
function saveCookies(res){ const raw=res.headers.getSetCookie?res.headers.getSetCookie():(res.headers.get('set-cookie')?[res.headers.get('set-cookie')]:[]); for(const line of raw){ const [pair]=line.split(';'); const [k,v]=pair.split('='); if(k&&v) cookieJar.set(k,v); } }
async function api(pathname, init={}){ const headers={...(init.headers||{})}; const cookies=cookieHeader(); if(cookies) headers.cookie=cookies; const res=await fetch(`${BASE_URL}${pathname}`,{...init,headers}); saveCookies(res); const text=await res.text(); const json=text?JSON.parse(text):{}; if(!res.ok || json.ok===false) throw new Error(json.error || json.message || `API ${pathname} failed ${res.status}`); return json; }
async function login(){ await api('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:PASSWORD})}); }
async function getServiceRoleKey(){
 if(process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
 const token=readFileSync(`${homedir()}/.supabase/access-token`,'utf8').trim();
 const res=await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys`,{headers:{authorization:`Bearer ${token}`}});
 if(!res.ok) throw new Error(`Supabase management API ${res.status}: ${await res.text()}`);
 const keys=await res.json(); const key=keys.find(k=>k.name==='service_role')?.api_key;
 if(!key) throw new Error('Missing Supabase service_role key');
 process.env.SUPABASE_SERVICE_ROLE_KEY=key;
 return key;
}
async function getStore(){
 const key=await getServiceRoleKey();
 const res=await fetch(`${process.env.SUPABASE_URL}/rest/v1/podkash_store?id=eq.default&select=data`,{headers:{apikey:key,authorization:`Bearer ${key}`},cache:'no-store'});
 if(!res.ok) throw new Error(`Supabase REST read ${res.status}: ${await res.text()}`);
 const rows=await res.json(); return rows[0]?.data;
}
async function putStore(store){
 const key=await getServiceRoleKey();
 const res=await fetch(`${process.env.SUPABASE_URL}/rest/v1/podkash_store`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'default',data:store,updated_at:new Date().toISOString()})});
 if(!res.ok) throw new Error(`Supabase REST write ${res.status}: ${await res.text()}`);
}
async function patchJob(patch){ const store=await getStore(); store.marketingAudioSyncJobs=(store.marketingAudioSyncJobs||[]).map(j=>j.id===JOB_ID?{...j,...patch}:j); await putStore(store); }
async function patchItem(fileId, patch){ const store=await getStore(); store.marketingAudioSyncJobs=(store.marketingAudioSyncJobs||[]).map(j=>j.id===JOB_ID?{...j,items:(j.items||[]).map(i=>i.fileId===fileId?{...i,...patch}:i)}:j); await putStore(store); }
function run(command,args,cwd){ return new Promise((resolve,reject)=>{ const child=spawn(command,args,{cwd,stdio:['ignore','pipe','pipe']}); let stderr=''; child.stderr.on('data',c=>{stderr+=String(c).slice(-8000)}); child.on('error',reject); child.on('close',code=>code===0?resolve():reject(new Error(`${command} exited ${code}: ${stderr||'no stderr'}`))); }); }
async function durationSeconds(filePath){ const out=await new Promise((resolve,reject)=>{ const child=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',filePath]); let stdout='',stderr=''; child.stdout.on('data',c=>stdout+=String(c)); child.stderr.on('data',c=>stderr+=String(c)); child.on('close',code=>code===0?resolve(stdout.trim()):reject(new Error(stderr))); }); const n=Number(out); if(!Number.isFinite(n)||n<=0) throw new Error('לא הצלחתי לזהות אורך קובץ'); return n; }
function safeName(value){ return String(value).replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim().slice(0,150)||'video'; }
function normalizeHebrewCaptionText(text){ return String(text).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+([,.!?;:])/g,'$1').replace(/([,.!?;:])(?=\S)/g,'$1 ').replace(/(^|\s)([,.!?;:]+)(\S)/g,'$1$3$2').replace(/\s+/g,' ').trim(); }
function splitCaptionLine(text){ const words=normalizeHebrewCaptionText(text).split(' ').filter(Boolean); const lines=[]; for(let i=0;i<words.length;i+=4) lines.push(words.slice(i,i+4).join(' ')); return lines.slice(0,2).map(line=>`‫${line}‬`).join('\n'); }
function msToSrtTime(ms){ const safe=Math.max(0,Math.round(ms)); const h=Math.floor(safe/3600000), m=Math.floor((safe%3600000)/60000), s=Math.floor((safe%60000)/1000), milli=safe%1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(milli).padStart(3,'0')}`; }
function segmentsToSrt(segments){ const sorted=segments.slice().sort((a,b)=>a.index-b.index); return sorted.map((seg,i)=>{ const nextStart=sorted[i+1]?.startMs; const paddedEnd=seg.endMs+Math.max(0,SUBTITLE_END_PADDING_MS); const cappedEnd=Number.isFinite(nextStart)?Math.min(paddedEnd,Math.max(seg.endMs,nextStart-80)):paddedEnd; const end=Math.max(cappedEnd,seg.startMs+700); return `${i+1}\n${msToSrtTime(seg.startMs)} --> ${msToSrtTime(end)}\n${splitCaptionLine(seg.text||'')}`; }).join('\n\n')+'\n'; }
function escapeSubtitlePath(filePath){ return filePath.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/,/g,'\\,'); }
async function downloadDriveFile(accessToken,file,targetPath){ const res=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,{headers:{authorization:`Bearer ${accessToken}`}}); if(!res.ok) throw new Error(`הורדת ${file.name} נכשלה (${res.status})`); await writeFile(targetPath,Buffer.from(await res.arrayBuffer())); }
async function uploadDriveFile(accessToken,folderId,filePath,name){ const st=await stat(filePath); const start=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json; charset=UTF-8','x-upload-content-type':'video/mp4','x-upload-content-length':String(st.size)},body:JSON.stringify({name,parents:[folderId],mimeType:'video/mp4'})}); if(!start.ok) throw new Error(`פתיחת העלאה נכשלה (${start.status})`); const uploadUrl=start.headers.get('location'); if(!uploadUrl) throw new Error('Google Drive לא החזיר כתובת העלאה'); const res=await fetch(uploadUrl,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(st.size)},body:createReadStream(filePath),duplex:'half'}); const json=await res.json().catch(()=>({})); if(!res.ok) throw new Error(json?.error?.message || `העלאה נכשלה (${res.status})`); return json; }
function outputName(input){ return `${safeName(path.basename(input,path.extname(input)||'.mp4'))} - עם סאונד רשמי וכתוביות.mp4`; }
function compactGuestName(value=''){ return safeName(String(value).split(/[,،|/]+/)[0]?.replace(/\([^)]*\)/g,'').trim() || 'מרואיין').slice(0,45); }
function normalizeClipWords(value){ return String(value).replace(/[`"“”'׳״]/g,'').replace(/[\\/:*?<>|]/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean).slice(0,4).join(' '); }
function namedOutputName(guestName='', clipTitle='', fallbackInput=''){ const guest=compactGuestName(guestName); const title=normalizeClipWords(clipTitle) || safeName(path.basename(fallbackInput,path.extname(fallbackInput)||'.mp4')).split(' ').slice(0,4).join(' '); return `${guest} - ${safeName(title)}.mp4`; }
function driveFileIdFromUrl(value=''){ return String(value).match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || String(value).match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || ''; }
function summarize(job){ const done=(job.items||[]).filter(i=>i.status==='completed'); const failed=(job.items||[]).filter(i=>i.status==='failed'); const lines=[`סנכרון סאונד וכתוביות לפרק “${job.episodeTitle}” הסתיים.`,`הצליחו: ${done.length} · נכשלו: ${failed.length} · דולגו: 0`]; if(job.outputFolderUrl) lines.push(`התיקייה בדרייב: ${job.outputFolderUrl}`); if(job.combinedVideoUrl) lines.push(`הסרטון המאוחד בתיקיית השיווק: ${job.combinedVideoUrl}`); if(done.length) lines.push(`\nהצליחו:\n${done.map(i=>`• ${i.fileName}${i.outputFileUrl?` → ${i.outputFileUrl}`:''}`).join('\n')}`); if(failed.length) lines.push(`\nנכשלו:\n${failed.map(i=>`• ${i.fileName}: ${i.message||'שגיאה לא ידועה'}`).join('\n')}`); return lines.join('\n'); }
async function suggestClipTitleFromTranscript(srtText){
 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey) return '';
 const clean=String(srtText).replace(/^\d+$/gm,'').replace(/\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/g,'').replace(/\s+/g,' ').trim().slice(0,6000);
 const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_FILENAME_MODEL||'gpt-4o-mini',temperature:0.2,messages:[{role:'system',content:'אתה נותן שם קצר בעברית לקליפ פודקאסט. החזר רק שם, בלי מרכאות, בלי נקודה, עד 4 מילים, לפי הדבר הכי מעניין שנאמר. לא לכלול שם מרואיין.'},{role:'user',content:clean}]})});
 const json=await res.json().catch(()=>({}));
 if(!res.ok) return '';
 return normalizeClipWords(json?.choices?.[0]?.message?.content||'');
}
async function meanVolumeDb(filePath){
 return await new Promise(resolve=>{ const child=spawn('ffmpeg',['-i',filePath,'-af','volumedetect','-f','null','-']); let stderr=''; child.stderr.on('data',c=>stderr+=String(c)); child.on('close',()=>{ const match=stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/); resolve(match?Number(match[1]):-28); }); child.on('error',()=>resolve(-28)); });
}
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function seededRandom(seed){ let h=2166136261; for(const ch of String(seed)) { h^=ch.charCodeAt(0); h=Math.imul(h,16777619); } return ((h>>>0)%1000000)/1000000; }
function chooseSegment({duration,meanDb,seed}){ const loudnessFactor=clamp((meanDb+35)/30,0,1); const durationFactor=clamp(duration/90,0,1); const randomFactor=seededRandom(`${seed}:length`); const wanted=8+loudnessFactor*10+durationFactor*8+randomFactor*4; const length=clamp(Math.min(wanted,Math.max(1,duration-0.5)),Math.min(8,duration),Math.min(30,duration)); const maxStart=Math.max(0,duration-length-0.25); return {start:maxStart*seededRandom(`${seed}:start`),length}; }
async function createCombinedVideo({accessToken,job,ctx,workDir}){
 const freshStore=await getStore();
 const freshJob=(freshStore.marketingAudioSyncJobs||[]).find(j=>j.id===JOB_ID)||job;
 const completed=(freshJob.items||[]).filter(item=>item.status==='completed'&&item.outputFileUrl);
 if(!completed.length) return null;
 const segmentPaths=[];
 for(let index=0; index<completed.length; index++){
  const item=completed[index]; const outputId=driveFileIdFromUrl(item.outputFileUrl); if(!outputId) continue;
  const inputPath=path.join(workDir,`combined-source-${index}.mp4`); const segmentPath=path.join(workDir,`combined-segment-${String(index).padStart(2,'0')}.mp4`);
  await downloadDriveFile(accessToken,{id:outputId,name:item.outputFileName||item.fileName},inputPath);
  const duration=await durationSeconds(inputPath); const meanDb=await meanVolumeDb(inputPath); const segment=chooseSegment({duration,meanDb,seed:`${JOB_ID}:${item.fileId}:${item.fileName}`});
  await run('ffmpeg',['-y','-ss',segment.start.toFixed(3),'-t',segment.length.toFixed(3),'-i',inputPath,'-vf','setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30','-af','asetpts=PTS-STARTPTS','-c:v','libx264','-preset',VIDEO_PRESET,'-crf',COMBINED_VIDEO_CRF,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-avoid_negative_ts','make_zero','-movflags','+faststart',segmentPath]);
  segmentPaths.push(segmentPath);
 }
 if(!segmentPaths.length) return null;
 const concatList=path.join(workDir,'combined-list.txt');
 await writeFile(concatList,segmentPaths.map(file=>`file '${file.replace(/'/g,"'\\''")}'`).join('\n'));
 const combinedPath=path.join(workDir,'combined-marketing-video.mp4');
 await run('ffmpeg',['-y','-fflags','+genpts','-f','concat','-safe','0','-i',concatList,'-vf','setpts=PTS-STARTPTS,fps=30','-af','asetpts=PTS-STARTPTS','-c:v','libx264','-preset',VIDEO_PRESET,'-crf',COMBINED_VIDEO_CRF,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-avoid_negative_ts','make_zero','-movflags','+faststart',combinedPath]);
 const uploaded=await uploadDriveFile(accessToken,ctx.marketingFolderId,combinedPath,`${compactGuestName(ctx.episode?.guests)} - מיטב הרגעים.mp4`);
 await patchJob({combinedVideoUrl:uploaded.webViewLink,combinedVideoName:uploaded.name});
 return uploaded;
}

await login();
const ctx=await api(`/api/marketing-audio-sync/${JOB_ID}/context`);
let store=await getStore();
let job=(store.marketingAudioSyncJobs||[]).find(j=>j.id===JOB_ID);
if(!job) throw new Error('Job not found');
const workDir=path.join(os.tmpdir(),`podkash-reviewed-render-${JOB_ID}`);
await mkdir(workDir,{recursive:true});
await patchJob({status:'rendering', error:undefined, finishedAt:undefined, unread:false});
const audioPath=path.join(workDir,safeName(ctx.audioFile.name));
await downloadDriveFile(ctx.accessToken,ctx.audioFile,audioPath);
for(const item of (job.items||[]).filter(i=>i.status==='rendering' && i.subtitleSegments?.length)){
 const file=ctx.videos.find(v=>v.id===item.fileId);
 if(!file){ await patchItem(item.fileId,{status:'failed',message:'סרטון המקור לא נמצא בתיקיית השיווק'}); continue; }
 try{
  await patchItem(item.fileId,{status:'rendering',message:'מרנדר מקומית עם הכתוביות שאושרו…'});
  const videoPath=path.join(workDir,safeName(file.name));
  const syncedPath=path.join(workDir,`${file.id}-synced.mp4`);
  const srtPath=path.join(workDir,`${file.id}-edited.srt`);
  const outPath=path.join(workDir,outputName(file.name));
  await downloadDriveFile(ctx.accessToken,file,videoPath);
  const duration=item.durationSeconds || await durationSeconds(videoPath);
  const offset=Number(item.detectedOffsetSeconds);
  if(!Number.isFinite(offset)) throw new Error('חסר offset סנכרון');
  await run('ffmpeg',['-y','-fflags','+genpts','-i',videoPath,'-ss',offset.toFixed(3),'-t',duration.toFixed(3),'-i',audioPath,'-filter_complex','[0:v:0]setpts=PTS-STARTPTS[v];[1:a:0]asetpts=PTS-STARTPTS[a]','-map','[v]','-map','[a]','-c:v','libx264','-preset',VIDEO_PRESET,'-crf',INTERMEDIATE_VIDEO_CRF,'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-shortest','-avoid_negative_ts','make_zero','-movflags','+faststart',syncedPath]);
  const editedSrt=segmentsToSrt(item.subtitleSegments);
  await writeFile(srtPath,editedSrt);
  await run('ffmpeg',['-y','-i',syncedPath,'-vf',`subtitles='${escapeSubtitlePath(srtPath)}':force_style='Fontname=Arial,Fontsize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.7,Shadow=0.5,Alignment=2,MarginL=110,MarginR=110,MarginV=38'`,'-c:v','libx264','-preset',VIDEO_PRESET,'-crf',FINAL_VIDEO_CRF,'-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',outPath]);
  const clipTitle=await suggestClipTitleFromTranscript(editedSrt).catch(()=> '');
  const uploaded=await uploadDriveFile(ctx.accessToken,ctx.outputFolder.id,outPath,namedOutputName(ctx.episode?.guests,clipTitle,file.name));
  await patchItem(item.fileId,{status:'completed',message:'סונכרן ורונדר בהצלחה עם הכתוביות שאושרו',outputFileName:uploaded.name,outputFileUrl:uploaded.webViewLink});
 }catch(error){ await patchItem(item.fileId,{status:'failed',message:error instanceof Error?error.message:'שגיאה לא ידועה'}); }
}
store=await getStore(); job=(store.marketingAudioSyncJobs||[]).find(j=>j.id===JOB_ID);
const failed=(job.items||[]).some(i=>i.status==='failed');
if(!job.combinedVideoUrl) await createCombinedVideo({accessToken:ctx.accessToken,job,ctx,workDir}).catch(error=>console.warn(`combined video skipped: ${error instanceof Error?error.message:error}`));
store=await getStore(); job=(store.marketingAudioSyncJobs||[]).find(j=>j.id===JOB_ID);
await patchJob({status:failed?'failed':'completed',finishedAt:new Date().toISOString(),summaryHebrew:summarize(job),unread:true});
await rm(workDir,{recursive:true,force:true}).catch(()=>{});
console.log('Done');
