import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fdate, fullName, today } from '@/lib/fmt';
import { applyLeave } from '../actions';

export const metadata = { title: 'Leave' };
export default async function Leave({ searchParams }: { searchParams: Promise<{ staff?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('leave');
  let q = ctx.sb.from('leave_requests').select('id, person_type, from_date, to_date, days, half_day, reason, status, staff:staff!leave_requests_staff_id_fkey(id, first_name, last_name), student:students!leave_requests_student_id_fkey(id, first_name, last_name), type:leave_types!leave_requests_leave_type_id_fkey(name)').order('from_date', { ascending: false }).limit(200);
  if (sp.status) q = q.eq('status', sp.status);
  const [{ data }, { data: staff }, { data: types }] = await Promise.all([q, ctx.sb.from('staff').select('id, first_name, last_name').eq('status', 'active').order('first_name'), ctx.sb.from('leave_types').select('id, name').eq('applies_to', 'staff')]);
  const rows = (data ?? []) as unknown as { id: string; person_type: string; from_date: string; to_date: string; days: number; half_day: boolean; reason: string; status: string; staff: { id: string; first_name: string; last_name: string } | null; student: { id: string; first_name: string; last_name: string } | null; type: { name: string } | null }[];
  const d = today();
  const away = rows.filter((r) => r.status === 'approved' && r.from_date <= d && r.to_date >= d);
  return (
    <Page title="Leave" sub="Requests go to the approvals inbox. Approved leave fills attendance and opens the substitution planner." actions={<><Link className="btn-ghost" href="/x/leave_types">Leave types and policies</Link><Link className="btn-ghost" href="/x/leave_balances">Balances</Link><Link className="btn-ghost" href="/x/attendance_regularisations">Regularisations</Link></>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Away today (${away.length})`}>{away.length === 0 ? <Empty title="Nobody is on approved leave today" /> : <ul className="divide-y divide-line text-sm">{away.map((r) => <li key={r.id} className="flex justify-between px-4 py-2"><span>{fullName(r.staff ?? r.student)} <span className="text-muted">· {r.person_type}</span></span><span className="text-muted">until {fdate(r.to_date)}</span></li>)}</ul>}</Card>
          <Card title="Requests" actions={<form className="flex gap-1"><select name="status" defaultValue={sp.status ?? ''} className="input !w-auto !py-1 text-xs" aria-label="Status"><option value="">All</option>{['pending', 'approved', 'rejected'].map((s) => <option key={s}>{s}</option>)}</select><button className="btn-ghost btn-sm">Filter</button></form>}>
            {rows.length === 0 ? <Empty title="No leave requests" hint="Staff apply from “My leave and payslips”; parents apply for students in the parent app." /> : <table className="tbl"><thead><tr><th>Who</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td>{r.staff ? <Link className="link" href={`/hr/staff/${r.staff.id}`}>{fullName(r.staff)}</Link> : r.student ? <Link className="link" href={`/students/${r.student.id}`}>{fullName(r.student)}</Link> : ''}<div className="text-xs text-muted">{r.person_type}</div></td><td>{r.type?.name}</td><td>{fdate(r.from_date)}{r.to_date !== r.from_date ? ` – ${fdate(r.to_date)}` : ''}</td><td>{r.days}</td><td className="max-w-xs truncate">{r.reason}</td><td><Badge>{r.status}</Badge></td></tr>)}</tbody></table>}</Card>
        </div>
        {ctx.can('leave', 'write') && <Card title="Apply on behalf of staff"><form action={applyLeave} className="space-y-3 p-4"><input type="hidden" name="back" value="/hr/leave" />
          <Field label="Staff member"><select name="staff_id" className="input" defaultValue={sp.staff ?? ''} required><option value="">Choose</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></Field>
          <Field label="Leave type"><select name="leave_type_id" className="input" required>{(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" name="from_date" className="input" required /></Field><Field label="To"><input type="date" name="to_date" className="input" /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="half_day" className="h-4 w-4" /> Half day</label>
          <Field label="Reason"><input name="reason" className="input" required /></Field><button className="btn w-full">Submit for approval</button></form></Card>}
      </div>
    </Page>
  );
}
