import { requireCap, STAFF_ROLES, ROLE_LABEL } from '@/lib/ctx';
import { Page, Card } from '@/components/ui';
import { go } from '@/lib/fmt';

export const metadata = { title: 'Roles and permissions' };
const CAPS = ['students', 'sensitive', 'attendance', 'timetable', 'learning', 'homework', 'marks', 'exams', 'wellbeing', 'safeguarding', 'health', 'activities', 'admissions', 'fees', 'concessions', 'accounting', 'staff', 'payroll', 'leave', 'messages', 'transport', 'gate', 'hostel', 'canteen', 'inventory', 'library', 'documents', 'events', 'helpdesk', 'forms', 'reports', 'admin', 'audit', 'facilities'];
const LEVELS = ['F', 'B', 'S', 'O', 'V', 'R', '-'];
async function save(fd: FormData) {
  'use server';
  const ctx = await requireCap('admin', 'write');
  const rows = [];
  for (const r of STAFF_ROLES) for (const c of CAPS) { const v = String(fd.get(`${r}:${c}`) ?? '-'); if (LEVELS.includes(v)) rows.push({ org_id: ctx.org.id, role: r, capability: c, level: r === 'group_admin' && ['admin', 'audit'].includes(c) ? 'F' : v }); }
  const { error } = await ctx.sb.from('role_permissions').upsert(rows, { onConflict: 'org_id,role,capability' });
  go('/admin/roles', error ? error.message : 'Permissions saved. They apply from the next page each person opens.', error ? 'err' : 'ok');
}

export default async function Roles() {
  const ctx = await requireCap('admin');
  const { data } = await ctx.sb.from('role_permissions').select('role, capability, level');
  const m = new Map((data ?? []).map((p) => [`${p.role}:${p.capability}`, p.level]));
  const can = ctx.can('admin', 'write');
  return (
    <Page title="Roles and permissions" sub="F = full, B = own branch, S = own sections or subjects, O = own records, V = view, R = request only, - = none. The database enforces these on every query.">
      <form action={save}><Card><div className="overflow-x-auto"><table className="tbl"><thead><tr><th className="sticky left-0 bg-paper">Capability</th>{STAFF_ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
        <tbody>{CAPS.map((c) => <tr key={c}><td className="sticky left-0 bg-white font-medium capitalize">{c}</td>{STAFF_ROLES.map((r) => <td key={r} className="text-center"><select name={`${r}:${c}`} defaultValue={m.get(`${r}:${c}`) ?? '-'} disabled={!can} aria-label={`${ROLE_LABEL[r]} · ${c}`} className="rounded border border-line bg-white px-1 py-0.5 text-xs">{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></td>)}</tr>)}</tbody></table></div></Card>
        {can && <button className="btn mt-3">Save permissions</button>}</form>
      <p className="mt-3 text-xs text-muted">Parents and students do not appear here: they only ever see their own family&apos;s records. The group admin always keeps the admin console and audit log, so nobody can be locked out.</p>
    </Page>
  );
}
