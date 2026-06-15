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
