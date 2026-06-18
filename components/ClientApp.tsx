'use client';

import Link from 'next/link';
import { Dispatch, FormEvent, SetStateAction, useEffect, useRef, useState } from 'react';
import { type EpisodeStatus } from '@/lib/data';
import { seedStore as seed, type Application, type Booking, type Episode, type Person, type Session, type Store } from '@/lib/store-types';
import { cleanDateTime, formatDateTimeInput, formatDateTimeRange } from '@/lib/time';

const statusFlow: EpisodeStatus[] = ['רעיון','בתכנון תוכן','בתיאום','צילום נקבע','צולם','בעריכה','ממתין לאישור','מוכן לפרסום','פורסם'];

const applicationFieldLabels: Record<string, string> = {
  name: 'שם מלא', age: 'גיל', city: 'עיר מגורים', phone: 'טלפון', email: 'אימייל', links: 'רשתות / אתר / לינקדאין', displayName: 'שם להצגה בפרק',
  about: 'מי אני', occupation: 'עיסוק כיום', mainTopic: 'נושא לפרק', whyImportant: 'למה הנושא חשוב ומה הזווית', message: 'מסר למאזינים', topics: 'תחומים מתאימים', conversationStyle: 'סגנון שיחה', cameraComfort: 'נוחות מול מצלמה/מיקרופון', goals: 'מטרה מההשתתפות', audience: 'קהל יעד', avoidTopics: 'נושאים שלא לגעת בהם', availability: 'זמינות להקלטה', extra: 'מידע נוסף', marketingConsent: 'אישור שימוש בצילום/תוכן', valuesConsent: 'אישור שיח מכבד',
  background: 'רקע וניסיון', whyHost: 'למה להנחות בפודקש', episodeTopic: 'רעיון לפרק', hasGuest: 'יש כבר מרואיין/ת', guestDetails: 'פרטי מרואיין / התאמה רצויה', hostingStyle: 'סגנון הנחיה', preparationStyle: 'הכנת שאלות או זרימה', needHelp: 'עזרה בבניית מבנה הפרק',
};

const applicationFieldOrder = ['name','phone','email','age','city','links','displayName','about','occupation','background','mainTopic','whyImportant','message','topics','conversationStyle','hostingExperience','whyHost','episodeTopic','hasGuest','guestDetails','hostingStyle','preparationStyle','needHelp','cameraComfort','goals','audience','avoidTopics','availability','technicalNeeds','extra','marketingConsent','valuesConsent'];

function applicationTypeLabel(type: Application['type']) {
  return type === 'host' ? 'מנחה / מראיין/ת' : 'מרואיין/ת';
}

function applicationEntries(application: Application) {
  const data = application.data || {};
  const keys = Array.from(new Set([...applicationFieldOrder, ...Object.keys(data)])).filter(key => String(data[key] || '').trim());
  return keys.map(key => [applicationFieldLabels[key] || key, String(data[key])]);
}

function applicationTopic(a: Application) {
  return a.data?.mainTopic || a.data?.episodeTopic || a.data?.whyHost || a.data?.about || 'נרשם/ה דרך הטופס';
}

function applicationToPerson(a: Application): Person {
  const note = [a.data?.mainTopic || a.data?.episodeTopic || a.data?.about || a.data?.whyHost, a.city && `עיר: ${a.city}`, 'נרשם/ה דרך הטופס'].filter(Boolean).join(' · ');
  return { name: a.name, role: a.type === 'host' ? 'מנחה (הרשמה)' : 'מרואיין (הרשמה)', type: a.type, phone: a.phone || '', episodes: 0, note, email: a.email, city: a.city, source: 'registration' };
}

function ensurePerson(people: Person[], a: Application): Person[] {
  const exists = people.some(p => (a.phone && p.phone === a.phone) || (!a.phone && p.name === a.name));
  return exists ? people : [applicationToPerson(a), ...people];
}

function AssignControl({ a, store, setStore }: { a: Application; store: Store; setStore: Dispatch<SetStateAction<Store>> }) {
  function assignEpisode(episodeId: number) {
    setStore(s => ({ ...s, people: ensurePerson(s.people, a), applications: s.applications.map(x => x.id === a.id ? { ...x, episodeId, noEpisode: false } : x) }));
  }
  function markNoEpisode() {
    setStore(s => ({ ...s, people: ensurePerson(s.people, a), applications: s.applications.map(x => x.id === a.id ? { ...x, noEpisode: true, episodeId: null } : x) }));
  }
  return <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
    <select defaultValue="" onChange={e => { if (e.target.value) assignEpisode(Number(e.target.value)); }} style={{ padding: '8px 10px', borderRadius: 10 }}>
      <option value="" disabled>שייך לפרק…</option>
      {store.episodes.map(ep => <option key={ep.id} value={ep.id}>#{ep.number} {ep.title}</option>)}
    </select>
    <button className="miniBtn" type="button" onClick={markNoEpisode}>אין פרק עדיין</button>
  </div>;
}

function AssignApplicationsPrompt({ store, setStore }: { store: Store; setStore: Dispatch<SetStateAction<Store>> }) {
  const [dismissed, setDismissed] = useState(false);
  const unassigned = (store.applications || []).filter(a => !a.episodeId && !a.noEpisode);
  if (dismissed || !unassigned.length) return null;
  return <Modal title="שיוך הרשמות לפרקים" subtitle={`${unassigned.length} הרשמות עדיין לא שויכו לפרק. שייך כל אחת לפרק, או סמן שעדיין לא נפתח לה פרק.`} onClose={() => setDismissed(true)}>
    <div className="list">
      {unassigned.map(a => <div className="row applicationRow" key={a.id} style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}><h3 style={{ margin: 0 }}>{a.name}</h3><p className="muted" style={{ margin: '4px 0 0' }}>{applicationTypeLabel(a.type)} · {a.phone}</p></div>
        <AssignControl a={a} store={store} setStore={setStore} />
      </div>)}
    </div>
    <div className="formActions"><button className="btn light" type="button" onClick={() => setDismissed(true)}>דלג לעכשיו</button></div>
  </Modal>;
}

function normalizeStore(input: Partial<Store> | null | undefined): Store {
  const source = input || {};
  const episodes = Array.isArray(source.episodes) ? source.episodes.map((e, i) => ({
    ...seed.episodes[i % seed.episodes.length],
    ...e,
    id: Number(e?.id) || i + 1,
    number: Number(e?.number) || i + 1,
    title: e?.title || 'פרק ללא שם',
    topic: e?.topic || 'נושא חדש',
    status: statusFlow.includes(e?.status as EpisodeStatus) ? e?.status as EpisodeStatus : 'רעיון',
    host: e?.host || 'בן גולן',
    guests: e?.guests || '—',
    recording: e?.recording || 'טרם נקבע',
    publish: e?.publish || 'לא נקבע',
    progress: Number(e?.progress) || 0,
    tasks: Number(e?.tasks) || 0,
    platformReady: Number(e?.platformReady) || 0,
  })) : seed.episodes;
  const byTitle = new Map(episodes.map(e => [e.title, e]));
  return {
    episodes,
    people: Array.isArray(source.people) ? source.people : seed.people,
    tasks: Array.isArray(source.tasks) ? source.tasks : seed.tasks,
    messages: Array.isArray(source.messages) ? source.messages : seed.messages,
    platforms: Array.isArray(source.platforms) ? source.platforms : seed.platforms,
    applications: Array.isArray(source.applications) ? source.applications : seed.applications,
    sessions: Array.isArray(source.sessions) ? source.sessions.map((ss, i) => {
      const fallback = seed.sessions[i % seed.sessions.length];
      const rawEpisode = ss?.episode || fallback?.episode || episodes[0];
      const episode = byTitle.get(rawEpisode.title) || episodes.find(e => e.id === rawEpisode.id) || episodes[0];
      return { ...fallback, ...ss, episode, confirmations: Array.isArray(ss?.confirmations) ? ss.confirmations : [], missing: Array.isArray(ss?.missing) ? ss.missing : [] };
    }) : seed.sessions,
  };
}

function useStore(initialStore?: Store) {
  const [store, setStore] = useState<Store>(() => initialStore ? normalizeStore(initialStore) : seed);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    // Drop any stale legacy localStorage so it can never be merged over the DB again.
    try { localStorage.removeItem('podkash:v1'); } catch {}
    async function load() {
      try {
        const res = await fetch('/api/store', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const fromDb = normalizeStore(await res.json());
        if (!cancelled) {
          setStore(fromDb);
          // Enable autosave ONLY after a successful load — a failed/blocked load must never overwrite good data.
          setReady(true);
        }
      } catch (error) {
        console.error('Podkash DB load failed', error);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    // Safety net: never overwrite the DB with a fully-empty store (prevents accidental wipes).
    const isEmpty = !store.episodes.length && !store.people.length && !store.tasks.length
      && !store.sessions.length && !store.messages.length && !store.platforms.length
      && !(store.applications || []).length;
    if (isEmpty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/store', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(normalizeStore(store)) })
        .catch(error => console.error('Podkash DB save failed', error));
    }, 350);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [store, ready]);

  return [store, setStore] as const;
}

function field(form: HTMLFormElement, name: string) { return String(new FormData(form).get(name) || '').trim(); }

function formatDateTimeLocal(value: string, fallback: string) { return formatDateTimeInput(value, fallback); }
function Btn({ children, onClick, tone='dark' }: { children: React.ReactNode; onClick?: () => void; tone?: 'dark'|'gold'|'light' }) { return <button className={`btn ${tone}`} onClick={onClick}>{children}</button>; }
function Metric({ n, label }: { n: string|number; label: string }) { return <div className="metric"><strong>{n}</strong><span>{label}</span></div>; }
function Head({ eyebrow, title, subtitle, children }: { eyebrow:string; title:string; subtitle:string; children?:React.ReactNode }) { return <header className="pageHead"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{children&&<div className="headAction">{children}</div>}</header>; }

function Modal({ title, subtitle, children, onClose }: { title:string; subtitle:string; children:React.ReactNode; onClose:()=>void }) {
  return <div className="modalOverlay" onMouseDown={onClose}>
    <section className="modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="modalHead"><div><p className="eyebrow">שאלון קצר</p><h2>{title}</h2><p>{subtitle}</p></div><button className="closeBtn" onClick={onClose}>×</button></div>
      {children}
    </section>
  </div>;
}
function FormRow({ label, name, children, required=false }: { label:string; name?:string; children?:React.ReactNode; required?:boolean }) {
  return <label className="formRow"><span>{label}{required && ' *'}</span>{children ?? <input name={name} required={required} />}</label>;
}
function TextArea({ label, name, required=false }: { label:string; name:string; required?:boolean }) { return <label className="formRow wide"><span>{label}{required && ' *'}</span><textarea name={name} rows={4} required={required}/></label>; }

export function DashboardClient() {
  const [store, setStore] = useStore();
  const urgent = store.episodes.filter(e => e.urgent);
  const open = store.tasks.filter(t => t.status !== 'בוצע');
  const today = open.filter(t => t.due === 'היום');
  return <>
    <AssignApplicationsPrompt store={store} setStore={setStore} />
    <Head eyebrow="סקירה יומית" title="מה צריך לקרות עכשיו?" subtitle="דשבורד קצר שמראה צילומים קרובים, פרקים תקועים, משימות דחופות והפצה שמחכה לטיפול.">
      <Link className="btn dark" href="/episodes">+ פרק חדש</Link><Link className="btn light" href="/messages">הודעה מהירה</Link>
    </Head>
    <section className="metrics"><Metric n={store.episodes.filter(e=>e.status==='צילום נקבע').length} label="צילומים קרובים"/><Metric n={store.episodes.filter(e=>e.status==='בעריכה').length} label="בעריכה"/><Metric n={open.length} label="משימות פתוחות"/><Metric n={store.episodes.filter(e=>e.status==='מוכן לפרסום').length} label="מוכנים לפרסום"/></section>
    <section className="grid two"><div className="panel dark"><h2>מוקדי תשומת לב</h2><div className="list">{urgent.length ? urgent.map(e=><div className="row" key={e.id}><div><h3>{e.title}</h3><p>{e.status} · {cleanDateTime(e.recording)} · {e.tasks} משימות פתוחות</p><div className="progress"><span style={{width:e.progress+'%'}}/></div></div><span className="pill red">דחוף</span></div>) : <p className="muted">אין כרגע פרקים שסומנו כדחופים.</p>}</div></div>
    <div className="panel"><h2>משימות היום</h2><div className="list">{today.length ? today.map(t=><div className="row" key={t.title}><div><h3>{t.title}</h3><p>{t.episode}<br/>{t.owner} · {cleanDateTime(t.due)}</p></div><span className="pill">{t.type}</span></div>) : <p className="muted">אין משימות שמסומנות להיום.</p>}</div></div></section>
    <section className="grid three" style={{marginTop:16}}><div className="panel"><h3>תהליך פרק</h3><p className="muted">רעיון → תוכן → תיאום → צילום → עריכה → אישור → הפצה.</p></div><div className="panel"><h3>וואטסאפ</h3><p className="muted">ב־MVP הודעות מוכנות להעתקה ואישור אנושי, בלי אוטומציה מסוכנת לקבוצות.</p></div><div className="panel"><h3>הפצה</h3><p className="muted">מעקב לפי פלטפורמה: נכסים, טקסט, סטטוס ולינק אחרי פרסום.</p></div></section>
  </>;
}

export function EpisodesClient() {
  const [store, setStore] = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [hostEpisodes, setHostEpisodes] = useState<Episode[]>([]);
  const [editHostEp, setEditHostEp] = useState<Episode | null>(null);
  const [hostEpError, setHostEpError] = useState('');
  const [hostEpSaving, setHostEpSaving] = useState(false);
  function refreshHostEpisodes() { fetch('/api/all-episodes', { cache: 'no-store' }).then(r => r.ok ? r.json() : { episodes: [] }).then(d => setHostEpisodes(d.episodes || [])).catch(() => {}); }
  useEffect(() => { refreshHostEpisodes(); }, []);
  async function saveHostEpisode(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); if (!editHostEp) return; setHostEpError('');
    const f = ev.currentTarget; const get = (n: string) => String(new FormData(f).get(n) || '').trim();
    const patch = { title: get('title') || editHostEp.title, topic: get('topic'), status: get('status'), host: get('host'), guests: get('guests'), recording: get('recording'), publish: get('publish') };
    setHostEpSaving(true);
    const res = await fetch('/api/host-episode', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostId: editHostEp.ownerHostId, episodeId: editHostEp.id, patch }) });
    const d = await res.json().catch(() => ({})); setHostEpSaving(false);
    if (!res.ok) { setHostEpError(d.error || 'שגיאה בשמירה'); return; }
    setEditHostEp(null); refreshHostEpisodes();
  }
  const externalFormPath = '/join';
  const externalFormUrl = typeof window !== 'undefined' ? `${window.location.origin}${externalFormPath}` : externalFormPath;
  const filtered = store.episodes.filter(e => [e.title,e.topic,e.host,e.guests,e.status].join(' ').includes(q));
  const boardStatuses = [...statusFlow, ...filtered.map(e=>e.status).filter(st=>!statusFlow.includes(st))].filter((st,i,arr)=>arr.indexOf(st)===i);
  const applications = store.applications || [];
  const unassignedApplications = applications.filter(a => !a.episodeId && !a.noEpisode);
  const taskCount = (episode: Episode) => store.tasks.filter(t => t.episode === episode.title).length;
  function addEpisode(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const form = ev.currentTarget;
    const id = Math.max(...store.episodes.map(e => e.id), 0) + 1;
    const title = field(form,'title');
    const ep: Episode = {
      id, number: Number(field(form,'number')) || Math.max(...store.episodes.map(e => e.number), 0)+1,
      title, topic: field(form,'topic') || 'נושא חדש', status: (field(form,'status') || 'רעיון') as EpisodeStatus,
      host: field(form,'host') || 'בן גולן', guests: field(form,'guests') || '—',
      recording: formatDateTimeLocal(field(form,'recording'), 'טרם נקבע'), publish: formatDateTimeLocal(field(form,'publish'), 'לא נקבע'),
      progress: 10, tasks: 0, platformReady: 0, urgent: field(form,'urgent') === 'on',
      brief: '', contentPlan: '', coordinationNote: '', assetsNote: ''
    };
    setStore(s => ({ ...s, episodes: [ep, ...s.episodes] })); setOpen(false);
    // If a recording time was set, auto-open a pending studio slot in the shared calendar (conflict-checked, admin-approved).
    const recordingRaw = field(form,'recording');
    if (recordingRaw) {
      const start = new Date(recordingRaw);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 2 * 60 * 60000);
        fetch('/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ startAt: start.toISOString(), endAt: end.toISOString(), studio: 'אולפן', episodeId: id, episodeTitle: title || 'צילום' }) })
          .then(async r => { if (r.status === 409) alert('הפרק נוצר. שימו לב: מועד הצילום שבחרתם תפוס ביומן — בחרו זמן פנוי במסך היומן.'); })
          .catch(() => {});
      }
    }
    window.setTimeout(() => {
      fetch('/api/google/drive/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ episodeId: id }) })
        .catch(error => console.error('Podkash Drive auto-sync failed', error));
    }, 1200);
  }
  function advance(id:number) { setStore(s => ({...s, episodes:s.episodes.map(e => { if(e.id!==id) return e; const i=statusFlow.indexOf(e.status); return {...e, status:statusFlow[Math.min(i+1,statusFlow.length-1)], progress:Math.min(100,e.progress+12)}; })})); }
  async function copyExternalFormLink() {
    try {
      await navigator.clipboard.writeText(externalFormUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('העתקת קישור הרשמה חיצוני', externalFormUrl);
    }
  }
  function deleteEpisode(id:number) { const ep=store.episodes.find(e=>e.id===id); if(!ep) return; if(!window.confirm(`למחוק את הפרק “${ep.title}”? הפעולה תמחק גם משימות, נכסי הפצה וסשנים שמחוברים אליו.`)) return; setStore(s=>({...s, episodes:s.episodes.filter(e=>e.id!==id), tasks:s.tasks.filter(t=>t.episode!==ep.title), platforms:s.platforms.filter(p=>p.episode!==ep.title), sessions:s.sessions.filter(ss=>ss.episode?.id!==ep.id && ss.episode?.title!==ep.title), messages:s.messages.filter(m=>m.target!==ep.title)})); }
  return <>
    <Head eyebrow="פרקים" title="כל פרק כמרכז עבודה" subtitle="יצירת פרק כוללת את המידע שבאמת צריך לתפעול: נושא, מנחה, מרואיינים, צילום, פרסום וסטטוס."><Btn onClick={()=>setOpen(true)}>+ פרק</Btn><Btn tone="gold" onClick={copyExternalFormLink}>{copied ? 'הקישור הועתק' : 'העתקת קישור הרשמה'}</Btn><Link className="btn light" href={externalFormPath} target="_blank">פתיחת הטופס</Link><input className="search" placeholder="חיפוש פרק" value={q} onChange={e=>setQ(e.target.value)} /></Head>
    <section className="metrics episodesMetrics"><Metric n={store.episodes.length} label="פרקים"/><Metric n={store.episodes.filter(e=>e.status==='צילום נקבע').length} label="צילום נקבע"/><Metric n={store.episodes.filter(e=>e.status==='בעריכה').length} label="בעריכה"/><Metric n={store.episodes.filter(e=>e.status==='מוכן לפרסום').length} label="לפרסום"/></section>
    {hostEpisodes.length > 0 && <section className="panel" style={{marginBottom:16}}><h2 style={{display:'flex',alignItems:'center',gap:8}}>פרקים של מנחים <span className="pill blue">{hostEpisodes.length}</span></h2><p className="muted" style={{margin:'0 0 14px'}}>פרקים שנוצרו ע״י המנחים באזור האישי שלהם. הניהול נשאר אצל המנחה — כאן לצפייה ומעקב.</p><div className="grid three">{hostEpisodes.map(ep=><article className="episodeCard" key={`${ep.ownerHostId}-${ep.id}`} onClick={()=>setEditHostEp(ep)} style={{cursor:'pointer'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}><span className="pill">{ep.status}</span><span className="pill green">מאת {ep.ownerName}</span></div><h3 style={{margin:'0 0 6px'}}>#{ep.number} · {ep.title}</h3><p className="muted" style={{margin:0}}>{ep.topic}<br/>מנחה: {ep.host} · מרואיינים: {ep.guests}<br/>צילום: {cleanDateTime(ep.recording)}</p><p className="muted" style={{margin:'8px 0 0',fontWeight:900,fontSize:12}}>לחץ לצפייה ועריכה ←</p></article>)}</div></section>}
    {editHostEp && <Modal title={`פרק של ${editHostEp.ownerName}`} subtitle="צפייה ועריכה של פרטי הפרק. השינויים נשמרים אצל המנחה." onClose={()=>setEditHostEp(null)}><form className="smartForm" onSubmit={saveHostEpisode}><FormRow label="שם הפרק"><input name="title" defaultValue={editHostEp.title} required /></FormRow><FormRow label="מספר"><input defaultValue={editHostEp.number} disabled /></FormRow><FormRow label="נושא / זווית"><input name="topic" defaultValue={editHostEp.topic} /></FormRow><FormRow label="סטטוס"><select name="status" defaultValue={editHostEp.status}>{statusFlow.map(s=><option key={s}>{s}</option>)}</select></FormRow><FormRow label="מנחה"><input name="host" defaultValue={editHostEp.host} /></FormRow><FormRow label="מרואיינים"><input name="guests" defaultValue={editHostEp.guests} /></FormRow><FormRow label="מועד צילום"><input name="recording" defaultValue={editHostEp.recording} /></FormRow><FormRow label="מועד פרסום"><input name="publish" defaultValue={editHostEp.publish} /></FormRow>{hostEpError && <p className="joinError" style={{gridColumn:'1/-1'}}>{hostEpError}</p>}<div className="formActions"><button className="btn light" type="button" onClick={()=>setEditHostEp(null)}>סגור</button><button className="btn gold" disabled={hostEpSaving}>{hostEpSaving?'שומר…':'שמור שינויים'}</button></div></form></Modal>}
    <AssignApplicationsPrompt store={store} setStore={setStore} />
    <details className="disclosurePanel" style={{marginBottom:16}}><summary><span className={`pill ${unassignedApplications.length ? 'red' : 'green'}`}>{unassignedApplications.length}</span><div><h2>הרשמות חיצוניות חדשות</h2><p className="muted">הרשמות מהטופס שעדיין לא שויכו לפרק. פתח כדי לשייך כל אחת לפרק. לחיצה על השם פותחת את כל הפרטים.</p></div></summary><div className="disclosureBody"><div className="list">{unassignedApplications.length ? unassignedApplications.map(a=><div className="row applicationRow" key={a.id} style={{alignItems:'center',gap:10,flexWrap:'wrap'}}><button className="click" style={{flex:1,minWidth:160,textAlign:'inherit',background:'none',border:'none',cursor:'pointer',padding:0}} onClick={()=>setSelectedApplication(a)}><div><h3 style={{margin:0}}>{a.name}</h3><p className="muted" style={{margin:'4px 0 0'}}>{applicationTypeLabel(a.type)} · {a.phone} · {a.email}<br/>{applicationTopic(a)}</p></div></button><AssignControl a={a} store={store} setStore={setStore} /></div>) : <p className="muted">אין הרשמות חדשות שממתינות לשיוך 🎉</p>}</div></div></details>
    <section className="episodesMobileList">{filtered.map(e=><article className="mobileEpisodeCard" key={e.id}><Link href={`/episodes/${e.id}`} className="cardLink"><div className="mobileEpisodeTop"><span className="pill blue">#{e.number}</span>{e.urgent&&<span className="pill red">דחוף</span>}<span className="pill">{e.status}</span></div><h2>{e.title}</h2><p>{e.topic}</p><div className="mobileEpisodeFacts"><div><small>מנחה</small><b>{e.host}</b></div><div><small>מרואיינים</small><b>{e.guests}</b></div><div><small>צילום</small><b>{cleanDateTime(e.recording)}</b></div><div><small>פרסום</small><b>{cleanDateTime(e.publish)}</b></div></div><div className="progress"><span style={{width:e.progress+'%'}}/></div></Link><div className="mobileEpisodeActions"><button onClick={()=>advance(e.id)}>קדם סטטוס</button><Link href={`/episodes/${e.id}`}>פתח</Link><Link href={`/episodes/${e.id}`}>{taskCount(e)} משימות</Link><button className="deleteTiny" onClick={()=>deleteEpisode(e.id)} aria-label={`מחיקת ${e.title}`}>מחיקה</button></div></article>)}</section>
    <section className="board episodesBoardDesktop">{boardStatuses.map(st=><div className="lane" key={st}><div className="laneTitle"><span>{st}</span><span className="pill">{filtered.filter(e=>e.status===st).length}</span></div>{filtered.filter(e=>e.status===st).map(e=><article className="episodeCard" key={e.id}><Link href={`/episodes/${e.id}`} className="cardLink"><h3>#{e.number} · {e.title}</h3><p className="muted">{e.topic}<br/>{e.host} · {e.guests}<br/>צילום: {cleanDateTime(e.recording)}</p><div className="progress"><span style={{width:e.progress+'%'}}/></div></Link><div style={{display:'flex',gap:7,marginTop:10,flexWrap:'wrap'}}><button className="miniBtn" onClick={()=>advance(e.id)}>קדם</button><Link className="pill" href={`/episodes/${e.id}`}>פתח · {taskCount(e)} משימות</Link><button className="deleteTiny" onClick={()=>deleteEpisode(e.id)} aria-label={`מחיקת ${e.title}`}>מחק</button></div></article>)}</div>)}</section>
    {selectedApplication && <Modal title={selectedApplication.name} subtitle={`${applicationTypeLabel(selectedApplication.type)} · נרשם/ה דרך הטופס החיצוני · ${cleanDateTime(selectedApplication.createdAt)}`} onClose={()=>setSelectedApplication(null)}><section className="applicationDetails"><div className="applicationSummary"><span className="pill green">{applicationTypeLabel(selectedApplication.type)}</span><a className="pill" href={`tel:${selectedApplication.phone}`}>{selectedApplication.phone}</a><a className="pill" href={`mailto:${selectedApplication.email}`}>{selectedApplication.email}</a></div><div className="applicationDetailGrid">{applicationEntries(selectedApplication).map(([label, value])=><div className="applicationDetailItem" key={label}><small>{label}</small><p>{value}</p></div>)}</div></section></Modal>}
    {open && <Modal title="פרק חדש" subtitle="המידע הזה ייכנס לכרטיס הפרק ולמרכז השליטה שלו." onClose={()=>setOpen(false)}><form className="smartForm" onSubmit={addEpisode}><FormRow label="שם הפרק" name="title" required/><FormRow label="מספר פרק" name="number"/><FormRow label="נושא / זווית" name="topic" required/><FormRow label="מנחה" name="host"/><FormRow label="מרואיינים" name="guests"/><FormRow label="מועד צילום"><input name="recording" type="datetime-local" /></FormRow><FormRow label="מועד פרסום מתוכנן"><input name="publish" type="datetime-local" /></FormRow><FormRow label="סטטוס"><select name="status">{statusFlow.map(s=><option key={s}>{s}</option>)}</select></FormRow><label className="checkRow"><input type="checkbox" name="urgent"/> לסמן כדחוף</label><div className="formActions"><button className="btn light" type="button" onClick={()=>setOpen(false)}>ביטול</button><button className="btn gold">יצירת פרק</button></div></form></Modal>}
  </>;
}


export function EpisodeDetailClient({ id, initialStore }: { id: string; initialStore?: Store }) {
  const [store, setStore] = useStore(initialStore);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const episode = store.episodes.find(e => String(e.id) === id);
  if (!episode) {
    return <>
      <Head eyebrow="פרק" title="הפרק לא נמצא" subtitle="כנראה שהפרק נמחק או שהקישור כבר לא קיים במכשיר הזה."><Link className="btn dark" href="/episodes">חזרה לרשימת הפרקים</Link></Head>
      <section className="panel"><p className="muted">אם יצרת פרק במכשיר אחר, צריך לסנכרן נתונים/DB כדי שהוא יופיע גם כאן.</p></section>
    </>;
  }
  const ep = episode;
  const episodeTasks = store.tasks.filter(t => t.episode === ep.title);
  const episodePlatforms = store.platforms.filter(p => p.episode === ep.title);
  const sessions = store.sessions.filter(ss => ss.episode?.title === ep.title || ss.episode?.id === ep.id);
  const completedTasks = episodeTasks.filter(t => t.status === 'בוצע').length;
  const readyPlatforms = episodePlatforms.filter(p => ['מוכן לפרסום','מוכן'].includes(p.status)).length;
  const progress = episodeTasks.length ? Math.round((completedTasks / episodeTasks.length) * 100) : ep.progress;

  function updateEpisode(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const f = ev.currentTarget; const oldTitle = ep.title;
    const title = field(f,'title') || ep.title;
    const nextStatus = (field(f,'status') || ep.status) as EpisodeStatus;
    setStore(s => ({
      ...s,
      episodes: s.episodes.map(e => e.id === ep.id ? {
        ...e,
        number: Number(field(f,'number')) || e.number,
        title,
        topic: field(f,'topic') || e.topic,
        status: nextStatus,
        host: field(f,'host') || e.host,
        guests: field(f,'guests') || e.guests,
        recording: field(f,'recordingText') || formatDateTimeLocal(field(f,'recording'), e.recording),
        publish: field(f,'publishText') || formatDateTimeLocal(field(f,'publish'), e.publish),
        urgent: field(f,'urgent') === 'on',
        progress: nextStatus === 'פורסם' ? 100 : e.progress
      } : e),
      tasks: s.tasks.map(t => t.episode === oldTitle ? { ...t, episode: title } : t),
      messages: s.messages.map(m => m.target === oldTitle ? { ...m, target: title } : m),
      platforms: s.platforms.map(p => p.episode === oldTitle ? { ...p, episode: title } : p),
      sessions: s.sessions.map(ss => ss.episode?.title === oldTitle ? { ...ss, episode: { ...ss.episode, title } } : ss)
    }));
    setEditOpen(false);
  }
  function saveBrief(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const f = ev.currentTarget;
    setStore(s => ({...s, episodes: s.episodes.map(e => e.id === ep.id ? { ...e, brief: field(f,'brief'), contentPlan: field(f,'contentPlan'), coordinationNote: field(f,'coordinationNote'), assetsNote: field(f,'assetsNote') } : e)}));
    setBriefOpen(false);
  }
  function saveAssets(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const f = ev.currentTarget;
    setStore(s => ({...s, episodes: s.episodes.map(e => e.id === ep.id ? {
      ...e,
      driveFolderUrl: field(f,'driveFolderUrl'),
      fullVideoUrl: field(f,'fullVideoUrl'),
      youtubeUrl: field(f,'youtubeUrl'),
      spotifyUrl: field(f,'spotifyUrl'),
      shortsDriveFolderUrl: field(f,'shortsDriveFolderUrl'),
      driveMarketingFolderUrl: field(f,'driveMarketingFolderUrl') || field(f,'shortsDriveFolderUrl'),
      fullVideoFolderUrl: field(f,'fullVideoFolderUrl') || field(f,'fullVideoUrl'),
      fullAudioFolderUrl: field(f,'fullAudioFolderUrl'),
      assetsNote: field(f,'assetsNote'),
    } : e)}));
    setAssetsOpen(false);
  }
  const assetLinks = [
    { key: 'driveFolderUrl', label: 'תיקיית Drive של הפרק', value: ep.driveFolderUrl, hint: 'תיקיית האב של כל חומרי הפרק' },
    { key: 'driveMarketingFolderUrl', label: 'תיקיית סרטוני שיווק', value: ep.driveMarketingFolderUrl || ep.shortsDriveFolderUrl, hint: 'Reels, Shorts, TikTok וסרטונים קצרים', status: ep.driveAssetStatus?.marketing },
    { key: 'fullVideoFolderUrl', label: 'תיקיית הפרק המצולם המלא', value: ep.fullVideoFolderUrl || ep.fullVideoUrl, hint: 'קובץ הווידאו המלא של הפרק', status: ep.driveAssetStatus?.fullVideo },
    { key: 'fullAudioFolderUrl', label: 'תיקיית קובץ שמע מלא', value: ep.fullAudioFolderUrl, hint: 'קובץ האודיו המלא של הפרק', status: ep.driveAssetStatus?.fullAudio },
    { key: 'youtubeUrl', label: 'קישור YouTube', value: ep.youtubeUrl, hint: 'הפרק המלא ביוטיוב אחרי העלאה' },
    { key: 'spotifyUrl', label: 'קישור Spotify', value: ep.spotifyUrl, hint: 'הפרק המלא בספוטיפיי' },
  ];
  const filledAssetLinks = assetLinks.filter(a => a.value).length;
  async function syncDriveAssets() {
    setSyncingDrive(true);
    try {
      const res = await fetch('/api/google/drive/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ episodeId: ep.id }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Drive sync failed');
      const storeRes = await fetch('/api/store', { cache: 'no-store' });
      if (storeRes.ok) setStore(normalizeStore(await storeRes.json()));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'סנכרון Drive נכשל');
    } finally {
      setSyncingDrive(false);
    }
  }

  function assetStatusPill(status?: { fileCount?: number; hasFiles?: boolean }) {
    if (!status) return null;
    return <span className={status.hasFiles ? 'pill green' : 'pill red'}>{status.hasFiles ? `${status.fileCount} קבצים` : 'אין קבצים'}</span>;
  }

  function addTask(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); const f = ev.currentTarget;
    setStore(s => ({...s, tasks: [{ title: field(f,'title'), episode: ep.title, owner: field(f,'owner') || 'בן', due: formatDateTimeLocal(field(f,'due'), field(f,'dueText') || 'ללא דדליין'), type: field(f,'type') || 'כללי', status: 'פתוח' }, ...s.tasks], episodes: s.episodes.map(e => e.id === ep.id ? { ...e, tasks: e.tasks + 1 } : e)}));
    setTaskOpen(false);
  }
  function toggleTask(index: number) {
    const target = episodeTasks[index]; if (!target) return;
    let seen = -1;
    setStore(s => ({...s, tasks: s.tasks.map(t => {
      if (t.episode === ep.title) seen += 1;
      return t.episode === ep.title && seen === index ? { ...t, status: t.status === 'בוצע' ? 'פתוח' : 'בוצע' } : t;
    })}));
  }
  function advance() {
    setStore(s => ({...s, episodes:s.episodes.map(e => { if(e.id!==ep.id) return e; const i=statusFlow.indexOf(e.status); return {...e, status:statusFlow[Math.min(i+1,statusFlow.length-1)], progress:Math.min(100,e.progress+12)}; })}));
  }
  function deleteCurrentEpisode() {
    if(!window.confirm(`למחוק את הפרק “${ep.title}”? הפעולה תמחק גם משימות, נכסי הפצה וסשנים שמחוברים אליו.`)) return;
    setStore(s=>({...s, episodes:s.episodes.filter(e=>e.id!==ep.id), tasks:s.tasks.filter(t=>t.episode!==ep.title), platforms:s.platforms.filter(p=>p.episode!==ep.title), sessions:s.sessions.filter(ss=>ss.episode?.id!==ep.id && ss.episode?.title!==ep.title), messages:s.messages.filter(m=>m.target!==ep.title)}));
    window.location.href='/episodes';
  }

  return <>
    <Head eyebrow="מרכז ניהול פרק" title={ep.title} subtitle="כאן מנהלים את הפרק עצמו: פרטים, בריף, תיאום, משימות, נכסים והפצה — בלי לחזור לרשימה.">
      <Btn onClick={()=>setEditOpen(true)}>עריכת פרטים</Btn><Btn tone="gold" onClick={()=>setTaskOpen(true)}>+ משימה לפרק</Btn><Btn tone="light" onClick={syncDriveAssets}>{syncingDrive ? 'מסנכרן Drive…' : 'סנכרון Drive'}</Btn><Btn tone="light" onClick={()=>setBriefOpen(true)}>בריף ותוכן</Btn><button className="deleteTiny" onClick={deleteCurrentEpisode}>מחק פרק</button>
    </Head>
    <section className="metrics"><Metric n={`#${ep.number}`} label="מספר פרק"/><Metric n={ep.status} label="סטטוס"/><Metric n={`${completedTasks}/${episodeTasks.length}`} label="משימות בוצעו"/><Metric n={filledAssetLinks} label="קישורי נכסים"/></section>
    <section className="grid two">
      <div className="panel dark"><h2>פרטי בסיס</h2><p className="muted">נושא: {ep.topic}<br/>מנחה: {ep.host}<br/>מרואיינים: {ep.guests}<br/>צילום: {cleanDateTime(ep.recording)}<br/>פרסום מתוכנן: {cleanDateTime(ep.publish)}</p><div className="progress"><span style={{width:progress+'%'}}/></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}><button className="btn gold" onClick={advance}>קדם סטטוס</button><Link className="btn light" href="/episodes">חזרה לרשימה</Link></div></div>
      <div className="panel"><h2>תוכן ובריף</h2><div className="list"><div className="row"><span>בריף לפרק</span><span className={ep.brief?'pill green':'pill red'}>{ep.brief?'קיים':'להשלים'}</span></div><div className="row"><span>תוכנית תוכן / שאלות</span><span className={ep.contentPlan?'pill green':'pill'}>{ep.contentPlan?'קיים':'טיוטה'}</span></div><div className="row"><span>תיאום ודגשים</span><span className={ep.coordinationNote?'pill green':'pill red'}>{ep.coordinationNote?'עודכן':'חסר'}</span></div><div className="row"><span>נכסים וחומרים</span><span className={ep.assetsNote?'pill green':'pill'}>{ep.assetsNote?'עודכן':'ממתין'}</span></div></div></div>
    </section>
    <section className="grid three" style={{marginTop:16}}>
      <div className="panel"><h2>תיאום</h2><p className="muted">{ep.coordinationNote || 'אין עדיין הערות תיאום לפרק הזה.'}</p>{sessions.length ? sessions.map((ss,i)=><div className="row" key={i}><span>{ss.studio}</span><span className="pill">{cleanDateTime(ss.time)}</span></div>) : <Link className="btn light" href="/production">קבע סשן צילום</Link>}</div>
      <div className="panel"><h2>משימות</h2><div className="list">{episodeTasks.length ? episodeTasks.map((t,i)=><button className="row click" key={`${t.title}-${i}`} onClick={()=>toggleTask(i)}><span>{t.title}<br/><small className="muted">{t.owner} · {t.type}</small></span><span className={t.status==='בוצע'?'pill green':'pill red'}>{t.status} · {cleanDateTime(t.due)}</span></button>) : <p className="muted">אין עדיין משימות לפרק. אפשר להוסיף מכאן.</p>}</div></div>
      <div className="panel"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',marginBottom:10}}><div><h2>נכסים</h2><p className="muted">כל הקישורים החשובים של הפרק במקום אחד: Drive, YouTube, Spotify וקליפים להפצה.</p>{ep.driveAssetsSyncedAt ? <p className="muted">סונכרן מול Drive: {cleanDateTime(ep.driveAssetsSyncedAt)}</p> : null}</div><button className="miniBtn" onClick={()=>setAssetsOpen(true)}>עריכת נכסים</button></div><div className="list">{assetLinks.map(asset=>asset.value ? <a className="row click assetLinkRow" key={asset.key} href={asset.value} target="_blank" rel="noreferrer"><span><b>{asset.label}</b><br/><small className="muted">{asset.hint}</small></span><span style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'end'}}>{assetStatusPill(asset.status)}<span className="pill green">פתח</span></span></a> : <button className="row click assetLinkRow" key={asset.key} onClick={()=>setAssetsOpen(true)}><span><b>{asset.label}</b><br/><small className="muted">{asset.hint}</small></span><span className="pill red">להוסיף</span></button>)}</div>{ep.assetsNote ? <p className="muted" style={{margin:'14px 0 0'}}>{ep.assetsNote}</p> : null}</div>
    </section>
    <section className="grid two" style={{marginTop:16}}>
      <div className="panel"><h2>הפצה</h2>{episodePlatforms.length ? <div className="table">{episodePlatforms.map(p=><div className="tableRow" key={p.name}><strong>{p.name}</strong><span>{p.asset}</span><span>{p.link}</span><span className="pill">{p.status}</span></div>)}</div> : <p className="muted">עדיין אין פריטי הפצה לפרק הזה.</p>}</div>
      <div className="panel"><h2>לוג פעילות</h2><div className="list"><div className="row"><span>הפרק נמצא בסטטוס {ep.status}</span><span className="pill">עכשיו</span></div><div className="row"><span>{episodeTasks.length} משימות מחוברות לפרק</span><span className="pill">מעודכן</span></div></div></div>
    </section>
    {editOpen && <Modal title="עריכת פרטי פרק" subtitle="שינויים נשמרים בכרטיס הפרק ובקישורים למשימות שלו." onClose={()=>setEditOpen(false)}><form className="smartForm" onSubmit={updateEpisode}><FormRow label="שם הפרק" name="title" required><input name="title" defaultValue={ep.title} required /></FormRow><FormRow label="מספר פרק"><input name="number" defaultValue={ep.number} /></FormRow><FormRow label="נושא / זווית"><input name="topic" defaultValue={ep.topic} /></FormRow><FormRow label="מנחה"><input name="host" defaultValue={ep.host} /></FormRow><FormRow label="מרואיינים"><input name="guests" defaultValue={ep.guests} /></FormRow><FormRow label="סטטוס"><select name="status" defaultValue={ep.status}>{statusFlow.map(s=><option key={s}>{s}</option>)}</select></FormRow><FormRow label="מועד צילום חדש"><input name="recording" type="datetime-local" /></FormRow><FormRow label="או טקסט צילום"><input name="recordingText" defaultValue={ep.recording} /></FormRow><FormRow label="מועד פרסום חדש"><input name="publish" type="datetime-local" /></FormRow><FormRow label="או טקסט פרסום"><input name="publishText" defaultValue={ep.publish} /></FormRow><label className="checkRow"><input type="checkbox" name="urgent" defaultChecked={!!ep.urgent}/> לסמן כדחוף</label><div className="formActions"><button className="btn light" type="button" onClick={()=>setEditOpen(false)}>ביטול</button><button className="btn gold">שמירת שינויים</button></div></form></Modal>}
    {assetsOpen && <Modal title="נכסי הפרק" subtitle="הזינו כאן את כל הקישורים החשובים של הפרק. סנכרון Drive ימלא אוטומטית את תיקיות הפרק." onClose={()=>setAssetsOpen(false)}><form className="smartForm" onSubmit={saveAssets}><FormRow label="תיקיית Drive של הפרק"><input name="driveFolderUrl" type="url" defaultValue={ep.driveFolderUrl || ''} placeholder="https://drive.google.com/..." /></FormRow><FormRow label="תיקיית סרטוני שיווק"><input name="driveMarketingFolderUrl" type="url" defaultValue={ep.driveMarketingFolderUrl || ep.shortsDriveFolderUrl || ''} placeholder="תיקיית Reels / Shorts / TikTok" /></FormRow><FormRow label="תיקיית הפרק המצולם המלא"><input name="fullVideoFolderUrl" type="url" defaultValue={ep.fullVideoFolderUrl || ep.fullVideoUrl || ''} placeholder="תיקיית וידאו מלא" /></FormRow><FormRow label="תיקיית קובץ שמע מלא"><input name="fullAudioFolderUrl" type="url" defaultValue={ep.fullAudioFolderUrl || ''} placeholder="תיקיית אודיו מלא" /></FormRow><input type="hidden" name="fullVideoUrl" value={ep.fullVideoFolderUrl || ep.fullVideoUrl || ''} /><input type="hidden" name="shortsDriveFolderUrl" value={ep.driveMarketingFolderUrl || ep.shortsDriveFolderUrl || ''} /><FormRow label="קישור YouTube"><input name="youtubeUrl" type="url" defaultValue={ep.youtubeUrl || ''} placeholder="https://youtube.com/watch..." /></FormRow><FormRow label="קישור Spotify"><input name="spotifyUrl" type="url" defaultValue={ep.spotifyUrl || ''} placeholder="https://open.spotify.com/..." /></FormRow><label className="formRow wide"><span>הערות על נכסים וחומרים</span><textarea name="assetsNote" rows={4} defaultValue={ep.assetsNote || ''} placeholder="לדוגמה: חסר Thumbnail, מחכה לעריכת אודיו, הקליפים מוכנים להפצה..." /></label><div className="formActions"><button className="btn light" type="button" onClick={()=>setAssetsOpen(false)}>ביטול</button><button className="btn gold">שמירת נכסים</button></div></form></Modal>}
    {briefOpen && <Modal title="בריף ותוכן" subtitle="המידע נשמר בתוך מרכז הפרק." onClose={()=>setBriefOpen(false)}><form className="smartForm" onSubmit={saveBrief}><label className="formRow wide"><span>בריף לפרק</span><textarea name="brief" rows={4} defaultValue={ep.brief || ''}/></label><label className="formRow wide"><span>תוכנית תוכן / שאלות</span><textarea name="contentPlan" rows={4} defaultValue={ep.contentPlan || ''}/></label><label className="formRow wide"><span>תיאום ודגשים</span><textarea name="coordinationNote" rows={4} defaultValue={ep.coordinationNote || ''}/></label><label className="formRow wide"><span>נכסים וחומרים</span><textarea name="assetsNote" rows={4} defaultValue={ep.assetsNote || ''}/></label><div className="formActions"><button className="btn light" type="button" onClick={()=>setBriefOpen(false)}>ביטול</button><button className="btn gold">שמירה</button></div></form></Modal>}
    {taskOpen && <Modal title="משימה חדשה לפרק" subtitle={`המשימה תתחבר ישירות אל ${ep.title}.`} onClose={()=>setTaskOpen(false)}><form className="smartForm" onSubmit={addTask}><FormRow label="שם המשימה" name="title" required/><FormRow label="אחראי" name="owner"/><FormRow label="דדליין"><input name="due" type="datetime-local" /></FormRow><FormRow label="או טקסט דדליין" name="dueText"/><FormRow label="סוג"><select name="type"><option>תוכן</option><option>תיאום</option><option>צילום</option><option>עריכה</option><option>הפצה</option><option>וואטסאפ</option><option>כללי</option></select></FormRow><div className="formActions"><button className="btn light" type="button" onClick={()=>setTaskOpen(false)}>ביטול</button><button className="btn gold">יצירת משימה</button></div></form></Modal>}
  </>;
}

export function TasksClient() {
 const [store,setStore]=useStore(); const [open,setOpen]=useState(false);
 function addTask(ev:FormEvent<HTMLFormElement>){ev.preventDefault(); const f=ev.currentTarget; setStore(s=>({...s,tasks:[{title:field(f,'title'),episode:field(f,'episode')||s.episodes[0]?.title||'כללי',owner:field(f,'owner')||'בן',due:formatDateTimeLocal(field(f,'due'), 'היום'),type:field(f,'type')||'כללי',status:'פתוח'},...s.tasks]})); setOpen(false);}
 function toggle(i:number){setStore(s=>({...s,tasks:s.tasks.map((t,idx)=>idx===i?{...t,status:t.status==='בוצע'?'פתוח':'בוצע'}:t)}));}
 return <><Head eyebrow="משימות" title="מי עושה מה ומתי" subtitle="משימה כוללת פרק, אחראי, דדליין וסוג — כדי שלא תהיה רשימת טקסטים בלי הקשר."><Btn onClick={()=>setOpen(true)}>+ משימה</Btn></Head><section className="metrics"><Metric n={store.tasks.filter(t=>t.status!=='בוצע').length} label="פתוחות"/><Metric n={store.tasks.filter(t=>t.due==='היום').length} label="להיום"/><Metric n="0" label="באיחור"/><Metric n={store.tasks.filter(t=>t.status==='בוצע').length} label="בוצעו"/></section><section className="panel"><h2>כל המשימות</h2><div className="table">{store.tasks.map((t,i)=><div className="tableRow" key={i}><strong>{t.title}</strong><span>{t.episode}</span><span>{t.owner} · {cleanDateTime(t.due)}</span><button className={t.status==='בוצע'?'pill green':'pill red'} onClick={()=>toggle(i)}>{t.status}</button></div>)}</div></section>{open&&<Modal title="משימה חדשה" subtitle="חבר אותה לפרק, לאחראי ולדדליין." onClose={()=>setOpen(false)}><form className="smartForm" onSubmit={addTask}><FormRow label="שם המשימה" name="title" required/><FormRow label="פרק"><select name="episode">{store.episodes.map(e=><option key={e.id}>{e.title}</option>)}<option>כללי</option></select></FormRow><FormRow label="אחראי" name="owner"/><FormRow label="דדליין"><input name="due" type="datetime-local" /></FormRow><FormRow label="סוג"><select name="type"><option>תוכן</option><option>תיאום</option><option>צילום</option><option>עריכה</option><option>הפצה</option><option>וואטסאפ</option><option>כללי</option></select></FormRow><div className="formActions"><button className="btn light" type="button" onClick={()=>setOpen(false)}>ביטול</button><button className="btn gold">יצירת משימה</button></div></form></Modal>}</>;
}

type BufferChannelView = {
 id: string;
 name: string;
 displayName?: string | null;
 descriptor?: string;
 service: string;
 type: string;
 timezone?: string;
 isDisconnected: boolean;
 isLocked: boolean;
 isQueuePaused: boolean;
 externalLink?: string | null;
 manageable?: boolean;
 platformLabel?: string;
};

type BufferStatusView = {
 connected: boolean;
 message?: string;
 account?: { email?: string; name?: string | null; timezone?: string | null };
 organizationId?: string;
 channels: BufferChannelView[];
};

function defaultPostText(episode?: Episode) {
 if (!episode) return '';
 const guests = episode.guests && episode.guests !== '—' ? `\nעם: ${episode.guests}` : '';
 return `פרק חדש בפודקאסט 🎙️\n\n${episode.title}${guests}\n\n${episode.topic}\n\nלינק לפרק: `;
}

function platformName(service: string) {
 const labels: Record<string,string> = { tiktok:'TikTok', instagram:'Instagram', youtube:'YouTube', linkedin:'LinkedIn', facebook:'Facebook', twitter:'X / Twitter', threads:'Threads', pinterest:'Pinterest', bluesky:'Bluesky', mastodon:'Mastodon' };
 return labels[service] || service;
}

function platformStatusClass(status: string) {
 if (status.includes('מוכן')) return 'pill green';
 if (status.includes('צריך') || status.includes('דורש') || status.includes('שגיאה') || status.includes('נכשל')) return 'pill red';
 return 'pill';
}

function looksLikeDriveLink(value: string) {
 return /https?:\/\/(drive|docs)\.google\.com\//.test(value.trim());
}

function platformServiceFromName(name: string) {
 const key = name.toLowerCase().replace(/\s+/g,'');
 if (key.includes('tiktok')) return 'tiktok';
 if (key.includes('instagram')) return 'instagram';
 if (key.includes('youtube')) return 'youtube';
 if (key.includes('linkedin')) return 'linkedin';
 if (key.includes('facebook')) return 'facebook';
 if (key.includes('threads')) return 'threads';
 if (key.includes('pinterest')) return 'pinterest';
 if (key.includes('twitter') || key === 'x') return 'twitter';
 if (key.includes('bluesky')) return 'bluesky';
 if (key.includes('mastodon')) return 'mastodon';
 return '';
}

function platformPriority(name: string) {
 const service = platformServiceFromName(name);
 const order: Record<string, number> = { tiktok: 1, instagram: 2, youtube: 3, linkedin: 4, facebook: 5, threads: 6, twitter: 7 };
 if (service && order[service]) return order[service];
 if (name.includes('Spotify')) return 20;
 if (name.includes('Apple')) return 21;
 return 50;
}

export function DistributionClient(){
 const [store,setStore]=useStore();
 const [buffer,setBuffer]=useState<BufferStatusView | null>(null);
 const [loading,setLoading]=useState(false);
 const [selected,setSelected]=useState<string[]>([]);
 const [episodeId,setEpisodeId]=useState(String(store.episodes.find(e=>e.status==='מוכן לפרסום')?.id || store.episodes[0]?.id || ''));
 const episode=store.episodes.find(e=>String(e.id)===episodeId) || store.episodes[0];
 const [text,setText]=useState(defaultPostText(episode));
 const [dueAt,setDueAt]=useState('');
 const [mediaUrl,setMediaUrl]=useState('');
 const [thumbnailUrl,setThumbnailUrl]=useState('');
 const [tiktokTitle,setTiktokTitle]=useState(episode?.title || '');
 const [isAiGenerated,setIsAiGenerated]=useState(false);
 const [publishAction,setPublishAction]=useState<'draft'|'queue'|'next'|'now'|'scheduled'>('draft');
 const [schedulingType,setSchedulingType]=useState<'automatic'|'notification'>('automatic');
 const [posting,setPosting]=useState(false);
 const [notice,setNotice]=useState('');
 const [drive,setDrive]=useState<{configured:boolean; connected:boolean; redirectUri:string; connection?:{email?:string; name?:string; expiresAt?:string} | null; error?:string} | null>(null);
 const [driveLoading,setDriveLoading]=useState(false);
 const [driveSyncing,setDriveSyncing]=useState(false);
 const ready=store.platforms.filter(p=>p.status.includes('מוכן')).length;
 const needsAssets=store.platforms.filter(p=>p.status.includes('צריך')||p.status.includes('דורש')).length;
 const publishingErrors=store.platforms.filter(p=>p.status.includes('שגיאה')||p.status.includes('נכשל')).length;
 const activeChannels=(buffer?.channels||[]).filter(c=>!c.isDisconnected&&!c.isLocked);
 const selectedChannels=activeChannels.filter(c=>selected.includes(c.id));
 const mediaIsDrive=looksLikeDriveLink(mediaUrl);
 const thumbnailIsDrive=looksLikeDriveLink(thumbnailUrl);
 const platformEntries: [string, { name:string; service:string }][] = [
   ...store.platforms.map((p): [string, { name:string; service:string }] => [platformServiceFromName(p.name)||p.name.toLowerCase(), { name:p.name, service:platformServiceFromName(p.name) }]),
   ...activeChannels.map((c): [string, { name:string; service:string }] => [c.service, { name:c.platformLabel || platformName(c.service), service:c.service }]),
 ];
 const platformAreas=[...new Map(platformEntries).values()].sort((a,b)=>platformPriority(a.name)-platformPriority(b.name));
 const [activePlatformKey,setActivePlatformKey]=useState('tiktok');
 const activePlatform=platformAreas.find(area=>(area.service || area.name.toLowerCase())===activePlatformKey) || platformAreas[0];

 async function loadDrive(){
  setDriveLoading(true);
  try{
   const res=await fetch('/api/google/drive/status',{cache:'no-store'});
   setDrive(await res.json());
  }catch(error){ setDrive({configured:false,connected:false,redirectUri:'https://podkash.vercel.app/api/google/auth/callback',error:error instanceof Error ? error.message : 'שגיאה בבדיקת Drive'}); }
  finally{ setDriveLoading(false); }
 }
 async function disconnectDrive(){
  if(!window.confirm('לנתק את Google Drive מפודקש?')) return;
  await fetch('/api/google/drive/disconnect',{method:'POST'});
  await loadDrive();
 }
 async function syncDrive(){
  setDriveSyncing(true); setNotice('');
  try{
   const res=await fetch('/api/google/drive/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})});
   const data=await res.json();
   if(!res.ok || !data.ok) throw new Error(data.error || 'סנכרון Drive נכשל');
   const storeRes=await fetch('/api/store',{cache:'no-store'});
   if(storeRes.ok) setStore(normalizeStore(await storeRes.json()));
   setNotice(`Drive סונכרן: ${data.syncedEpisodes} פרקים · תיקיית אב: ${data.rootFolder?.name || 'Podkash Episodes'}`);
   await loadDrive();
  }catch(error){ setNotice(error instanceof Error ? error.message : 'סנכרון Drive נכשל'); }
  finally{ setDriveSyncing(false); }
 }
 useEffect(()=>{ loadDrive(); }, []);

 async function loadBuffer(){
  setLoading(true); setNotice('');
  try{
   const res=await fetch('/api/buffer/status',{cache:'no-store'});
   const data=await res.json();
   setBuffer(data);
   if(!res.ok || !data.connected) setNotice(data.message || 'Buffer עדיין לא מחובר');
   else setSelected((data.channels||[]).filter((c:BufferChannelView)=>!c.isDisconnected&&!c.isLocked).map((c:BufferChannelView)=>c.id));
  }catch(error){ setNotice(error instanceof Error ? error.message : 'שגיאה בבדיקת Buffer'); }
  finally{ setLoading(false); }
 }
 function toggleChannel(id:string){ setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]); }
 function chooseEpisode(id:string){ const ep=store.episodes.find(e=>String(e.id)===id); setEpisodeId(id); setText(defaultPostText(ep)); setTiktokTitle(ep?.title || ''); }
 function publishMode(){
  if(publishAction==='now') return 'shareNow';
  if(publishAction==='next') return 'shareNext';
  if(publishAction==='scheduled') return 'customScheduled';
  return 'addToQueue';
 }
 function publishLabel(){
  if(publishAction==='draft') return 'שמירת טיוטה';
  if(publishAction==='now') return 'פרסום עכשיו';
  if(publishAction==='next') return 'ראשון בתור';
  if(publishAction==='scheduled') return 'פרסום מתוזמן';
  return 'הוספה לתור';
 }
 function selectPlatformChannels(channelIds:string[]) {
  setSelected(prev=>[...new Set([...prev, ...channelIds])]);
 }
 async function createBufferPost(channelIds:string[], targetLabel='Buffer'){
  if(publishAction==='scheduled' && !dueAt){ setNotice('בחר תאריך ושעה לפרסום מתוזמן.'); return; }
  if(!channelIds.length){ setNotice(`אין ערוץ Buffer פעיל עבור ${targetLabel}.`); return; }
  if(publishAction!=='draft'){
   const ok=window.confirm(`לאשר ${publishLabel()} דרך Buffer עבור ${targetLabel}? הפעולה תשלח את התוכן לערוצים שנבחרו ולא תשמור כטיוטה בלבד.`);
   if(!ok) return;
  }
  setPosting(true); setNotice('');
  try{
   const res=await fetch('/api/buffer/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channelIds,text,dueAt:dueAt?new Date(dueAt).toISOString():null,mediaUrl:mediaUrl.trim()||null,thumbnailUrl:thumbnailUrl.trim()||null,tiktokTitle:tiktokTitle.trim()||null,isAiGenerated,saveToDraft:publishAction==='draft',mode:publishMode(),schedulingType})});
   const data=await res.json();
   if(!res.ok || !data.ok) throw new Error(data.message || 'שליחה ל־Buffer נכשלה');
   const ok=(data.results||[]).filter((r:{result?:{__typename?:string}})=>r.result?.__typename==='PostActionSuccess').length;
   const failed=(data.results||[]).length-ok;
   const driveNote=mediaIsDrive?' · קישור ה־Drive הומר לקישור הורדה עבור Buffer. אם Buffer נכשל, צריך לוודא שהקובץ פתוח ל־Anyone with the link.':'';
   setNotice(`${targetLabel}: ${publishAction==='draft'?'נוצרו טיוטות':'נשלח לפרסום/תזמון'} עבור ${ok} ערוצים${failed?` · ${failed} נכשלו`:''}${driveNote}.`);
  }catch(error){ setNotice(error instanceof Error ? error.message : 'שליחה ל־Buffer נכשלה'); }
  finally{ setPosting(false); }
 }
 function PlatformManager({ name, service }: { name:string; service:string }){
  const rows=store.platforms.filter(p=>p.name===name || (service && platformServiceFromName(p.name)===service));
  const channels=service ? activeChannels.filter(c=>c.service===service) : [];
  const selectedForPlatform=channels.filter(c=>selected.includes(c.id));
  const channelIds=selectedForPlatform.length ? selectedForPlatform.map(c=>c.id) : channels.map(c=>c.id);
  const isTikTok=service==='tiktok';
  const isBufferSupported=Boolean(channels.length);
  const defaultOpen=isTikTok || rows.some(r=>r.status.includes('צריך')||r.status.includes('דורש')||r.status.includes('מוכן'));
  return <section className="platformWorkspace grid two" aria-label={`ניהול ${name}`}>
   <div className="platformWorkspaceHead panel"><span className={isBufferSupported?'pill green':'pill'}>{name}</span><div><h2>ניהול {name}</h2><p className="muted">{isBufferSupported?`${channels.length} ערוצי Buffer מחוברים · ${selectedForPlatform.length || channels.length} מיועדים לשליחה`:'אין כרגע ערוץ Buffer מחובר — האזור משמש לצ׳קליסט ונכסים.'}</p></div></div>
   <div className="platformWorkspaceBody grid two">
    <div className={isTikTok?'panel dark':'panel'}><h2>סטטוס ונכסים</h2>{rows.length?<div className="list">{rows.map((p,i)=><div className="row" key={`${p.name}-${p.episode}-${i}`}><span><b>{p.episode}</b><br/><small className="muted">{p.asset}</small></span><span className={platformStatusClass(p.status)}>{p.status}</span></div>)}</div>:<p className="muted">אין עדיין משימת נכסים רשומה לפלטפורמה הזאת.</p>}{channels.length?<><h3 style={{marginTop:16}}>ערוצים מחוברים</h3><div className="list">{channels.map(c=><button className="row click" key={c.id} onClick={()=>toggleChannel(c.id)}><span><b>{c.displayName || c.name}</b><br/><small className="muted">{c.externalLink || c.descriptor || c.type}{c.isQueuePaused?' · התור מושהה':''}</small></span><span className={selected.includes(c.id)?'pill green':'pill'}>{selected.includes(c.id)?'נבחר':'לא נבחר'}</span></button>)}</div><button className="btn light" type="button" style={{marginTop:12}} onClick={()=>selectPlatformChannels(channels.map(c=>c.id))}>בחר את כל ערוצי {name}</button></>:<p className="muted" style={{marginTop:14}}>כדי לפרסם מכאן, חבר/רענן את {name} בתוך Buffer ואז לחץ “סנכרון Buffer”.</p>}{isTikTok?<p className="muted" style={{marginTop:14}}>TikTok תומך כאן גם בקישור Google Drive לקובץ וידאו, Thumbnail, כותרת וסימון תוכן AI. קובץ Drive חייב להיות פתוח ל־Anyone with the link.</p>:null}</div>
    <div className="panel"><h2>פרסום ל־{name}</h2><div className="smartForm"><FormRow label="פרק"><select value={episodeId} onChange={e=>chooseEpisode(e.target.value)}>{store.episodes.map(e=><option key={e.id} value={e.id}>{`#${e.number} · ${e.title}`}</option>)}</select></FormRow><FormRow label="פעולה ב־Buffer"><select value={publishAction} onChange={e=>setPublishAction(e.target.value as typeof publishAction)}><option value="draft">טיוטה בלבד</option><option value="queue">הוספה לתור</option><option value="next">פרסום הבא בתור</option><option value="scheduled">פרסום בתאריך ושעה</option><option value="now">פרסום עכשיו</option></select></FormRow><FormRow label="סוג פרסום"><select value={schedulingType} onChange={e=>setSchedulingType(e.target.value as typeof schedulingType)}><option value="automatic">פרסום אוטומטי</option><option value="notification">התראת פרסום ידנית</option></select></FormRow><FormRow label="תזמון"><input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} disabled={publishAction!=='scheduled'} /></FormRow><FormRow label="קישור וידאו / Google Drive"><input value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} placeholder="קישור Drive או https://...mp4 / mov / webm" /></FormRow><FormRow label="Thumbnail / Google Drive אופציונלי"><input value={thumbnailUrl} onChange={e=>setThumbnailUrl(e.target.value)} placeholder="קישור תמונה או Drive" /></FormRow>{mediaIsDrive?<p className="muted formRow wide" style={{margin:0}}>זוהה קישור Drive — המערכת תמיר אותו אוטומטית לקישור הורדה עבור Buffer.</p>:null}{thumbnailIsDrive?<p className="muted formRow wide" style={{margin:0}}>זוהה Thumbnail מדרייב — המערכת תמיר אותו לתצוגת תמונה ציבורית.</p>:null}{isTikTok?<><FormRow label="כותרת TikTok"><input value={tiktokTitle} onChange={e=>setTiktokTitle(e.target.value)} /></FormRow><label className="checkRow"><input type="checkbox" checked={isAiGenerated} onChange={e=>setIsAiGenerated(e.target.checked)} /> לסמן ל־TikTok שהתוכן כולל AI</label></>:null}<label className="formRow wide"><span>טקסט / Caption</span><textarea rows={7} value={text} onChange={e=>setText(e.target.value)} /></label><div className="formActions"><button className="btn light" type="button" onClick={()=>setText(defaultPostText(episode))}>איפוס טקסט</button><button className="btn gold" type="button" onClick={()=>createBufferPost(channelIds,name)} disabled={!buffer?.connected || !isBufferSupported || !text.trim() || posting}>{posting?'שולח…':publishAction==='draft'?`צור טיוטת ${name}`:`פרסם ל־${name}`}</button></div></div><p className="muted">פרסום שאינו טיוטה מבקש אישור בדפדפן לפני השליחה.</p></div>
   </div>
  </section>;
 }
 return <><Head eyebrow="הפצה ומדיה" title="מרכז ניהול פלטפורמות" subtitle="לכל פלטפורמה יש אזור ניהול משלה: נכסים, ערוצי Buffer, תוכן, תזמון ופרסום." ><button className="btn dark" onClick={loadBuffer} disabled={loading}>{loading?'בודק Buffer…':'סנכרון Buffer'}</button><button className="btn light" disabled title="בקרוב">ייצא צ׳קליסט</button></Head>
 <section className="metrics"><Metric n={store.platforms.length} label="פלטפורמות במערכת"/><Metric n={ready} label="מוכנות לפרסום"/><Metric n={needsAssets} label="דורשות נכסים"/><Metric n={buffer?.connected?activeChannels.length:'לא מחובר'} label="ערוצי Buffer"/></section>

 <section className="panel drivePanel" style={{marginBottom:16}}><div className="drivePanelHead"><div><span className={drive?.connected?'pill green':drive?.configured?'pill blue':'pill red'}>{driveLoading?'בודק…':drive?.connected?'Drive מחובר':drive?.configured?'מוכן לחיבור':'צריך הגדרה'}</span><h2>Google Drive מלא</h2><p className="muted">חיבור מאובטח מאחורי סיסמת המנהל, עם הרשאה מלאה ל־Drive. הסנכרון יוצר לכל פרק תיקיית Drive מסודרת עם תיקיות משנה: סרטוני שיווק, הפרק המצולם המלא וקובץ שמע מלא — ומעדכן את אזור הנכסים בפרקים.</p></div><div className="headAction">{drive?.configured ? <a className="btn gold" href="/api/google/auth/start">חיבור Drive</a> : <button className="btn gold" disabled>חסר Client ID</button>}{drive?.connected ? <button className="btn dark" onClick={syncDrive} disabled={driveSyncing}>{driveSyncing?'מסנכרן…':'סנכרון מלא עכשיו'}</button> : null}{drive?.connected ? <button className="btn light" onClick={disconnectDrive}>ניתוק</button> : null}<button className="btn light" onClick={loadDrive}>רענון</button></div></div>{drive?.connected ? <div className="list"><div className="row"><span>חשבון מחובר</span><b>{drive.connection?.email || drive.connection?.name || 'Google Drive'}</b></div><div className="row"><span>Token פעיל עד</span><b>{cleanDateTime(drive.connection?.expiresAt)}</b></div><div className="row"><span>מבנה סנכרון</span><b>Podkash Episodes / #פרק - שם הפרק / תיקיות נכסים</b></div></div> : <div className="list"><div className="row"><span>Redirect URI להגדרה בגוגל</span><code className="inlineCode">{drive?.redirectUri || 'https://podkash.vercel.app/api/google/auth/callback'}</code></div>{drive?.configured ? <div className="row"><span>סטטוס</span><b>הפרויקט מוגדר. אפשר ללחוץ “חיבור Drive”.</b></div> : <div className="row"><span>סטטוס</span><b>צריך להוסיף GOOGLE_CLIENT_ID ו־GOOGLE_CLIENT_SECRET ב־Vercel.</b></div>}</div>}</section>
 <nav className="platformTabs" aria-label="בחירת פלטפורמה לניהול">{platformAreas.map(area=>{ const key=area.service || area.name.toLowerCase(); const channels=area.service ? activeChannels.filter(c=>c.service===area.service) : []; const rows=store.platforms.filter(p=>p.name===area.name || (area.service && platformServiceFromName(p.name)===area.service)); const active=key===(activePlatform?.service || activePlatform?.name.toLowerCase()); return <button key={key} type="button" className={`platformTab ${active?'on':''}`} onClick={()=>setActivePlatformKey(key)} aria-pressed={active}><b>{area.name}</b><small>{channels.length?`${channels.length} ערוצי Buffer`:rows[0]?.status || 'ניהול'}</small></button>; })}</nav>
 {notice&&<section className="panel" style={{marginBottom:16}} role="status" aria-live="polite"><p className="muted" style={{margin:0}}>{notice}</p></section>}
 {publishingErrors>0?<section className="panel" style={{marginBottom:16}}><p className="muted" style={{margin:0}}>יש {publishingErrors} פלטפורמות עם שגיאת פרסום/כשל שדורשות בדיקה.</p></section>:null}
 {activePlatform?<PlatformManager key={`${activePlatform.service || activePlatform.name}`} name={activePlatform.name} service={activePlatform.service} />:null}
 <details className="disclosurePanel"><summary><span className="pill blue">כללי</span><div><h2>שליחה מרוכזת לכל הערוצים</h2><p className="muted">לשימוש כשצריך ליצור או לפרסם אותו תוכן בכמה פלטפורמות יחד.</p></div></summary><div className="disclosureBody"><section className="panel"><div className="list"><div className="row"><span>פעולה</span><b>{publishLabel()}</b></div><div className="row"><span>ערוצים נבחרים</span><b>{selectedChannels.length}</b></div><div className="row"><span>סוג פרסום</span><b>{schedulingType==='automatic'?'אוטומטי':'התראה ידנית'}</b></div></div><button className="btn gold" style={{marginTop:14}} type="button" onClick={()=>createBufferPost(selected,'כל הפלטפורמות')} disabled={!buffer?.connected || !selected.length || !text.trim() || posting}>{posting?'שולח…':publishAction==='draft'?'צור טיוטות לכל הערוצים':'שלח לכל הערוצים'}</button></section></div></details>
 </>;
}

export function MessagesClient(){
 const [store,setStore]=useStore(); const [open,setOpen]=useState(false);
 function add(ev:FormEvent<HTMLFormElement>){ev.preventDefault(); const f=ev.currentTarget; setStore(s=>({...s,messages:[{name:field(f,'name'),target:field(f,'target')||'כללי',status:field(f,'status')||'טיוטה',body:field(f,'body')},...s.messages]})); setOpen(false);}
 function copy(body:string){navigator.clipboard?.writeText(body); alert('ההודעה הועתקה');}
 return <><Head eyebrow="הודעות ותזכורות" title="וואטסאפ עם אישור אנושי" subtitle="תבנית כוללת יעד, סטטוס וטקסט עם משתנים — כדי שתהיה שמישה ולא רק פתק."><Btn onClick={()=>setOpen(true)}>+ תבנית</Btn></Head><section className="grid three">{store.messages.map((m,i)=><article className="message" key={i}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start'}}><div><h2 style={{margin:'0 0 6px'}}>{m.name}</h2><p className="muted" style={{margin:0}}>יעד: {m.target}</p></div><span className="pill">{m.status}</span></div><pre>{m.body}</pre><button className="btn gold" style={{marginTop:14}} onClick={()=>copy(m.body)}>העתק לוואטסאפ</button></article>)}</section>{open&&<Modal title="תבנית הודעה חדשה" subtitle="אפשר להשתמש במשתנים כמו {{שם}}, {{שם הפרק}}, {{שעה}}, {{מיקום}}." onClose={()=>setOpen(false)}><form className="smartForm" onSubmit={add}><FormRow label="שם התבנית" name="name" required/><FormRow label="יעד"><select name="target"><option>מרואיין</option><option>מנחה</option><option>קבוצת צוות</option><option>סושיאל</option><option>כללי</option></select></FormRow><FormRow label="סטטוס"><select name="status"><option>טיוטה</option><option>דורש אישור</option><option>מוכן להעתקה</option></select></FormRow><TextArea label="טקסט ההודעה" name="body" required/><div className="formActions"><button className="btn light" type="button" onClick={()=>setOpen(false)}>ביטול</button><button className="btn gold">שמירת תבנית</button></div></form></Modal>}</>;
}

function calPad(n: number) { return String(n).padStart(2, '0'); }
function calDateKey(d: Date) { return `${d.getFullYear()}-${calPad(d.getMonth() + 1)}-${calPad(d.getDate())}`; }
function calMinToLabel(min: number) { return `${calPad(Math.floor(min / 60))}:${calPad(min % 60)}`; }

function CalendarView({ store }: { store: Store }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [role, setRole] = useState<'admin' | 'host'>('host');
  const [myHostId, setMyHostId] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/bookings', { cache: 'no-store' });
    if (res.ok) { const d = await res.json(); setBookings(d.bookings || []); setRole(d.role || 'host'); setMyHostId(d.hostId || ''); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addBooking(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); setError('');
    const f = ev.currentTarget; const get = (n: string) => String(new FormData(f).get(n) || '').trim();
    const startRaw = get('start'); const endRaw = get('end');
    if (!startRaw || !endRaw) { setError('יש לבחור שעת התחלה וסיום'); return; }
    const ep = store.episodes.find(e => String(e.id) === get('episode'));
    setSaving(true);
    const res = await fetch('/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startAt: new Date(startRaw).toISOString(), endAt: new Date(endRaw).toISOString(), studio: get('studio') || 'אולפן', episodeId: ep?.id ?? null, episodeTitle: ep?.title || 'צילום' }),
    });
    const d = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setError(d.error || 'שגיאה בקביעת הזמן'); return; }
    setOpen(false); load();
  }
  async function decide(id: string, action: 'approve' | 'reject') {
    const res = await fetch('/api/bookings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'שגיאה'); }
    load();
  }
  async function cancelBooking(id: string) {
    if (!window.confirm('לבטל את ההזמנה?')) return;
    await fetch(`/api/bookings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  const parsed = bookings.map(b => { const s = new Date(b.startAt); const e = new Date(b.endAt); const startMin = s.getHours() * 60 + s.getMinutes(); let endMin = e.getHours() * 60 + e.getMinutes(); if (endMin <= startMin) endMin = startMin + 60; return { b, date: s, dateKey: calDateKey(s), startMin, endMin }; });
  const dayMap = new Map<string, typeof parsed>();
  for (const p of parsed) { const arr = dayMap.get(p.dateKey) || []; arr.push(p); dayMap.set(p.dateKey, arr); }
  const days = Array.from(dayMap.entries()).map(([key, items]) => ({ key, date: items[0].date, items: items.slice().sort((a, b) => a.startMin - b.startMin) })).sort((a, b) => a.date.getTime() - b.date.getTime());
  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  const weekdayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long' });
  const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'short' });
  const longFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const head = <Head eyebrow="יומן אולפן" title="יומן צילומים משותף" subtitle="כל ההזמנות במקום אחד. זמן תפוס נחסם אוטומטית; הזמנות של מנחים ממתינות לאישור המנהל."><Btn onClick={() => setOpen(true)}>+ זמן צילום</Btn></Head>;

  const modal = open && <Modal title="קביעת זמן צילום" subtitle="בחר פרק, אולפן ושעות. אם הזמן כבר תפוס — תקבל התראה ולא תיווצר התנגשות." onClose={() => setOpen(false)}>
    <form className="smartForm" onSubmit={addBooking}>
      <FormRow label="פרק"><select name="episode">{store.episodes.length ? store.episodes.map(e => <option key={e.id} value={e.id}>{e.title}</option>) : <option value="">— אין פרקים —</option>}</select></FormRow>
      <FormRow label="אולפן / מיקום"><input name="studio" defaultValue="אולפן" /></FormRow>
      <FormRow label="תחילת צילום"><input name="start" type="datetime-local" required /></FormRow>
      <FormRow label="סיום צילום"><input name="end" type="datetime-local" required /></FormRow>
      {error && <p className="joinError" style={{ gridColumn: '1/-1' }}>{error}</p>}
      <div className="formActions"><button className="btn light" type="button" onClick={() => setOpen(false)}>ביטול</button><button className="btn gold" disabled={saving}>{saving ? 'בודק…' : 'קבע זמן'}</button></div>
    </form>
  </Modal>;

  function rowActions(b: Booking) {
    const canCancel = role === 'admin' || b.ownerHostId === myHostId;
    return <div className="calRowActions">
      {role === 'admin' && b.status === 'pending' && <><button className="miniBtn" onClick={() => decide(b.id, 'approve')}>אשר</button><button className="deleteTiny" onClick={() => decide(b.id, 'reject')}>דחה</button></>}
      {canCancel && <button className="deleteTiny" onClick={() => cancelBooking(b.id)}>בטל</button>}
    </div>;
  }

  if (selectedKey) {
    const day = days.find(d => d.key === selectedKey);
    if (day) {
      const minHour = Math.max(0, Math.floor(Math.min(...day.items.map(p => p.startMin)) / 60) - 1);
      const maxHour = Math.min(24, Math.ceil(Math.max(...day.items.map(p => p.endMin)) / 60) + 1);
      const hours: number[] = []; for (let h = minHour; h <= maxHour; h++) hours.push(h);
      const totalPx = (maxHour - minHour) * 60;
      const evs = day.items.slice().sort((a, b) => a.startMin - b.startMin).map(p => ({ p, startMin: p.startMin, endMin: p.endMin, lane: 0, lanes: 1 }));
      const laneEnds: number[] = [];
      for (const ev of evs) { let placed = false; for (let i = 0; i < laneEnds.length; i++) { if (laneEnds[i] <= ev.startMin) { ev.lane = i; laneEnds[i] = ev.endMin; placed = true; break; } } if (!placed) { ev.lane = laneEnds.length; laneEnds.push(ev.endMin); } }
      const laneCount = Math.max(1, laneEnds.length);
      evs.forEach(ev => { ev.lanes = laneCount; });
      return <>
        {head}
        <button className="btn light calBack" onClick={() => setSelectedKey(null)}>‹ חזרה לכל הימים</button>
        <h2 className="calDayTitle">{longFmt.format(day.date)}</h2>
        <div className="calTimeline" style={{ height: totalPx }}>
          {hours.map(h => <div className="calHour" key={h} style={{ top: (h - minHour) * 60 }}><span className="calHourLabel">{calPad(h)}:00</span></div>)}
          <div className="calEventsLayer">
            {evs.map((ev, i) => { const b = ev.p.b; const pend = b.status === 'pending'; return <div className={`calEvent${pend ? ' pending' : ''}`} key={i} style={{ top: ev.startMin - minHour * 60, height: Math.max(38, ev.endMin - ev.startMin), right: `${(ev.lane / ev.lanes) * 100}%`, width: `calc(${100 / ev.lanes}% - 6px)` }}>
              <b>{b.episodeTitle}</b>
              <span>{calMinToLabel(ev.startMin)}–{calMinToLabel(ev.endMin)} · {b.studio}</span>
              <small>{b.ownerName}{pend ? ' · ממתין' : ''}</small>
            </div>; })}
          </div>
        </div>
        <div className="calNoTime" style={{ marginTop: 16 }}>{day.items.map(p => { const b = p.b; const pend = b.status === 'pending'; return <div className="row" key={b.id} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 150 }}><h3 style={{ margin: 0 }}>{b.episodeTitle} {pend && <span className="pill" style={{ background: '#fff0d6', color: '#8a5a12' }}>ממתין לאישור</span>}</h3><p className="muted" style={{ margin: '4px 0 0' }}>{calMinToLabel(p.startMin)}–{calMinToLabel(p.endMin)} · {b.studio} · נקבע ע״י {b.ownerName}</p></div>
          {rowActions(b)}
        </div>; })}</div>
        {modal}
      </>;
    }
  }

  return <>
    {head}
    {role === 'admin' && pendingCount > 0 && <div className="credBox" style={{ background: '#fff7e9', borderColor: '#f0d8a8' }}><b>{pendingCount} הזמנות ממתינות לאישורך</b><p className="muted" style={{ margin: '4px 0 0' }}>היכנס ליום הרלוונטי כדי לאשר או לדחות.</p></div>}
    {loading ? <p className="muted">טוען יומן…</p> : <section className="calDays">
      {days.length ? days.map(d => {
        const pend = d.items.filter(p => p.b.status === 'pending').length;
        return <button className="calDayCard" key={d.key} onClick={() => setSelectedKey(d.key)}>
          <div className="calDayDate"><b>{d.date.getDate()}</b><span>{monthFmt.format(d.date)}</span></div>
          <div className="calDayInfo"><h3>{weekdayFmt.format(d.date)}</h3><p className="muted">{d.items.length} צילומים · החל מ-{calMinToLabel(d.items[0].startMin)}{pend ? ` · ${pend} ממתינים` : ''}</p></div>
          <span className="calDayChevron">‹</span>
        </button>;
      }) : <p className="muted">אין עדיין ימי צילום. לחץ «+ זמן צילום» כדי לקבוע.</p>}
    </section>}
    {modal}
  </>;
}

function ProductionSessions({ store }: { store: Store }) {
  return <section className="grid two">{store.sessions.map((ss, i) => <article className="panel" key={i}><h2 className="timeTitle">{cleanDateTime(ss.time)}</h2><p className="muted">{ss.episode?.title || 'פרק ללא שם'}<br />{ss.studio}<br />מנחה: {ss.episode?.host || '—'} · מרואיינים: {ss.episode?.guests || '—'}</p><div className="list" style={{ marginTop: 14 }}>{ss.confirmations.map(c => <div className="row" key={c}><span>{c}</span><span className="pill green">אושר</span></div>)}{ss.missing.map(m => <div className="row" key={m}><span>{m}</span><span className="pill red">חסר</span></div>)}</div></article>)}</section>;
}

export function SessionsClient({ context='calendar' }: { context?: 'calendar' | 'production' }) {
 const [store,setStore]=useStore(); const [open,setOpen]=useState(false);
 function add(ev:FormEvent<HTMLFormElement>){ev.preventDefault(); const f=ev.currentTarget; const ep=store.episodes.find(e=>e.title===field(f,'episode')) || store.episodes[0]; const startAt=field(f,'start'); const endAt=field(f,'end'); const time=formatDateTimeRange(startAt, endAt); const session: Session = { episode: ep, studio: field(f,'studio')||'אולפן תל אביב', time, startAt, endAt, confirmations: [], missing: ['אישור מנחה','אישור מרואיין','אישור אולפן'] }; setStore(s=>({...s,sessions:[session,...s.sessions], episodes:s.episodes.map(e=>e.id===ep.id?{...e,recording:time,status:e.status==='רעיון'?'בתיאום':e.status}:e)})); setOpen(false);}
 if (context !== 'production') return <CalendarView store={store} />;
 return <><Head eyebrow="הפקה וצילום" title="תיאום סשנים בלי נפילות" subtitle="קביעת סשן צילום עם תאריך ושעה, אולפן, פרק ואישורים."><Btn onClick={()=>setOpen(true)}>+ סשן צילום</Btn></Head><ProductionSessions store={store} />{open&&<Modal title="סשן צילום חדש" subtitle="בחר פרק, אולפן, תאריך ושעת התחלה/סיום." onClose={()=>setOpen(false)}><form className="smartForm" onSubmit={add}><FormRow label="פרק"><select name="episode">{store.episodes.map(e=><option key={e.id}>{e.title}</option>)}</select></FormRow><FormRow label="אולפן / מיקום" name="studio"/><FormRow label="תחילת צילום"><input name="start" type="datetime-local" required /></FormRow><FormRow label="סיום צילום"><input name="end" type="datetime-local" /></FormRow><div className="formActions"><button className="btn light" type="button" onClick={()=>setOpen(false)}>ביטול</button><button className="btn gold">שמירה</button></div></form></Modal>}</>;
}

export function PeopleClient(){
 const [store,setStore]=useStore(); const [open,setOpen]=useState(false);
 function add(ev:FormEvent<HTMLFormElement>){ev.preventDefault(); const f=ev.currentTarget; setStore(s=>({...s,people:[{name:field(f,'name'),role:field(f,'role')||'מרואיין',type:field(f,'type')||'guest',phone:field(f,'phone'),episodes:0,note:field(f,'note')},...s.people]})); setOpen(false);}
 function deletePerson(name:string){ if(!window.confirm(`למחוק את איש הקשר “${name}”?`)) return; setStore(s=>({...s, people:s.people.filter(p=>p.name!==name)})); }
 return <><Head eyebrow="אנשים" title="מנחים, מרואיינים וצוות" subtitle="איש קשר כולל תפקיד, טלפון והערות הפקה — כדי שאפשר יהיה לתאם ולזכור הקשרים."><Btn onClick={()=>setOpen(true)}>+ איש קשר</Btn></Head><section className="grid three">{store.people.map(p=><article className="panel" key={p.name}><div className="person"><div className="avatar">{p.name[0]}</div><div><h2 style={{margin:0}}>{p.name}</h2><p className="muted" style={{margin:'4px 0 0'}}>{p.role}</p></div><button className="deleteTiny" onClick={()=>deletePerson(p.name)} aria-label={`מחיקת ${p.name}`}>מחק</button></div><div className="list" style={{marginTop:14}}><div className="row"><span>טלפון</span><b>{p.phone||'—'}</b></div>{p.email&&<div className="row"><span>אימייל</span><b>{p.email}</b></div>}<div className="row"><span>פרקים</span><b>{p.episodes}</b></div><div className="row"><span>הערה</span><p>{p.note||'—'}</p></div></div></article>)}</section>{open&&<Modal title="איש קשר חדש" subtitle="מתאים למנחים, מרואיינים, עורכים, סושיאל ואנשי אולפן." onClose={()=>setOpen(false)}><form className="smartForm" onSubmit={add}><FormRow label="שם מלא" name="name" required/><FormRow label="תפקיד מוצג" name="role"/><FormRow label="סוג"><select name="type"><option value="guest">מרואיין</option><option value="host">מנחה</option><option value="producer">מפיק/ה</option><option value="editor">עורך/ת</option><option value="social">סושיאל</option><option value="studio">אולפן</option></select></FormRow><FormRow label="טלפון" name="phone"/><TextArea label="הערות / העדפות / הקשר" name="note"/><div className="formActions"><button className="btn light" type="button" onClick={()=>setOpen(false)}>ביטול</button><button className="btn gold">שמירת איש קשר</button></div></form></Modal>}</>;
}
