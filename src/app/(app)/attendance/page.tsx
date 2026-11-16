import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { today, fdate, ftime, pct } from '@/lib/fmt';
import { workingDay } from '@/lib/calendar';

export const metadata = { title: 'Attendance' };
/** Live "not marked" board for coordinators; teachers see their own sections first (ATT-06). */
export default async function Board({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = today() } = await searchParams;
  const ctx = await requireCap('attendance');
  let sq = ctx.sb.from('sections').select('id, name, class_teacher_id, teacher:staff!sections_class_teacher_id_fkey(first_name, last_name)').eq('year_id', ctx.year?.id ?? '').order('name');
  if (ctx.branchId) sq = sq.eq('branch_id', ctx.branchId);
  const [{ data: sections }, { data: subs }, wd, { data: counts }] = await Promise.all([
    sq, ctx.sb.from('attendance_submissions').select('*').eq('date', date).eq('session', 'day'), workingDay(ctx, date),
    ctx.sb.from('students').select('section_id').eq('status', 'active').limit(20000),
  ]);
  const sub = new Map((subs ?? []).map((s) => [s.section_id, s]));
  const strength = new Map<string, number>();
  for (const c of counts ?? []) if (c.section_id) strength.set(c.section_id, (strength.get(c.section_id) ?? 0) + 1);
  const rows = ((sections ?? []) as unknown as { id: string; name: string; class_teacher_id: string | null; teacher: { first_name: string; last_name: string } | null }[])
    .sort((a, b) => Number(b.class_teacher_id === ctx.profile.staff_id) - Number(a.class_teacher_id === ctx.profile.staff_id));
  const marked = rows.filter((r) => sub.has(r.id)).length;
  const tp = (subs ?? []).reduce((t, s) => t + (s.present ?? 0) + (s.late ?? 0), 0), ta = (subs ?? []).reduce((t, s) => t + (s.absent ?? 0), 0);
  const canMark = ctx.can('attendance', 'write');
  return (
    <Page title="Attendance" sub={`${fdate(date)}${wd.working ? '' : ` · ${wd.reason}`}`} actions={<>
      <form className="flex gap-2"><input type="date" name="date" defaultValue={date} max={today()} className="input !w-auto" aria-label="Date" /><button className="btn-ghost">Go</button></form>
      <Link className="btn-ghost" href="/attendance/staff">Staff attendance</Link><Link className="btn-ghost" href="/reports/attendance">Reports</Link></>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sections marked" value={`${marked} / ${rows.length}`} tone={wd.working && marked < rows.length ? 'warn' : 'good'} hint={wd.working ? undefined : 'Not a working day'} />
        <Stat label="Present" value={tp} hint={tp + ta ? `${pct(tp, tp + ta)}%` : ''} />
        <Stat label="Absent" value={ta} tone={ta ? 'warn' : undefined} />
        <Stat label="Cut-off" value={String(ctx.branches[0]?.attendance_cutoff ?? '09:30').slice(0, 5)} hint="Teachers are nudged 15 minutes before" />
      </div>
      <Card>{rows.length === 0 ? <Empty title="No sections yet" hint="Create grades and sections in Admin console → Academic structure." /> : (
        <table className="tbl"><thead><tr><th>Section</th><th>Class teacher</th><th>Strength</th><th>Status</th><th>Present</th><th>Absent</th><th>Late</th><th></th></tr></thead>
          <tbody>{rows.map((r) => { const s = sub.get(r.id); return (
            <tr key={r.id}><td className="font-medium">{r.name}</td><td>{r.teacher ? `${r.teacher.first_name} ${r.teacher.last_name ?? ''}` : <span className="text-muted">Not assigned</span>}</td><td>{strength.get(r.id) ?? 0}</td>
              <td>{s ? <><Badge tone="green">marked</Badge> <span className="text-xs text-muted">{ftime(s.submitted_at)} · {s.submitted_by_name}</span></> : wd.working ? <Badge tone="red">not marked</Badge> : <Badge tone="grey">no school</Badge>}</td>
              <td>{s?.present ?? ''}</td><td>{s?.absent ?? ''}</td><td>{s?.late ?? ''}</td>
              <td className="text-right">{canMark && <Link className="btn-ghost btn-sm" href={`/attendance/roll/${r.id}?date=${date}`}>{s ? 'Edit' : 'Mark'}</Link>}</td></tr>); })}</tbody></table>)}
      </Card>
    </Page>
  );
}
