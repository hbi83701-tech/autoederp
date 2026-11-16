import Link from 'next/link';
import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { fdate, pct } from '@/lib/fmt';
import { ChildSwitcher } from '../switcher';

export const metadata = { title: 'Academics' };
export default async function ParentAcademics() {
  const { ctx, children, child, t } = await family();
  if (!child) return <Page title={t('Academics')}><Card><Empty title="No child linked" /></Card></Page>;
  const [{ data: cards }, { data: res }, { data: att }, { data: growth }, { data: ext }] = await Promise.all([
    ctx.sb.from('report_cards').select('id, term, published_at').eq('student_id', child.id).eq('status', 'published'),
    ctx.sb.from('assessment_results').select('marks, code, assessment:assessments!assessment_results_assessment_id_fkey(name, term, max_marks, date, subject:subjects!assessments_subject_id_fkey(name))').eq('student_id', child.id).limit(100),
    ctx.sb.from('attendance').select('status, date').eq('student_id', child.id).eq('session', 'day').limit(400),
    ctx.sb.from('growth_records').select('id, type, category, note, date').eq('student_id', child.id).order('date', { ascending: false }).limit(10),
    ctx.sb.from('external_exam_results').select('id, exam, score, rank').eq('student_id', child.id),
  ]);
  const A = att ?? []; const present = A.filter((a) => !['A', 'LV'].includes(a.status)).length;
  const R = (res ?? []) as unknown as { marks: number | null; code: string | null; assessment: { name: string; term: string; max_marks: number; subject: { name: string } | null } | null }[];
  return (
    <Page title={t('Academics')} sub={`${child.first_name} · ${child.section?.name ?? ''}`} actions={<ChildSwitcher children={children} current={child.id} />}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3"><Stat label="Attendance this year" value={A.length ? `${pct(present, A.length)}%` : '—'} hint={`${A.filter((a) => a.status === 'A').length} days absent`} /><Stat label="Report cards" value={(cards ?? []).length} /><Stat label="Published assessments" value={R.length} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Report cards">{(cards ?? []).length === 0 ? <Empty title="No report card published yet" hint="You will get a notification when the school publishes it." /> : <ul className="divide-y divide-line text-sm">{cards!.map((c) => <li key={c.id} className="flex justify-between px-4 py-2.5"><Link className="link font-medium" href={`/report-cards/${c.id}`}>{c.term}</Link><span className="text-muted">{fdate(c.published_at)}</span></li>)}</ul>}</Card>
        <Card title="Assessments" className="lg:col-span-2">{R.length === 0 ? <Empty title="No marks published yet" /> : <table className="tbl"><thead><tr><th>Assessment</th><th>Subject</th><th>Term</th><th className="text-right">Marks</th></tr></thead><tbody>{R.map((r, i) => <tr key={i}><td>{r.assessment?.name}</td><td>{r.assessment?.subject?.name}</td><td>{r.assessment?.term}</td><td className="text-right tabular-nums">{r.code ?? r.marks} / {r.assessment?.max_marks}</td></tr>)}</tbody></table>}</Card>
        <Card title="From the teachers" className="lg:col-span-2">{(growth ?? []).length === 0 ? <Empty title="Nothing shared yet" hint="Achievements and notes the school chooses to share appear here." /> : <ul className="divide-y divide-line text-sm">{growth!.map((g) => <li key={g.id} className="px-4 py-2.5"><Badge tone={g.type === 'achievement' ? 'green' : 'blue'}>{g.type}</Badge> <span className="text-xs text-muted">{fdate(g.date)}</span><p>{g.note}</p></li>)}</ul>}</Card>
        <Card title="External exams">{(ext ?? []).length === 0 ? <div className="p-4 text-sm text-muted">None recorded.</div> : <ul className="divide-y divide-line text-sm">{ext!.map((e) => <li key={e.id} className="flex justify-between px-4 py-2"><span>{e.exam}</span><span>{e.score}{e.rank ? ` · rank ${e.rank}` : ''}</span></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
