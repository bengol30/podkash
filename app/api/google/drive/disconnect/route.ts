import { NextResponse } from 'next/server';
import { deleteGoogleDriveTokens } from '@/lib/db';

export async function POST() {
  await deleteGoogleDriveTokens();
  return NextResponse.json({ ok: true });
}
