import Link from 'next/link';
import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fdate, inr, today, ftime, go, str } from '@/lib/fmt';
import { leaveBalance } from '@/lib/rules/payroll';
import { applyLeave, checkIn, regularise } from '../hr/actions';
import { GeoFields } from './geo';

export const metadata = { title: 'My leave and payslips' };
async function doneTask(fd: FormData) { 'use server'; const ctx = await getCtx(); await ctx.sb.from('staff_tasks').update({ status: 'done' }).eq('id', str(fd, 'id')!); go('/me', 'Marked done.'); }

/** Staff self-service: check-in, leave, payslips, duties (TAP-02). */
export default async function Me() {
  const ctx = await getCtx();
  const sid = ctx.profile.staff_id as string | null;
  if (!sid) return <Page title="My leave and payslips"><Card><Empty title="Your login is not linked to a staff record yet" hint="Ask your school admin to link your account in Admin console → Users." /></Card></Page>;
  const d = today();
  const [{ data: types }, { data: bal }, { data: lv }, { data: slips }, { data: att }, { data: tasks }] = await Promise.all([
    ctx.sb.from('leave_types').select('id, name, annual_quota').eq('applies_to', 'staff'), ctx.sb.from('leave_balances').select('leave_type_id, allotted, carried').eq('staff_id', sid).eq('year_id', ctx.year?.id ?? ''),
    ctx.sb.from('leave_requests').select('id, from_date, to_date, days, status, leave_type_id, reason').eq('staff_id', sid).order('from_date', { ascending: false }).limit(15),
    ctx.sb.from('payslips').select('id, month, net').eq('staff_id', sid).order('month', { ascending: false }).limit(12),
    ctx.sb.from('attendance').select('check_in, check_out, status').eq('staff_id', sid).eq('date', d).eq('session', 'day').maybeSingle(),
    ctx.sb.from('staff_tasks').select('id, title, type, duty_type, due_date, status').eq('staff_id', sid).eq('status', 'open').order('due_date'),
  ]);
  const used = (t: string) => (lv ?? []).filter((l) => l.leave_type_id === t && l.status === 'approved').reduce((x, l) => x + Number(l.days), 0);
  return (
    <Page title="My leave and payslips" sub={fdate(d)}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Today"><form action={checkIn} className="space-y-2 p-4 text-sm"><GeoFields />
            <p>{att?.check_in ? <>Checked in at {ftime(att.check_in)}{att.check_out ? `, out at ${ftime(att.check_out)}` : ''}</> : att ? <>Marked <Badge>{att.status}</Badge></> : 'Not checked in yet.'}</p>
            <button className="btn w-full">{att?.check_in && !att.check_out ? 'Check out' : att?.check_in ? 'Update check-out' : 'Check in'}</button></form></Card>
          <Card title="My tasks and duties">{(tasks ?? []).length === 0 ? <Empty title="No open tasks" /> : <ul className="divide-y divide-line text-sm">{tasks!.map((t) => <li key={t.id} className="flex items-center justify-between px-4 py-2"><span>{t.title}{t.duty_type ? ` · ${t.duty_type} duty` : ''}<span className="block text-xs text-muted">{fdate(t.due_date)}</span></span><form action={doneTask}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost btn-sm">Done</button></form></li>)}</ul>}</Card>
          <Card title="Payslips">{(slips ?? []).length === 0 ? <Empty title="No payslips yet" /> : <ul className="divide-y divide-line text-sm">{slips!.map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><Link className="link" href={`/payslip/${p.id}`}>{new Date(p.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Link><span>{inr(p.net)}</span></li>)}</ul>}</Card>
        </div>
        <Card title="Apply for leave"><form action={applyLeave} className="space-y-3 p-4">
          <Field label="Leave type"><select name="leave_type_id" className="input" required>{(types ?? []).map((t) => { const b = (bal ?? []).find((x) => x.leave_type_id === t.id); return <option key={t.id} value={t.id}>{t.name}{Number(t.annual_quota) > 0 ? ` (${leaveBalance(Number(b?.allotted ?? t.annual_quota), Number(b?.carried ?? 0), used(t.id))} left)` : ''}</option>; })}</select></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" name="from_date" className="input" required /></Field><Field label="To"><input type="date" name="to_date" className="input" /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="half_day" className="h-4 w-4" /> Half day</label>
          <Field label="Reason"><input name="reason" className="input" required /></Field><button className="btn w-full">Submit</button>
          <details className="border-t border-line pt-3 text-sm"><summary className="cursor-pointer text-muted">Missed a punch? Request regularisation</summary></details></form>
          <form action={regularise} className="space-y-2 border-t border-line p-4"><div className="text-xs font-semibold text-muted">Attendance regularisation</div><div className="grid grid-cols-2 gap-2"><input type="date" name="date" max={d} required className="input" aria-label="Date" /><select name="requested_status" className="input" aria-label="Status"><option value="P">Present</option><option value="HD">Half day</option></select></div><input name="reason" required placeholder="Reason" className="input" aria-label="Reason" /><button className="btn-ghost w-full">Request</button></form></Card>
        <Card title="My leave requests">{(lv ?? []).length === 0 ? <Empty title="No leave taken" /> : <ul className="divide-y divide-line text-sm">{lv!.map((l) => <li key={l.id} className="flex justify-between gap-2 px-4 py-2"><span>{fdate(l.from_date)}{l.to_date !== l.from_date ? ` – ${fdate(l.to_date)}` : ''}<span className="block text-xs text-muted">{l.reason}</span></span><Badge>{l.status}</Badge></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
