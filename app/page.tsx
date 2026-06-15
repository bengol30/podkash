import { AppShell, Button, Metric, PageHead } from '@/components/AppShell';
import { readStore } from '@/lib/db';
import { seedStore } from '@/lib/store-types';
import { cleanDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function Dashboard(){
 let store = seedStore;
 let storeError: string | null = null;
 try {
  store = await readStore();
 } catch (error) {
  storeError = error instanceof Error ? error.message : 'תקלה לא ידועה בחיבור למסד הנתונים';
  console.error('[podkash-dashboard]', error);
 }
 const urgent=store.episodes.filter(e=>e.urgent); const open=store.tasks.filter(t=>t.status!=='בוצע'); const today=open.filter(t=>t.due==='היום');
 const openTasksFor = (title:string) => open.filter(t=>t.episode===title).length;
 return <AppShell active="/"><PageHead eyebrow="סקירה יומית" title="מה צריך לקרות עכשיו?" subtitle="דשבורד קצר שמראה צילומים קרובים, פרקים תקועים, משימות דחופות והפצה שמחכה לטיפול." action={<><Button href="/episodes">+ פרק חדש</Button><Button href="/messages" tone="light">הודעה מהירה</Button></>}/>
 {storeError && <section className="panel" style={{border:'1px solid #ef4444', background:'#fff1f2', marginBottom:16}}><h2>המערכת לא מחוברת למסד הנתונים</h2><p>הנתונים שמוצגים כרגע הם נתוני דמו בלבד, כדי לא להטעות כאילו המידע נמחק. צריך להגדיר DATABASE_URL/POSTGRES_URL תקין ב־Vercel ולפרוס מחדש.</p><p className="muted">שגיאה: {storeError}</p></section>}
 <section className="metrics"><Metric n={store.episodes.filter(e=>e.status==='צילום נקבע').length} label="צילומים קרובים"/><Metric n={store.episodes.filter(e=>e.status==='בעריכה').length} label="בעריכה"/><Metric n={open.length} label="משימות פתוחות"/><Metric n={store.episodes.filter(e=>e.status==='מוכן לפרסום').length} label="מוכנים לפרסום"/></section>
 <section className="grid two"><div className="panel dark"><h2>מוקדי תשומת לב</h2><div className="list">{urgent.length ? urgent.map(e=><div className="row" key={e.id}><div><h3>{e.title}</h3><p>{e.status} · {cleanDateTime(e.recording)} · {openTasksFor(e.title)} משימות פתוחות</p><div className="progress"><span style={{width:e.progress+'%'}}/></div></div><span className="pill red">דחוף</span></div>) : <p className="muted">אין כרגע פרקים שסומנו כדחופים.</p>}</div></div>
 <div className="panel"><h2>משימות היום</h2><div className="list">{today.length ? today.map(t=><div className="row" key={t.title}><div><h3>{t.title}</h3><p>{t.episode}<br/>{t.owner} · {cleanDateTime(t.due)}</p></div><span className="pill">{t.type}</span></div>) : <p className="muted">אין משימות שמסומנות להיום.</p>}</div></div></section>
 <section className="grid three" style={{marginTop:16}}><div className="panel"><h3>תהליך פרק</h3><p className="muted">רעיון → תוכן → תיאום → צילום → עריכה → אישור → הפצה.</p></div><div className="panel"><h3>וואטסאפ</h3><p className="muted">ב־MVP הודעות מוכנות להעתקה ואישור אנושי, בלי אוטומציה מסוכנת לקבוצות.</p></div><div className="panel"><h3>הפצה</h3><p className="muted">מעקב לפי פלטפורמה: נכסים, טקסט, סטטוס ולינק אחרי פרסום.</p></div></section>
 </AppShell>
}
