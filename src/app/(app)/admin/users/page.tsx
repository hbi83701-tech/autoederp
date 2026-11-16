import { headers } from 'next/headers';
import { requireCap, STAFF_ROLES, ROLE_LABEL } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { ftime, go, str } from '@/lib/fmt';

export const metadata = { title: 'Users and invites' };
async function invite(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); const { error } = await ctx.sb.from('invites').insert({ email: str(fd, 'email')?.toLowerCase(), full_name: str(fd, 'full_name'), role: str(fd, 'role'), branch_id: str(fd, 'branch_id'), staff_id: str(fd, 'staff_id'), guardian_id: str(fd, 'guardian_id'), student_id: str(fd, 'student_id') }); go('/admin/users', error ? error.message : 'Invite created. Copy the link below and send it to the person.', error ? 'err' : 'ok'); }
async function revoke(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); await ctx.sb.from('invites').delete().eq('id', str(fd, 'id')!); go('/admin/users', 'Invite removed.'); }
async function update(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); const id = str(fd, 'id')!; if (id === ctx.user.id && (str(fd, 'role') !== ctx.role || fd.get('active') !== 'on')) go('/admin/users', 'You cannot change your own role or suspend yourself.', 'err'); const { error } = await ctx.sb.from('profiles').update({ role: str(fd, 'role'), branch_id: str(fd, 'branch_id'), staff_id: str(fd, 'staff_id'), active: fd.get('active') === 'on' }).eq('id', id); go('/admin/users', error ? error.message : 'User updated.', error ? 'err' : 'ok'); }

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCap('admin');
  const [{ data: users }, { data: invites }, { data: staff }] = await Promise.all([ctx.sb.from('profiles').select('id, full_name, email, role, branch_id, staff_id, active, last_seen_at').order('role').limit(2000), ctx.sb.from('invites').select('*').is('accepted_at', null).order('created_at', { ascending: false }), ctx.sb.from('staff').select('id, first_name, last_name').eq('status', 'active').order('first_name')]);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const can = ctx.can('admin', 'write');
  const preset = sp.invite_guardian ? 'parent' : sp.invite_staff ? 'class_teacher' : '';
  return (
    <Page title="Users and invites" sub="People join with an invite link. The link sets their role, branch and the record they are linked to.">
      <div className="grid gap-4 lg:grid-cols-3">
        {can && <Card title="Invite someone"><form action={invite} className="space-y-3 p-4">
          {sp.invite_guardian && <input type="hidden" name="guardian_id" value={sp.invite_guardian} />}
          <Field label="Name"><input name="full_name" className="input" defaultValue={sp.name ?? ''} /></Field><Field label="Email" help="Only this address can use the link."><input name="email" type="email" required className="input" defaultValue={sp.email ?? ''} /></Field>
          <Field label="Role"><select name="role" className="input" defaultValue={preset} required><option value="">Choose</option>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}<option value="parent">Parent</option><option value="student">Student</option></select></Field>
          <Field label="Branch" help="Leave blank for access to all branches."><select name="branch_id" className="input"><option value="">All branches</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Link to staff record"><select name="staff_id" className="input" defaultValue={sp.invite_staff ?? ''}><option value="">—</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></Field>
          <button className="btn w-full">Create invite link</button>{sp.invite_guardian && <p className="text-xs text-muted">This invite links the parent to their family record.</p>}</form></Card>}
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Pending invites (${(invites ?? []).length})`}>{(invites ?? []).length === 0 ? <Empty title="No pending invites" /> : <ul className="divide-y divide-line text-sm">{invites!.map((i) => <li key={i.id} className="px-4 py-2.5"><div className="flex items-center justify-between gap-2"><span><b>{i.full_name ?? i.email}</b> · {ROLE_LABEL[i.role] ?? i.role} · expires {ftime(i.expires_at)}</span>{can && <form action={revoke}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-red-600 underline">Remove</button></form>}</div><input readOnly value={`${origin}/signup?invite=${i.token}`} className="input mt-1 font-mono text-xs" aria-label="Invite link" /></li>)}</ul>}</Card>
          <Card title={`Users (${(users ?? []).length})`}><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>User</th><th>Role</th><th>Branch</th><th>Staff record</th><th>Active</th><th>Last seen</th><th></th></tr></thead><tbody>{(users ?? []).map((u) => <tr key={u.id}><td>{u.full_name}<div className="text-xs text-muted">{u.email}</div></td>
            {can ? <td colSpan={5}><form action={update} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={u.id} /><select name="role" defaultValue={u.role} className="input !w-auto !py-1 text-xs" aria-label="Role">{[...STAFF_ROLES, 'parent', 'student'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select><select name="branch_id" defaultValue={u.branch_id ?? ''} className="input !w-auto !py-1 text-xs" aria-label="Branch"><option value="">All branches</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="staff_id" defaultValue={u.staff_id ?? ''} className="input !w-auto !py-1 text-xs" aria-label="Staff record"><option value="">No staff record</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} />active</label><span className="text-xs text-muted">{u.last_seen_at ? ftime(u.last_seen_at) : 'never logged in'}</span><button className="btn-ghost btn-sm">Save</button></form></td>
              : <><td><Badge tone="teal">{ROLE_LABEL[u.role] ?? u.role}</Badge></td><td>{ctx.branches.find((b) => b.id === u.branch_id)?.name ?? 'All'}</td><td /><td>{u.active ? 'Yes' : 'No'}</td><td>{ftime(u.last_seen_at)}</td></>}<td /></tr>)}</tbody></table></div></Card>
        </div>
      </div>
    </Page>
  );
}
