'use client';

import { FormEvent, useMemo, useState } from 'react';

type Kind = 'guest' | 'host';
type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkboxes' | 'radio' | 'checkbox';
  required?: boolean;
  options?: string[];
  wide?: boolean;
};

const topicOptions = ['יזמות ועסקים','קריירה','חברה וקהילה','בריאות ונפש','זוגיות ומשפחה','חינוך','תרבות ואמנות','טכנולוגיה','סיפור אישי','רוחניות והתפתחות אישית','התפתחות אישית','אחר'];

const baseFields: Field[] = [
  { name: 'name', label: 'שם מלא', required: true },
  { name: 'age', label: 'גיל', type: 'number' },
  { name: 'city', label: 'עיר מגורים' },
  { name: 'phone', label: 'טלפון', type: 'tel', required: true },
  { name: 'email', label: 'אימייל', type: 'email', required: true },
  { name: 'links', label: 'לינק לרשתות חברתיות / אתר / לינקדאין, אם יש', wide: true },
  { name: 'displayName', label: 'איך תרצו שיוצג השם שלכם בפרק?', wide: true },
];

const guestFields: Field[] = [
  { name: 'about', label: 'ספרו בכמה משפטים מי אתם', type: 'textarea', required: true, wide: true },
  { name: 'occupation', label: 'במה אתם עוסקים כיום?', wide: true },
  { name: 'mainTopic', label: 'על מה הייתם רוצים לדבר בפודקאסט?', type: 'textarea', required: true, wide: true },
  { name: 'topics', label: 'באילו תחומים הנושא שלכם מתאים?', type: 'checkboxes', options: topicOptions, wide: true },
  { name: 'availability', label: 'באילו ימים ושעות נוח לכם להגיע להקלטה?', type: 'textarea', required: true, wide: true },
  { name: 'extra', label: 'משהו נוסף שחשוב לנו לדעת?', type: 'textarea', wide: true },
];

const hostFields: Field[] = [
  { name: 'about', label: 'ספרו בכמה משפטים מי אתם', type: 'textarea', required: true, wide: true },
  { name: 'background', label: 'מה הרקע שלכם והאם יש לכם ניסיון בהנחיה/ראיונות/תוכן?', type: 'textarea', wide: true },
  { name: 'whyHost', label: 'למה אתם רוצים להנחות פרק בפודקש?', type: 'textarea', required: true, wide: true },
  { name: 'topics', label: 'באילו נושאים הייתם רוצים להנחות פרקים?', type: 'checkboxes', options: topicOptions, wide: true },
  { name: 'episodeTopic', label: 'יש נושא מסוים או רעיון לפרק שתרצו לבנות?', type: 'textarea', wide: true },
  { name: 'hasGuest', label: 'האם יש לכם כבר מרואיין/ת לפרק?', type: 'select', options: ['כן', 'לא', 'אולי'] },
  { name: 'availability', label: 'באילו ימים ושעות נוח לכם להקליט?', type: 'textarea', required: true, wide: true },
  { name: 'extra', label: 'משהו נוסף שחשוב לנו לדעת?', type: 'textarea', wide: true },
];

function collect(form: HTMLFormElement) {
  const fd = new FormData(form);
  const data: Record<string, string> = {};
  for (const [key] of fd.entries()) {
    if (data[key]) continue;
    const all = fd.getAll(key).map(String).filter(Boolean);
    data[key] = all.join(', ');
  }
  return data;
}

function FieldControl({ field }: { field: Field }) {
  const cls = `joinField ${field.wide ? 'wide' : ''}`;
  if (field.type === 'textarea') return <label className={cls}><span>{field.label}{field.required && ' *'}</span><textarea name={field.name} rows={4} required={field.required} /></label>;
  if (field.type === 'select') return <label className={cls}><span>{field.label}{field.required && ' *'}</span><select name={field.name} required={field.required}><option value="">בחרו</option>{field.options?.map(o => <option key={o}>{o}</option>)}</select></label>;
  if (field.type === 'checkboxes' || field.type === 'radio') return <fieldset className={cls}><legend>{field.label}{field.required && ' *'}</legend><div className="optionGrid">{field.options?.map(o => <label key={o} className="joinOption"><input type={field.type === 'radio' ? 'radio' : 'checkbox'} name={field.name} value={o} required={field.required && field.type === 'radio'} /> {o}</label>)}</div></fieldset>;
  return <label className={cls}><span>{field.label}{field.required && ' *'}</span><input name={field.name} type={field.type || 'text'} required={field.required} /></label>;
}

export function JoinFormClient() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const fields = useMemo(() => [...baseFields, ...(kind === 'host' ? hostFields : guestFields)], [kind]);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!kind) return;
    setError('');
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: kind, data: collect(ev.currentTarget) }),
    });
    if (!res.ok) {
      setError('לא הצלחנו לשלוח את הטופס כרגע. נסו שוב בעוד רגע.');
      return;
    }
    setSent(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <main className="joinPage">
    <section className="joinHero">
      <div className="joinBadge">🎙️ פודקש</div>
      <h1>רוצים להשמיע קול?</h1>
      <p>פודקש היא פלטפורמת פודקאסט לאנשים שרוצים להשמיע את הקול שלהם. אם יש לכם סיפור, ידע, ניסיון, דעה, מומחיות או נושא שמדליק אתכם, מוזמנים להירשם כמרואיינים. אם אתם רוצים להוביל שיחה, להנחות פרק או לארח אנשים מעניינים, מוזמנים להירשם כמנחים.</p>
      <p>אנחנו ננסה למצוא לכם התאמה לפרק: מנחה מתאים למרואיין מתאים, סביב נושא שיכול להפוך לשיחה מעניינת, עמוקה ובעלת ערך. גם אם כבר יש לכם מרואיין או רעיון ברור לפרק, אפשר להשתמש בפלטפורמה כדי להפיק אותו בצורה מקצועית.</p>
      <p><b>אנחנו נספק את הציוד המקצועי, הצילום, ההקלטה והליווי הטכני. אתם רק צריכים להגיע ולהשמיע קול.</b></p>
      <p>חשוב לנו לשמור על שיח מכבד, פתוח, אחראי ותואם את הערכים של פודקש: עומק, הקשבה, סקרנות וערך אמיתי לקהל.</p>
      <a className="spotifyListen" href="https://open.spotify.com/show/033eNDxQDdcRftOLpRmv29?si=jfAcojYuQNKui5ubYjjYYw" target="_blank" rel="noreferrer" aria-label="להאזנה לפודקש בספוטיפיי"><span>▶</span><b>להאזנה ישירה בספוטיפיי</b></a>
    </section>

    {sent ? <section className="joinCard success"><h2>הטופס נשלח בהצלחה</h2><p>תודה שנרשמתם לפודקש. אם תהיה התאמה לפרק, נחזור אליכם עם הצעה לשידוך, תיאום והמשך הפקה.</p></section> : <>
      <section className="joinPicker" aria-label="בחירת סוג הרשמה">
        <button className={kind === 'guest' ? 'on' : ''} onClick={() => setKind('guest')}><span>אני רוצה להיות</span><b>מרואיין/ת</b><small>יש לי סיפור, ידע, ניסיון או נושא לשיחה.</small></button>
        <button className={kind === 'host' ? 'on' : ''} onClick={() => setKind('host')}><span>אני רוצה להיות</span><b>מנחה / מראיין/ת</b><small>אני רוצה להוביל שיחה, לארח וליצור תוכן.</small></button>
      </section>

      {kind && <form className="joinForm" onSubmit={submit}>
        <div className="joinFormHead"><p className="eyebrow">{kind === 'guest' ? 'שאלון מרואיינים' : 'שאלון מנחים / מראיינים'}</p><h2>{kind === 'guest' ? 'ספרו לנו עליכם ועל הסיפור שלכם' : 'ספרו לנו על סגנון ההנחיה והפרק שתרצו ליצור'}</h2>{kind === 'host' ? <p className="joinNotice">חשוב לדעת: הרשמה כמנחה אינה מבטיחה השתתפות אוטומטית. אנחנו בוחנים כל פנייה לפי התאמה מקצועית, ניסיון בהובלת שיחה או ביצירת תוכן, יכולת לייצר שיח מכבד ומעניין, והתאמה לערכים של פודקש והקהילה. אם נראה שיש התאמה, נחזור אליכם ונמשיך יחד לשלב הבא.</p> : null}</div>
        {fields.map(f => <FieldControl key={f.name} field={f} />)}
        <label className="joinConsent"><input name="marketingConsent" type="checkbox" required /> אני מאשר/ת שימוש בצילום, בהקלטה ובתוכן לצורכי פרסום ושיווק של פודקש, בכפוף לתיאום ואישור ההפקה.</label>
        <label className="joinConsent"><input name="valuesConsent" type="checkbox" required /> אני מבין/ה שפודקש שואפת ליצור שיחות מכבדות, פתוחות ובעלות ערך, ומתחייב/ת לשמור על שיח מכבד ותואם את ערכי הפלטפורמה.</label>
        {error && <p className="joinError">{error}</p>}
        <div className="joinActions"><button>שלחו את הפרטים ונחזור אליכם להתאמה</button></div>
      </form>}
    </>}
  </main>;
}
