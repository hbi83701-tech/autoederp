'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from './supabase/server';

export async function signOut() {
  const sb = await db();
  await sb.auth.signOut();
  redirect('/login');
}

/** Branch and year are filters in the header, not a separate login step. */
export async function setFilter(fd: FormData) {
  const store = await cookies();
  for (const k of ['branch', 'year']) {
    const v = fd.get(k);
    if (typeof v === 'string') { if (v) store.set(k, v, { path: '/', maxAge: 60 * 60 * 24 * 365 }); else store.delete(k); }
  }
  revalidatePath('/', 'layout');
}
