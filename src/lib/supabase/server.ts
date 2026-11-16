import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Supabase client bound to the signed-in user's session. Every query runs under row-level security. */
export async function db() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a server component: middleware refreshes the session */ }
      },
    },
  });
}
