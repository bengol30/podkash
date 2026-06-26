# פודקש — מצב חיבורים

## מחובר עכשיו

- Next.js production app on Vercel
- עברית + RTL
- ניווט עמודים מלא
- פרקים, אנשים, משימות והודעות עם localStorage persistence
- יצירת פרק בסיסית
- קידום סטטוס פרק
- יצירת איש קשר
- יצירת משימה וסימון בוצע/פתוח
- יצירת תבנית הודעה והעתקה לוואטסאפ
- עמוד פרק מלא לכל פרק seed
- יומן צילום
- הפצה ומדיה כדשבורד תפעולי
- Buffer מחובר דרך API ליצירת טיוטות בלבד
- ניהול ערוצי Buffer לפי פלטפורמה, כולל TikTok כשמחובר ב־Buffer
- יצירת טיוטות סושיאל עם טקסט, תזמון, קישור וידאו/קליפ, Thumbnail, וכותרת/סימון AI ל־TikTok

## בכוונה עוד לא חובר

- Auth — דורש החלטה: Clerk/Auth.js/Supabase
- WhatsApp אוטומטי — בשלב MVP נשאר human-in-the-loop
- Google Calendar/Drive — מומלץ אחרי DB/Auth
- AI — מומלץ אחרי שיש DB ושדות תוכן אמיתיים

## המלצת השלב הבא

1. לבחור DB חינמי/קיים: Supabase/Neon/Vercel Postgres אם כבר יש free tier מאושר.
2. להוסיף Prisma/Drizzle schema לפי `podkash-spec.md`.
3. להעביר localStorage ל־API routes + DB.
4. להוסיף Auth.js או Clerk.
5. לחבר Google Calendar + Drive.
6. להוסיף תזכורות scheduled jobs.

## DB layer added

- Added server persistence through `app/api/store`.
- Uses Postgres via `DATABASE_URL` or `POSTGRES_URL`.
- Creates table automatically on first request:
  - `podkash_store(id text primary key, data jsonb, created_at, updated_at)`
- The client now loads/saves through `/api/store` and migrates old `localStorage` (`podkash:v1`) into the DB once.

### Required production env

Set one of these in Vercel Production/Preview/Development:

```bash
DATABASE_URL=postgresql://...
# or
POSTGRES_URL=postgresql://...
```

Recommended providers: Neon, Supabase Postgres, or Vercel Postgres.

## Buffer / TikTok

- Required env: `BUFFER_ACCESS_TOKEN` or `BUFFER_API_KEY`.
- API endpoint: `GET /api/buffer/status` syncs account/channels.
- API endpoint: `POST /api/buffer/drafts` creates Buffer drafts only (`saveToDraft: true`).
- TikTok appears automatically in Distribution after the TikTok account is connected inside Buffer.
- TikTok draft options supported from Podkash:
  - post text
  - scheduled time / queue slot
  - public video URL
  - optional thumbnail URL
  - TikTok title
  - AI-generated disclosure flag

## YouTube (חיבור עצמאי, בלי Buffer)

חיבור ישיר לערוץ היוטיוב דרך YouTube Data API v3 + Google OAuth (אותו Client ID/Secret של Drive).

- Scopes: `youtube.upload` + `youtube.readonly` (נשמרים בנפרד תחת `id='youtube'` בטבלת `podkash_google_tokens`).
- Routes: `/api/youtube/auth/start`, `/api/youtube/auth/callback`, `/api/youtube/status`, `/api/youtube/disconnect`, `/api/youtube/upload` (פותח resumable session ומחזיר `uploadUrl`; הדפדפן מעלה את הבייטים ישירות).
- UI: רכיב `YouTubeStudio` בעמוד ההפצה — בחירת פרק, קובץ וידאו, כותרת/תיאור/תגיות/קטגוריה, פרטיות ותזמון פרסום. הקישור נשמר אוטומטית ל־`episode.youtubeUrl`.
- תזמון: כשמוגדר `publishAt`, הסרטון עולה כ־`private` ומתפרסם אוטומטית בזמן שנקבע.
- Google Cloud (בוצע): YouTube Data API v3 מופעל, Redirect URI נוסף, scopes נוספו ל-Data Access, test user podkashk@gmail.com קיים (מצב Testing). פרסום ציבורי דורש audit; עד אז העלאות API נשארות private/מתוזמן/unlisted.
- אין env חדש: משתמש ב-GOOGLE_CLIENT_ID/SECRET הקיימים; YOUTUBE_REDIRECT_URI אופציונלי.

## Spotify / עצמאי דרך RSS + Supabase Storage

פודקש יכולה לשמש כ־Podcast Host עצמאי: היא מייצרת RSS Feed ב־`/api/podcast/spotify/rss`, מנהלת פרקים בלשונית **הפצה → Spotify**, ומעלה קבצי אודיו ל־Supabase Storage נפרד.

### משתני סביבה נדרשים

להעלאת MP3 ל־Supabase Storage נפרד:

- `PODCAST_SUPABASE_URL` — כתובת הפרויקט החדש ב־Supabase
- `PODCAST_SUPABASE_SERVICE_ROLE_KEY` — service role key של הפרויקט
- `PODCAST_SUPABASE_STORAGE_BUCKET` — ברירת מחדל: `podcast-audio`
- `PODCAST_PUBLIC_BASE_URL` — הדומיין הציבורי של פודקש, למשל `https://podkash.vercel.app`

פרטי RSS מומלצים:

- `PODCAST_SHOW_TITLE`
- `PODCAST_SHOW_DESCRIPTION`
- `PODCAST_SHOW_LANGUAGE` — ברירת מחדל `he`
- `PODCAST_SHOW_AUTHOR`
- `PODCAST_OWNER_NAME`
- `PODCAST_OWNER_EMAIL`
- `PODCAST_SHOW_IMAGE_URL`
- `PODCAST_SHOW_CATEGORY`
- `PODCAST_SHOW_EXPLICIT` — `true` / `false`

### Supabase setup

בפרויקט Supabase החדש ליצור bucket ציבורי בשם `podcast-audio`.
המערכת תעלה קבצי אודיו ל־Storage ותשמור את ה־public URL בפרק Spotify. פרקים בסטטוס `published`, או `scheduled` שהזמן שלהם עבר, יופיעו ב־RSS.

### חיבור ל־Spotify

אחרי שיש לפחות פרק Published עם Audio URL תקין, מחברים את ה־RSS ב־Spotify for Podcasters/Creators:

`https://podkash.vercel.app/api/podcast/spotify/rss`

או הדומיין שמוגדר ב־`PODCAST_PUBLIC_BASE_URL`.
