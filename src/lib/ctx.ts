import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './supabase/server';

export type Level = 'F' | 'B' | 'S' | 'O' | 'V' | 'R' | '-';
export const STAFF_ROLES = ['group_admin', 'system_admin', 'principal', 'coordinator', 'class_teacher', 'subject_teacher', 'accounts', 'hr', 'front_office', 'transport', 'librarian', 'store', 'warden', 'counsellor', 'nurse', 'security', 'driver'] as const;
export const ROLE_LABEL: Record<string, string> = {
  group_admin: 'Group admin', system_admin: 'School system admin', principal: 'Principal', coordinator: 'Coordinator', class_teacher: 'Class teacher',
  subject_teacher: 'Subject teacher', accounts: 'Accounts', hr: 'HR', front_office: 'Front office', transport: 'Transport manager', librarian: 'Librarian',
  store: 'Store / canteen', warden: 'Hostel warden', counsellor: 'Counsellor', nurse: 'Nurse', security: 'Gate security', driver: 'Driver / attendant',
  parent: 'Parent', student: 'Student', pending: 'Pending',
};

/** Per-request context: user, profile, school, permissions, and the branch / year filters from the header. */
export const getCtx = cache(async () => {
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile?.org_id) redirect('/onboarding');
  const [{ data: org }, { data: perms }, { data: branches }, { data: years }] = await Promise.all([
    sb.from('organisations').select('*').eq('id', profile.org_id).single(),
    sb.from('role_permissions').select('capability, level').eq('role', profile.role),
    sb.from('branches').select('id, name, code, board, attendance_cutoff, working_days, city').eq('active', true).order('name'),
    sb.from('academic_years').select('id, name, start_date, end_date, is_current').order('start_date', { ascending: false }),
  ]);
  const map: Record<string, Level> = {};
  for (const p of perms ?? []) map[p.capability] = p.level as Level;
  const store = await cookies();
  const year = (years ?? []).find((y) => y.id === store.get('year')?.value) ?? (years ?? []).find((y) => y.is_current) ?? (years ?? [])[0] ?? null;
  const cookieBranch = store.get('branch')?.value;
  const branchId: string | null = profile.branch_id ?? ((branches ?? []).some((b) => b.id === cookieBranch) ? cookieBranch! : null);
  const role: string = profile.role;
  const isStaff = !['parent', 'student', 'pending'].includes(role);
  const can = (cap: string, need: 'read' | 'write' = 'read') => {
    const l = map[cap];
    return need === 'write' ? ['F', 'B', 'S'].includes(l) : ['F', 'B', 'S', 'V'].includes(l);
  };
  const moduleOn = (key: string) => (org?.modules ?? {})[key] !== false;
  return { sb, user, profile, org: org!, perms: map, can, moduleOn, branches: branches ?? [], years: years ?? [], year, branchId, role, isStaff, name: (profile.full_name ?? user.email ?? '') as string };
});
export type Ctx = Awaited<ReturnType<typeof getCtx>>;

/** Stop a page from rendering when the role lacks the capability. */
export async function requireCap(cap: string, need: 'read' | 'write' = 'read') {
  const ctx = await getCtx();
  if (!ctx.can(cap, need)) redirect('/?err=' + encodeURIComponent('You do not have access to that page.'));
  return ctx;
}
