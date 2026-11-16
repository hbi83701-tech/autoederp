import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { fullName, fdate, today } from '@/lib/fmt';
import { entitiesOf } from '@/lib/nav';
import { addDays } from '@/lib/calendar';

export const metadata = { title: 'Staff and HR' };
export default async function HR({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('staff');
  let q = ctx.sb.from('staff').select('id, emp_code, first_name, last_name, designation, department, staff_type, status, phone, user_id, bgv_status, licence_expiry').order('first_name').limit(500);
  q = q.eq('status', sp.status ?? 'active');
  if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const term = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
  if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,emp_code.ilike.%${term}%`);
  const { data } = await q;
  const soon = addDays(today(), 30);
  const can = ctx.can('staff', 'write');
  return (
    <Page title="Staff and HR" sub={`${(data ?? []).length} ${sp.status ?? 'active'} staff`} actions={<>{ctx.can('leave') && <Link className="btn-ghost" href="/hr/leave">Leave</Link>}{ctx.can('payroll') && <Link className="btn-ghost" href="/hr/payroll">Payroll</Link>}{can && <Link className="btn" href="/x/staff/new?back=/hr">Add staff</Link>}</>}>
      <form className="no-print mb-3 flex gap-2"><input name="q" defaultValue={sp.q ?? ''} placeholder="Name or employee code" className="input !w-60" aria-label="Search staff" /><select name="status" defaultValue={sp.status ?? 'active'} className="input !w-auto" aria-label="Status">{['active', 'on_notice', 'exited', 'inactive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select><button className="btn-ghost">Filter</button></form>
      <Card>{(data ?? []).length === 0 ? <Empty title="No staff yet" hint="Add staff one at a time, or import a list from Admin console → Import." action={can ? <Link className="btn" href="/x/staff/new?back=/hr">Add staff</Link> : undefined} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Name</th><th>Code</th><th>Designation</th><th>Department</th><th>Type</th><th>Phone</th><th>App login</th><th>Checks</th></tr></thead>
        <tbody>{data!.map((s) => <tr key={s.id} className="hover:bg-paper"><td><Link className="link font-medium" href={`/hr/staff/${s.id}`}>{fullName(s)}</Link></td><td>{s.emp_code}</td><td>{s.designation}</td><td>{s.department}</td><td>{s.staff_type}</td><td>{s.phone}</td><td>{s.user_id ? <Badge tone="green">linked</Badge> : <Badge tone="grey">not invited</Badge>}</td>
          <td>{s.bgv_status !== 'clear' && <Badge tone={s.bgv_status === 'flagged' ? 'red' : 'amber'}>BGV {s.bgv_status}</Badge>} {s.licence_expiry && s.licence_expiry <= soon && <Badge tone="red">licence {fdate(s.licence_expiry)}</Badge>}</td></tr>)}</tbody></table></div>}</Card>
      <Card title="HR desk" className="mt-4"><div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">{entitiesOf('hr').filter((e) => ctx.can(e.cap) && e.table !== 'staff').map((e) => <Link key={e.table} href={`/x/${e.table}`} className="bg-white px-4 py-3 text-sm hover:bg-paper">{e.title}</Link>)}</div></Card>
    </Page>
  );
}
