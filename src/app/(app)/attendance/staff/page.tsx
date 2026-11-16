import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { today, fdate, fullName } from '@/lib/fmt';
import { markStaff } from '../actions';

export const metadata = { title: 'Staff attendance' };
export default async function StaffAttendance({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = today() } = await searchParams;
  const ctx = await requireCap('attendance');
  let q = ctx.sb.from('staff').select('id, first_name, last_name, designation').eq('status', 'active').order('first_name');
  if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const [{ data: staff }, { data: att }] = await Promise.all([q, ctx.sb.from('attendance').select('staff_id, status, source, check_in').eq('date', date).eq('person_type', 'staff')]);
  const prev = new Map((att ?? []).map((a) => [a.staff_id, a]));
  const can = ['F', 'B'].includes(ctx.perms.attendance);
  return (
    <Page title="Staff attendance" sub={`${fdate(date)} · feeds payroll. Approved leave is filled in automatically.`} actions={<form className="flex gap-2"><input type="date" name="date" defaultValue={date} max={today()} className="input !w-auto" aria-label="Date" /><button className="btn-ghost">Go</button></form>}>
      <form action={markStaff}><input type="hidden" name="date" value={date} />
        <Card>{(staff ?? []).length === 0 ? <Empty title="No staff yet" hint="Add staff in Staff and HR." /> : (
          <table className="tbl"><thead><tr><th>Staff</th><th>Designation</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>{staff!.map((s) => { const a = prev.get(s.id); return (
              <tr key={s.id}><td className="font-medium">{fullName(s)}</td><td>{s.designation}</td>
                <td><select name={`s_${s.id}`} defaultValue={a?.status ?? 'P'} disabled={!can} className="input !w-auto !py-1" aria-label={`Status for ${fullName(s)}`}><option value="P">Present</option><option value="A">Absent</option><option value="L">Late</option><option value="HD">Half day</option><option value="LV">On leave</option></select></td>
                <td className="text-muted">{a?.source ?? ''}</td></tr>); })}</tbody></table>)}
        </Card>
        {can && <button className="btn mt-3">Save staff attendance</button>}
      </form>
    </Page>
  );
}
