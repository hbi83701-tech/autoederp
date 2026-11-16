import Link from 'next/link';
import { requireCap, ROLE_LABEL } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat, Meter } from '@/components/ui';
import { today, pct, fullName } from '@/lib/fmt';
import { addDays, isWorking } from '@/lib/calendar';

export const metadata = { title: 'Adoption monitor' };
/** Adoption and compliance monitor (ADO-01..03): the system does the checking, and it is calendar-aware. */
export default async function Adoption() {
  const ctx = await requireCap('admin');
  const d = today(), from = addDays(d, -13), sb = ctx.sb;
  const [{ data: profiles }, { data: hol }, { data: secs }, { data: subs }, { data: tt }, { data: posts }, { data: asm }, { data: guardians }] = await Promise.all([
    sb.from('profiles').select('id, role, full_name, last_seen_at, active, staff_id').limit(20000), sb.from('calendar_events').select('start_date, end_date').eq('type', 'holiday'),
    sb.from('sections').select('id, name, class_teacher_id, teacher:staff!sections_class_teacher_id_fkey(first_name, last_name)').eq('year_id', ctx.year?.id ?? ''),
    sb.from('attendance_submissions').select('section_id, date, submitted_at').gte('date', from), sb.from('timetable_entries').select('staff_id, section_id, day').not('staff_id', 'is', null).limit(20000),
    sb.from('posts').select('created_by, section_id, created_at').gte('created_at', from + 'T00:00:00'), sb.from('assessments').select('status, entry_deadline, staff_id').eq('year_id', ctx.year?.id ?? ''), sb.from('guardians').select('user_id').limit(40000),
  ]);
  const wdays: string[] = []; for (let x = from; x <= d; x = addDays(x, 1)) if (isWorking(x, ctx.branches[0]?.working_days as string | undefined, hol ?? [])) wdays.push(x);
  const cutoff = String(ctx.branches[0]?.attendance_cutoff ?? '09:30').slice(0, 5);
  const P = profiles ?? [], month = new Date(Date.now() - 30 * 86400000).toISOString(), week = new Date(Date.now() - 7 * 86400000).toISOString();
  const roles = [...new Set(P.map((p) => p.role))].filter((r) => r !== 'pending');
  const S = (secs ?? []) as unknown as { id: string; name: string; class_teacher_id: string | null; teacher: { first_name: string; last_name: string } | null }[];
  const rows = S.map((s) => { const mine = (subs ?? []).filter((x) => x.section_id === s.id && wdays.includes(x.date)); const onTime = mine.filter((x) => new Date(x.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) <= cutoff).length; return { s, marked: mine.length, onTime }; });
  const parents = P.filter((p) => p.role === 'parent'); const invitedGuardians = (guardians ?? []).filter((g) => g.user_id).length;
  const overdueMarks = (asm ?? []).filter((a) => a.status === 'open' && a.entry_deadline && a.entry_deadline < d).length, dueMarks = (asm ?? []).filter((a) => a.entry_deadline && a.entry_deadline <= d).length;
  const teachers = P.filter((p) => ['class_teacher', 'subject_teacher'].includes(p.role));
  const totalMarked = rows.reduce((t, r) => t + r.marked, 0), expected = S.length * wdays.length;
  void posts; void tt; void fullName;
  return (
    <Page title="Adoption and compliance monitor" sub={`Last 14 days · ${wdays.length} working days. Weekends, holidays and exam days are never counted as misses.`} actions={<><Link className="btn-ghost" href="/x/checklists">Checklists</Link><Link className="btn-ghost" href="/reports/usage?group=never">Never logged in</Link></>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Teachers active this week" value={teachers.length ? `${pct(teachers.filter((p) => p.last_seen_at && p.last_seen_at > week).length, teachers.length)}%` : '—'} hint="target above 90%" />
        <Stat label="Parents active in 30 days" value={parents.length ? `${pct(parents.filter((p) => p.last_seen_at && p.last_seen_at > month).length, parents.length)}%` : '—'} hint={`${invitedGuardians} guardians have a login · target above 75%`} />
        <Stat label="Attendance marking compliance" value={expected ? `${pct(totalMarked, expected)}%` : '—'} hint={`${totalMarked} of ${expected} section-days marked`} tone={expected && pct(totalMarked, expected) < 98 ? 'warn' : 'good'} />
        <Stat label="Marks entered by deadline" value={dueMarks ? `${pct(dueMarks - overdueMarks, dueMarks)}%` : '—'} hint={`${overdueMarks} overdue`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Attendance by ${cutoff}, by section`} className="lg:col-span-2">{rows.length === 0 ? <Empty title="No sections" /> : <table className="tbl"><thead><tr><th>Section</th><th>Class teacher</th><th>Days marked</th><th>On time</th><th className="w-1/4"></th></tr></thead><tbody>{rows.sort((a, b) => a.marked - b.marked).map((r) => <tr key={r.s.id}><td>{r.s.name}</td><td>{r.s.teacher ? `${r.s.teacher.first_name} ${r.s.teacher.last_name ?? ''}` : <Badge tone="amber">not assigned</Badge>}</td><td>{r.marked} / {wdays.length}</td><td>{r.onTime}</td><td><Meter value={r.marked} max={wdays.length || 1} tone={r.marked < wdays.length ? 'amber' : 'brand'} /></td></tr>)}</tbody></table>}</Card>
        <Card title="Logins by role"><table className="tbl"><thead><tr><th>Role</th><th>Users</th><th>Active (30 days)</th><th>Never</th></tr></thead><tbody>{roles.map((r) => { const u = P.filter((p) => p.role === r); return <tr key={r}><td>{ROLE_LABEL[r] ?? r}</td><td>{u.length}</td><td>{u.filter((p) => p.last_seen_at && p.last_seen_at > month).length}</td><td>{u.filter((p) => !p.last_seen_at).length}</td></tr>; })}</tbody></table></Card>
      </div>
      <p className="mt-3 text-sm text-muted">Daily homework posting is tracked under <Link className="link" href="/homework?tab=compliance">Homework → Posting compliance</Link>; marks entry under <Link className="link" href="/assessments?tab=board">Assessment → Status board</Link>.</p>
    </Page>
  );
}
