'use client';

import { useEffect, useRef, useState } from 'react';
import { type Episode } from '@/lib/store-types';
import { cleanDateTime } from '@/lib/time';

type YouTubeChannel = {
  id: string;
  title: string;
  thumbnail?: string;
  customUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  viewCount?: string;
};

type YouTubeVideoSummary = {
  id: string;
  title: string;
  publishedAt?: string;
  thumbnail?: string;
  privacyStatus?: string;
  url: string;
};

type YouTubeStatus = {
  configured: boolean;
  redirectUri: string;
  connected: boolean;
  connection?: { email?: string; name?: string; picture?: string; expiresAt?: string } | null;
  channel?: YouTubeChannel | null;
  recentUploads?: YouTubeVideoSummary[];
  channelError?: string;
};

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '22', label: 'אנשים ובלוגים' },
  { id: '24', label: 'בידור' },
  { id: '27', label: 'חינוך' },
  { id: '28', label: 'מדע וטכנולוגיה' },
  { id: '25', label: 'חדשות ופוליטיקה' },
  { id: '23', label: 'קומדיה' },
];

function defaultDescription(ep?: Episode) {
  if (!ep) return '';
  const lines = [ep.topic ? ep.topic : '', '', `מנחה: ${ep.host || ''}`, ep.guests && ep.guests !== '—' ? `אורחים: ${ep.guests}` : ''];
  return lines.filter(Boolean).join('\n');
}

export function YouTubeStudio({ episodes }: { episodes: Episode[] }) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const [episodeId, setEpisodeId] = useState<string>(episodes[0] ? String(episodes[0].id) : '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [categoryId, setCategoryId] = useState('22');
  const [privacy, setPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [publishAt, setPublishAt] = useState('');
  const [madeForKids, setMadeForKids] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const episode = episodes.find(e => String(e.id) === episodeId);
  const scheduled = Boolean(publishAt);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/youtube/status', { cache: 'no-store' });
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      setStatus({ configured: false, connected: false, redirectUri: 'https://podkash.vercel.app/api/youtube/auth/callback' });
      setNotice(error instanceof Error ? error.message : 'שגיאה בבדיקת YouTube');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    if (!episode) return;
    setTitle(prev => prev || `#${episode.number} · ${episode.title}`);
    setDescription(prev => prev || defaultDescription(episode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  function chooseEpisode(id: string) {
    setEpisodeId(id);
    const ep = episodes.find(e => String(e.id) === id);
    setTitle(ep ? `#${ep.number} · ${ep.title}` : '');
    setDescription(defaultDescription(ep));
  }

  async function disconnect() {
    if (!window.confirm('לנתק את ערוץ ה־YouTube מפודקש?')) return;
    await fetch('/api/youtube/disconnect', { method: 'POST' });
    loadStatus();
  }

  async function persistEpisodeUrl(videoUrl: string) {
    if (!episode) return;
    try {
      const res = await fetch('/api/store', { cache: 'no-store' });
      if (!res.ok) return;
      const store = await res.json();
      const next = {
        ...store,
        episodes: (store.episodes || []).map((e: Episode) => e.id === episode.id ? { ...e, youtubeUrl: videoUrl } : e),
      };
      await fetch('/api/store', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    } catch {
      // Non-fatal: the video uploaded fine even if we couldn't save the link.
    }
  }

  async function startUpload() {
    if (!file) { setNotice('צריך לבחור קובץ וידאו'); return; }
    if (!title.trim()) { setNotice('צריך כותרת לסרטון'); return; }
    const confirmMsg = scheduled
      ? `להעלות ל־YouTube ולתזמן פרסום ל־${cleanDateTime(new Date(publishAt).toISOString())}?`
      : privacy === 'public'
        ? 'להעלות ולפרסם מיד כסרטון ציבורי ב־YouTube?'
        : `להעלות ל־YouTube כסרטון ${privacy === 'unlisted' ? 'לא רשום' : 'פרטי'}?`;
    if (!window.confirm(confirmMsg)) return;

    setUploading(true);
    setProgress(0);
    setNotice('');
    try {
      // 1. Get a short-lived access token from our server (admin-guarded).
      const tokRes = await fetch('/api/youtube/upload', { method: 'POST' });
      const tokData = await tokRes.json();
      if (!tokRes.ok || !tokData.ok) throw new Error(tokData.message || 'קבלת הרשאת העלאה נכשלה');

      // 2. Build the video metadata (YouTube forces private when publishAt is set).
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const metadata = {
        snippet: {
          title: title.trim().slice(0, 100),
          description: description.slice(0, 5000),
          tags: tagList.length ? tagList : undefined,
          categoryId,
        },
        status: {
          privacyStatus: scheduled ? 'private' : privacy,
          publishAt: scheduled ? new Date(publishAt).toISOString() : undefined,
          selfDeclaredMadeForKids: madeForKids,
        },
      };

      // 3. Initiate the resumable session FROM THE BROWSER so Google enables CORS
      //    (a server-initiated session has no Access-Control-Allow-Origin header).
      const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokData.accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(file.size),
          'X-Upload-Content-Type': file.type || 'video/*',
        },
        body: JSON.stringify(metadata),
      });
      if (!initRes.ok) {
        const j = await initRes.json().catch(() => ({}));
        throw new Error(j?.error?.message || `פתיחת ההעלאה נכשלה (${initRes.status})`);
      }
      const uploadUrl = initRes.headers.get('location');
      if (!uploadUrl) throw new Error('לא התקבל קישור העלאה מ־YouTube');

      // 4. Upload the bytes directly to the session URL with progress.
      const video = await new Promise<{ id?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'video/*');
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
          } else {
            reject(new Error(`ההעלאה נכשלה (${xhr.status}). ${xhr.responseText?.slice(0, 200) || ''}`));
          }
        };
        xhr.onerror = () => reject(new Error('שגיאת רשת במהלך ההעלאה'));
        xhr.send(file);
      });

      const videoUrl = video.id ? `https://www.youtube.com/watch?v=${video.id}` : '';
      if (videoUrl) await persistEpisodeUrl(videoUrl);
      setNotice(scheduled
        ? `הסרטון הועלה ותוזמן לפרסום. ${videoUrl ? `קישור: ${videoUrl}` : ''}`
        : `הסרטון הועלה בהצלחה. ${videoUrl ? `קישור: ${videoUrl}` : ''}`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      loadStatus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ההעלאה נכשלה');
    } finally {
      setUploading(false);
    }
  }

  const connected = status?.connected;
  const channel = status?.channel;

  return (
    <section className="panel drivePanel" style={{ marginBottom: 16 }}>
      <div className="drivePanelHead">
        <div>
          <span className={connected ? 'pill green' : status?.configured ? 'pill blue' : 'pill red'}>
            {loading ? 'בודק…' : connected ? 'YouTube מחובר' : status?.configured ? 'מוכן לחיבור' : 'צריך הגדרה'}
          </span>
          <h2>YouTube — העלאה ישירה</h2>
          <p className="muted">
            חיבור עצמאי לערוץ היוטיוב שלך (בלי Buffer). אפשר להעלות את הפרק המצולם ישירות מהמערכת,
            לקבוע כותרת, תיאור, פרטיות ותזמון פרסום אוטומטי — והקישור נשמר אוטומטית בנכסי הפרק.
          </p>
        </div>
        <div className="headAction">
          {status?.configured
            ? <a className="btn gold" href="/api/youtube/auth/start">{connected ? 'חיבור מחדש' : 'חיבור YouTube'}</a>
            : <button className="btn gold" disabled>חסר Client ID</button>}
          {connected ? <button className="btn light" onClick={disconnect}>ניתוק</button> : null}
          <button className="btn light" onClick={loadStatus}>רענון</button>
        </div>
      </div>

      {connected ? (
        <div className="list">
          <div className="row"><span>ערוץ מחובר</span><b>{channel?.title || status?.connection?.name || 'YouTube'}</b></div>
          {channel?.subscriberCount ? <div className="row"><span>מנויים</span><b>{Number(channel.subscriberCount).toLocaleString('he-IL')}</b></div> : null}
          {channel?.videoCount ? <div className="row"><span>סרטונים בערוץ</span><b>{Number(channel.videoCount).toLocaleString('he-IL')}</b></div> : null}
          <div className="row"><span>חשבון Google</span><b>{status?.connection?.email || '—'}</b></div>
          <div className="row"><span>Token פעיל עד</span><b>{cleanDateTime(status?.connection?.expiresAt)}</b></div>
          {status?.channelError ? <div className="row"><span>שים לב</span><b>{status.channelError}</b></div> : null}
        </div>
      ) : (
        <div className="list">
          <div className="row"><span>Redirect URI להוספה בגוגל</span><code className="inlineCode">{status?.redirectUri || 'https://podkash.vercel.app/api/youtube/auth/callback'}</code></div>
          {status?.configured
            ? <div className="row"><span>סטטוס</span><b>הפרויקט מוגדר. ודא ש־YouTube Data API v3 מופעל, ולחץ “חיבור YouTube”.</b></div>
            : <div className="row"><span>סטטוס</span><b>צריך GOOGLE_CLIENT_ID ו־GOOGLE_CLIENT_SECRET ב־Vercel.</b></div>}
        </div>
      )}

      {connected ? (
        <div className="smartForm" style={{ marginTop: 16 }}>
          <label className="formRow"><span>פרק</span>
            <select value={episodeId} onChange={e => chooseEpisode(e.target.value)}>
              {episodes.map(e => <option key={e.id} value={e.id}>{`#${e.number} · ${e.title}`}</option>)}
            </select>
          </label>
          <label className="formRow"><span>קובץ וידאו</span>
            <input ref={fileRef} type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <label className="formRow"><span>כותרת</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="כותרת הסרטון ביוטיוב" />
          </label>
          <label className="formRow"><span>קטגוריה</span>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="formRow"><span>פרטיות</span>
            <select value={privacy} onChange={e => setPrivacy(e.target.value as typeof privacy)} disabled={scheduled}>
              <option value="private">פרטי</option>
              <option value="unlisted">לא רשום (קישור בלבד)</option>
              <option value="public">ציבורי</option>
            </select>
          </label>
          <label className="formRow"><span>תזמון פרסום (אופציונלי)</span>
            <input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} />
          </label>
          <label className="formRow"><span>תגיות (מופרדות בפסיק)</span>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="פודקאסט, יזמות, תוכן" />
          </label>
          <label className="formRow wide"><span>תיאור</span>
            <textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} />
          </label>
          <label className="checkRow"><input type="checkbox" checked={madeForKids} onChange={e => setMadeForKids(e.target.checked)} /> תוכן המיועד לילדים</label>

          {scheduled ? <p className="muted formRow wide" style={{ margin: 0 }}>בתזמון פרסום הסרטון יעלה כפרטי ויתפרסם אוטומטית בזמן שנקבע.</p> : null}
          {privacy === 'public' && !scheduled ? <p className="muted formRow wide" style={{ margin: 0 }}>שים לב: פרסום ציבורי דרך ה־API דורש שהפרויקט עבר audit של גוגל, אחרת הסרטון יישאר פרטי.</p> : null}

          {uploading ? (
            <div className="formRow wide">
              <div style={{ height: 10, background: 'rgba(255,255,255,.12)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--gold, #d4af37)', transition: 'width .2s' }} />
              </div>
              <small className="muted">מעלה… {progress}%</small>
            </div>
          ) : null}

          <div className="formActions">
            <button className="btn light" type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value=''; }} disabled={uploading}>נקה קובץ</button>
            <button className="btn gold" type="button" onClick={startUpload} disabled={uploading || !file || !title.trim()}>
              {uploading ? `מעלה… ${progress}%` : scheduled ? 'העלה ותזמן פרסום' : 'העלה ל־YouTube'}
            </button>
          </div>
        </div>
      ) : null}

      {connected && status?.recentUploads?.length ? (
        <>
          <h3 style={{ marginTop: 18 }}>הסרטונים האחרונים בערוץ</h3>
          <div className="list">
            {status.recentUploads.map(v => (
              <a className="row click" key={v.id} href={v.url} target="_blank" rel="noreferrer">
                <span><b>{v.title}</b><br /><small className="muted">{cleanDateTime(v.publishedAt)}{v.privacyStatus ? ` · ${v.privacyStatus}` : ''}</small></span>
                <span className="pill green">פתח</span>
              </a>
            ))}
          </div>
        </>
      ) : null}

      {notice ? <p className="muted" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }} role="status" aria-live="polite">{notice}</p> : null}
    </section>
  );
}
