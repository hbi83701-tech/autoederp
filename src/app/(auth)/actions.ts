'use server';
import { headers } from 'next/headers';
import { db } from '@/lib/supabase/server';
import { go, str, errMsg } from '@/lib/fmt';
import { installPack } from '@/lib/pack';

export async function signIn(fd: FormData) {
  const sb = await db();
  const { error } = await sb.auth.signInWithPassword({ email: str(fd, 'email') ?? '', password: str(fd, 'password') ?? '' });
  if (error) go('/login', error.message === 'Email not confirmed' ? 'Please confirm your email first. Check your inbox for the link.' : 'The email or password is not right.', 'err');
  const next = str(fd, 'next');
  go(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signUp(fd: FormData) {
  const sb = await db();
  const invite = str(fd, 'invite');
  const password = str(fd, 'password') ?? '';
  if (password.length < 8) go(`/signup${invite ? `?invite=${invite}` : ''}`, 'Use a password of at least 8 characters.', 'err');
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const { data, error } = await sb.auth.signUp({
    email: str(fd, 'email') ?? '', password,
    options: { data: { full_name: str(fd, 'full_name') }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(invite ? `/onboarding?invite=${invite}` : '/onboarding')}` },
  });
  if (error) go(`/signup${invite ? `?invite=${invite}` : ''}`, error.message, 'err');
  if (!data.session) go('/login', 'Account created. Open the confirmation link we emailed you, then sign in.');
  go(invite ? `/onboarding?invite=${invite}` : '/onboarding');
}

export async function createSchool(fd: FormData) {
  const sb = await db();
  const board = str(fd, 'board') ?? 'CBSE';
  const { error } = await sb.rpc('create_organisation', { p_name: str(fd, 'name'), p_branch: str(fd, 'branch'), p_board: board, p_city: str(fd, 'city') });
  if (error) go('/onboarding', error.message, 'err');
  try { await installPack(sb, board); } catch (e) { go('/', `School created, but the ${board} pack did not fully install: ${errMsg(e)}`, 'err'); }
  go('/admin/setup', `Welcome. The ${board} pack is installed. Follow the checklist to finish set-up.`);
}

export async function acceptInvite(fd: FormData) {
  const sb = await db();
  const { data, error } = await sb.rpc('claim_invite', { p_token: str(fd, 'token') });
  if (error) go('/onboarding', error.message, 'err');
  go(data === 'parent' ? '/parent' : data === 'student' ? '/student' : '/', 'You are in. Welcome.');
}
