const unsetWords = ['טרם נקבע', 'לא נקבע', 'ללא דדליין', 'ממתין לאישור', 'צולם'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function weekday(date: Date) {
  return new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(date).replace('יום ', 'יום ');
}

function datePart(date: Date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function timePart(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTimeInput(value: string, fallback: string) {
  const date = parseDate(value);
  if (!date) return fallback;
  return `${weekday(date)} · ${datePart(date)} · ${timePart(date)}`;
}

export function formatDateTimeRange(startValue: string, endValue?: string, fallback = 'טרם נקבע') {
  const start = parseDate(startValue);
  if (!start) return fallback;
  const end = parseDate(endValue || '');
  if (!end) return formatDateTimeInput(startValue, fallback);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return `${weekday(start)} · ${datePart(start)} · ${timePart(start)}–${timePart(end)}`;
  return `${formatDateTimeInput(startValue, fallback)} – ${formatDateTimeInput(endValue || '', '')}`;
}

export function cleanDateTime(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  if (unsetWords.includes(raw)) return raw;

  const parsed = parseDate(raw);
  if (parsed) return `${weekday(parsed)} · ${datePart(parsed)} · ${timePart(parsed)}`;

  const todayOnly = raw === 'היום';
  if (todayOnly) {
    const today = new Date();
    return `${weekday(today)} · ${datePart(today)}`;
  }

  const tomorrowOnly = raw === 'מחר';
  if (tomorrowOnly) {
    const tomorrowDate = addDays(new Date(), 1);
    return `${weekday(tomorrowDate)} · ${datePart(tomorrowDate)}`;
  }

  const tomorrow = raw.match(/^מחר\s*·\s*(\d{1,2}:\d{2})$/);
  if (tomorrow) {
    const tomorrowDate = addDays(new Date(), 1);
    return `${weekday(tomorrowDate)} · ${datePart(tomorrowDate)} · ${tomorrow[1]}`;
  }

  const proposed = raw.match(/^(מוצע:\s*)?(יום\s+[א-ת׳']+)\s*·\s*(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?$/);
  if (proposed) {
    const prefix = proposed[1] || '';
    const day = proposed[2];
    const from = proposed[3];
    const to = proposed[4];
    return `${prefix}${day} · תאריך לא נקבע · ${to ? `${from}–${to}` : from}`;
  }

  return raw.replace(/\s+-\s+/g, ' – ').replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2');
}
