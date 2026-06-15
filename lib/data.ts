export type EpisodeStatus = 'רעיון' | 'בתכנון תוכן' | 'בתיאום' | 'צילום נקבע' | 'צולם' | 'בעריכה' | 'ממתין לאישור' | 'מוכן לפרסום' | 'פורסם';

export const episodes = [
  { id: 1, number: 12, title: 'מאחורי הקלעים של יזמות תוכן', topic: 'איך בונים מותג מדיה מאפס', status: 'צילום נקבע' as EpisodeStatus, host: 'בן גולן', guests: 'דנה לוי', recording: 'יום א׳ · 10:00', publish: 'יום ד׳ · 09:00', progress: 72, tasks: 4, platformReady: 2, urgent: true },
  { id: 2, number: 13, title: 'כסף, יצירה ומה שביניהם', topic: 'מודלים עסקיים ליוצרים', status: 'בתיאום' as EpisodeStatus, host: 'בן גולן', guests: 'רועי כהן', recording: 'ממתין לאישור', publish: 'לא נקבע', progress: 38, tasks: 6, platformReady: 0 },
  { id: 3, number: 14, title: 'פרק סולו: למה עכשיו?', topic: 'חזון הפודקאסט והקהל', status: 'בתכנון תוכן' as EpisodeStatus, host: 'בן גולן', guests: '—', recording: 'טרם נקבע', publish: 'לא נקבע', progress: 24, tasks: 3, platformReady: 0 },
  { id: 4, number: 11, title: 'איך עורכים פרק שמרגיש יקר', topic: 'עריכה, קצב וקליפים', status: 'בעריכה' as EpisodeStatus, host: 'בן גולן', guests: 'נועה שפיר', recording: 'צולם', publish: 'יום ב׳ הבא', progress: 61, tasks: 5, platformReady: 1 },
  { id: 5, number: 10, title: 'איך בונים קהילה סביב תוכן', topic: 'קהילה, הפצה ונאמנות', status: 'מוכן לפרסום' as EpisodeStatus, host: 'בן גולן', guests: 'אורי מאור', recording: 'צולם', publish: 'מחר · 08:30', progress: 90, tasks: 2, platformReady: 5, urgent: true },
];

export const statuses: EpisodeStatus[] = ['רעיון','בתכנון תוכן','בתיאום','צילום נקבע','צולם','בעריכה','ממתין לאישור','מוכן לפרסום','פורסם'];

export const people = [
  { name: 'בן גולן', role: 'מנחה / בעלים', type: 'host', phone: '050-0000000', episodes: 5, note: 'מוביל תוכן ואישורים סופיים' },
  { name: 'דנה לוי', role: 'מרואיינת', type: 'guest', phone: '052-1111111', episodes: 1, note: 'צריכה לקבל בריף לפני צילום' },
  { name: 'נועה שפיר', role: 'עורכת', type: 'editor', phone: '054-2222222', episodes: 2, note: 'אחראית וידאו מלא וקליפים' },
  { name: 'רועי כהן', role: 'מרואיין', type: 'guest', phone: '053-3333333', episodes: 1, note: 'ממתין לאישור תאריך' },
  { name: 'אור כהן', role: 'סושיאל', type: 'social', phone: '055-4444444', episodes: 3, note: 'מקבל קליפים ותיאורים לפרסום' },
];

export const productionSessions = [
  { episode: episodes[0], studio: 'אולפן תל אביב', time: 'יום א׳ · 10:00-12:00', confirmations: ['מנחה אישר', 'מרואיינת אישרה', 'אולפן אישר'], missing: ['בריף סופי', 'הודעת תזכורת 24 שעות'] },
  { episode: episodes[1], studio: 'אולפן תל אביב', time: 'מוצע: יום ג׳ · 13:00', confirmations: ['מנחה אישר'], missing: ['אישור מרואיין', 'אישור אולפן'] },
];

export const tasks = [
  { title: 'לסגור בריף לפרק עם דנה', episode: episodes[0].title, owner: 'בן', due: 'היום', type: 'תוכן', status: 'פתוח' },
  { title: 'להעתיק הודעת תזכורת לצוות', episode: episodes[0].title, owner: 'הפקה', due: 'מחר', type: 'וואטסאפ', status: 'פתוח' },
  { title: 'להעלות חומרים ל־Drive', episode: episodes[3].title, owner: 'נועה', due: 'מחר', type: 'עריכה', status: 'בוצע' },
  { title: 'להכין כותרות ויוטיוב description', episode: episodes[4].title, owner: 'סושיאל', due: 'היום', type: 'הפצה', status: 'פתוח' },
];

export const platforms = [
  { name: 'YouTube', status: 'מוכן לפרסום', episode: episodes[4].title, asset: 'וידאו מלא + Thumbnail', link: 'טרם פורסם' },
  { name: 'Spotify', status: 'דורש אודיו', episode: episodes[4].title, asset: 'אודיו ערוך', link: 'טרם פורסם' },
  { name: 'Apple Podcasts', status: 'לא התחיל', episode: episodes[4].title, asset: 'RSS', link: '—' },
  { name: 'Instagram', status: 'צריך קליפים', episode: episodes[3].title, asset: '3 Reels', link: '—' },
  { name: 'TikTok', status: 'צריך קליפ אנכי', episode: episodes[4].title, asset: 'קליפ MP4 אנכי + קופי קצר', link: '—' },
  { name: 'LinkedIn', status: 'צריך טקסט', episode: episodes[4].title, asset: 'פוסט + לינק', link: '—' },
];

export const messages = [
  { name: 'תזכורת למרואיין 24 שעות לפני', target: 'מרואיין', status: 'מוכן להעתקה', body: 'שלום {{שם}}, תזכורת לצילום הפרק {{שם הפרק}} ביום {{יום}} בשעה {{שעה}} ב־{{מיקום}}. חשוב להגיע 10 דקות לפני.' },
  { name: 'עדכון צוות צילום', target: 'קבוצת צוות', status: 'דורש אישור', body: 'תזכורת: מחר צילום {{שם הפרק}}. מנחה: {{מנחה}}. מרואיינים: {{מרואיינים}}. משימות פתוחות: {{משימות}}.' },
  { name: 'הפרק מוכן לפרסום', target: 'סושיאל', status: 'טיוטה', body: 'הפרק {{שם הפרק}} מוכן לפרסום. מצורפים לינקים לחומרים, כותרת ותיאור.' },
];
