import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCap } from '@/lib/ctx';
import { Page, Badge, Card, Stat } from '@/components/ui';
import { fdate, fullName, pct } from '@/lib/fmt';
import { MarksGrid } from './grid';
import { setAssessmentStatus } from '../actions';

export default async function Assessment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCap('marks');
  const { data: a } = await ctx.sb.from('assessments').select('*, section:sections!assessments_section_id_fkey(id, name), subject:subjects!assessments_subject_id_fkey(name)').eq('id', id).maybeSingle();
  if (!a) notFound();
  const [{ data: studs }, { data: res }] = await Promise.all([
    ctx.sb.from('students').select('id, first_name, last_name, roll_no').eq('section_id', a.section_id).eq('status', 'active').order('roll_no').order('first_name'),
    ctx.sb.from('assessment_results').select('student_id, marks, code').eq('assessment_id', id),
  ]);
  const prev = new Map((res ?? []).map((r) => [r.student_id, r.code ?? (r.marks === null ? '' : String(r.marks))]));
  const locked = ['locked', 'published'].includes(a.status) || !ctx.can('marks', 'write');
  const nums = (res ?? []).filter((r) => r.marks !== null).map((r) => Number(r.marks));
  const pass = nums.filter((n) => pct(n, Number(a.max_marks)) >= 33).length;
  return (
    <Page title={a.name} sub={<>{a.section?.name} · {a.subject?.name} · {a.term}{a.component ? ` · ${a.component}` : ''} · <Badge>{a.status}</Badge> · <Link className="link" href="/assessments">All assessments</Link></>}
      actions={ctx.can('marks', 'write') ? <form action={setAssessmentStatus} className="flex gap-2"><input type="hidden" name="id" value={id} />
        {a.status === 'open' && <button name="status" value="submitted" className="btn-ghost">Mark entry complete</button>}
        {a.status === 'submitted' && <button name="status" value="open" className="btn-ghost">Reopen for entry</button>}
        {['locked', 'published'].includes(a.status) && <><input name="reason" required placeholder="Reason for unlock" className="input !w-56" aria-label="Reason" /><button name="status" value="unlock" className="btn-ghost">Request unlock</button></>}</form> : undefined}>
      {nums.length > 0 && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Average" value={`${(nums.reduce((t, n) => t + n, 0) / nums.length).toFixed(1)}`} hint={`of ${a.max_marks}`} /><Stat label="Highest" value={Math.max(...nums)} /><Stat label="Lowest" value={Math.min(...nums)} /><Stat label="At or above 33%" value={`${pass} / ${nums.length}`} /></div>}
      {a.entry_deadline && a.status === 'open' && <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">Entry deadline: {fdate(a.entry_deadline)}</div>}
      {['locked', 'published'].includes(a.status) && <Card className="mb-3"><div className="px-4 py-2 text-sm">These marks are locked because the report cards were published. A change needs an approved unlock and is recorded in the audit trail.</div></Card>}
      <MarksGrid assessmentId={id} max={Number(a.max_marks)} locked={locked} rows={(studs ?? []).map((s) => ({ student_id: s.id, name: fullName(s), roll_no: s.roll_no, value: prev.get(s.id) ?? '' }))} />
    </Page>
  );
}
