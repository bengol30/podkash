import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'פודקש — ניהול פודקאסטים',
  description: 'מערכת ניהול הפקת פודקאסט מקצה לקצה',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
