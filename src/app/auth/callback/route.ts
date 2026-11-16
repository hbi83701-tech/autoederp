import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';

/** Email confirmation link lands here. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  if (code) {
    const sb = await db();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next.startsWith('/') && !next.startsWith('//') ? next : '/', url.origin));
}
