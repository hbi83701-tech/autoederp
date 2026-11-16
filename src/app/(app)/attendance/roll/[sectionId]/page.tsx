import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { today, fdate, fullName } from '@/lib/fmt';
import { workingDay } from '@/lib/calendar';
import { Roll } from './roll';

export default async function RollPage({ params, searchParams }: { params: Promise<{ sectionId: string }>; searchParams: Promise<{ date?: string; session?: string }> }) {
  const [{ sectionId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireCap('attendance', 'write');
  const date = sp.date ?? today(), session = sp.session ?? 'day';
  const { data: sec } = await ctx.sb.from('sections').select('id, name, branch_id').eq('id', sectionId).maybeSingle();
  if (!sec) notFound();
  const [{ data: studs }, { data: att }, wd, { data: sens }] = await Promise.all([
    ctx.sb.from('students').select('id, first_name, last_name, roll_no').eq('section_id', sectionId).eq('status', 'active').order('roll_no').order('first_name'),
    ctx.sb.from('attendance').select('student_id, status').eq('section_id', sectionId).eq('date', date).eq('session', session),
    workingDay(ctx, date, sec.branch_id),
    ctx.can('sensitive') ? ctx.sb.from('student_sensitive').select('student_id, allergies').not('allergies', 'is', null) : Promise.resolve({ data: [] }),
  ]);
  const prev = new Map((att ?? []).map((a) => [a.student_id, a.status]));
  const allergy = new Map((sens ?? []).map((s) => [s.student_id, s.allergies]));
  const students = (studs ?? []).map((s) => ({ id: s.id, name: fullName(s), roll_no: s.roll_no, status: (prev.get(s.id) ?? 'P') as 'P' | 'A' | 'L' | 'LV', alert: allergy.get(s.id) ? `Allergy: ${allergy.get(s.id)}` : null }));
  return (
    <Page title={`Roll call · ${sec.name}`} sub={<>{fdate(date)} · {session === 'day' ? 'Daily' : session} · <Link className="link" href="/attendance">Back to board</Link></>}
      actions={<form className="flex gap-2"><input type="date" name="date" defaultValue={date} max={today()} className="input !w-auto" aria-label="Date" /><select name="session" defaultValue={session} className="input !w-auto" aria-label="Session">{['day', 'am', 'pm', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'hostel_am', 'hostel_pm', 'study'].map((s) => <option key={s} value={s}>{s === 'day' ? 'Daily' : s}</option>)}</select><button className="btn-ghost">Go</button></form>}>
      {!wd.working && <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">{wd.reason}. This date is not counted as a working day, so nothing is expected.</div>}
      {students.length === 0 ? <Card><Empty title="No active students in this section" hint="Admit students or move them into this section from Students → Bulk actions." /></Card>
        : <Roll key={`${date}${session}`} sectionId={sectionId} date={date} session={session} students={students} alreadyMarked={prev.size > 0} />}
    </Page>
  );
}
