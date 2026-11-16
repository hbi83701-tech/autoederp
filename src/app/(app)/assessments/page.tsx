import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field, Tabs, Meter } from '@/components/ui';
import { fdate, fullName, today } from '@/lib/fmt';
import { createAssessment } from './actions';

export const metadata = { title: 'Assessment' };
type A = { id: string; name: string; term: string; component: string | null; status: string; entry_deadline: string | null; max_marks: number; section_id: string; staff_id: string | null; section: { name: string } | null; subject: { name: string } | null; staff: { first_name: string; last_name: string } | null; results: { count: number }[] };
export default async function Assessments({ searchParams }: { searchParams: Promise<{ tab?: string; term?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'list';
  const ctx = await requireCap('marks');
  const mine = ['class_teacher', 'subject_teacher'].includes(ctx.role) && ctx.profile.staff_id;
  let q = ctx.sb.from('assessments').select('id, name, term, component, status, entry_deadline, max_marks, section_id, staff_id, section:sections!assessments_section_id_fkey(name), subject:subjects!assessments_subject_id_fkey(name), staff:staff!assessments_staff_id_fkey(first_name, last_name), results:assessment_results(count)').eq('year_id', ctx.year?.id ?? '').order('created_at', { ascending: false }).limit(400);
  if (mine && tab === 'list') q = q.eq('staff_id', mine);
  if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  if (sp.term) q = q.eq('term', sp.term);
  const [{ data }, { data: sections }, { data: subjects }, { data: scheme }, { data: strength }] = await Promise.all([q,
    ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name'), ctx.sb.from('subjects').select('id, name').order('name'),
    ctx.sb.from('assessment_schemes').select('config').eq('active', true).limit(1).maybeSingle(), ctx.sb.from('students').select('section_id').eq('status', 'active').limit(20000)]);
  const rows = (data ?? []) as unknown as A[];
  const cfg = (scheme?.config ?? {}) as { terms?: string[]; components?: { name: string; weightage: number }[] };
  const size = new Map<string, number>(); for (const s of strength ?? []) if (s.section_id) size.set(s.section_id, (size.get(s.section_id) ?? 0) + 1);
  const d = today();
  const can = ctx.can('marks', 'write');
  // Status board: pending entry by teacher (GB-04)
  const byTeacher = new Map<string, { name: string; total: number; done: number; late: number }>();
  for (const a of rows) { const k = a.staff_id ?? 'none'; const x = byTeacher.get(k) ?? { name: a.staff ? fullName(a.staff) : 'Not assigned', total: 0, done: 0, late: 0 }; x.total++; if (a.status !== 'open') x.done++; else if (a.entry_deadline && a.entry_deadline < d) x.late++; byTeacher.set(k, x); }
  return (
    <Page title="Assessment" sub="One assessment engine for every board. Create tests, enter marks in a grid, and track what is pending." actions={<><Link className="btn-ghost" href="/x/assessment_schemes">Schemes</Link><Link className="btn-ghost" href="/x/rubric_results">Skills and rubrics</Link><Link className="btn" href="/report-cards">Report cards</Link></>}>
      <Tabs current={tab === 'list' ? '/assessments' : `/assessments?tab=${tab}`} tabs={[{ href: '/assessments', label: mine ? 'My assessments' : 'Assessments' }, { href: '/assessments?tab=board', label: 'Marks-entry status board' }]} />
      {tab === 'board' ? (
        <Card>{byTeacher.size === 0 ? <Empty title="No assessments yet" /> : <table className="tbl"><thead><tr><th>Teacher</th><th>Assessments</th><th className="w-1/3">Entry complete</th><th>Past deadline</th></tr></thead><tbody>
          {[...byTeacher.values()].sort((a, b) => b.late - a.late).map((t) => <tr key={t.name}><td className="font-medium">{t.name}</td><td>{t.done} / {t.total}</td><td><Meter value={t.done} max={t.total} /></td><td>{t.late ? <Badge tone="red">{t.late} late</Badge> : ''}</td></tr>)}</tbody></table>}</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">{rows.length === 0 ? <Empty title="No assessments yet" hint="Create a test for one or more sections. The teacher assigned to that subject sees it under “Marks due”." /> : <table className="tbl"><thead><tr><th>Assessment</th><th>Section</th><th>Subject</th><th>Entered</th><th>Deadline</th><th>Status</th></tr></thead>
            <tbody>{rows.map((a) => { const n = a.results?.[0]?.count ?? 0, of = size.get(a.section_id) ?? 0; return <tr key={a.id}><td><Link className="link font-medium" href={`/assessments/${a.id}`}>{a.name}</Link><div className="text-xs text-muted">{a.term}{a.component ? ` · ${a.component}` : ''}</div></td><td>{a.section?.name}</td><td>{a.subject?.name}</td><td>{n} / {of}</td><td className={a.status === 'open' && a.entry_deadline && a.entry_deadline < d ? 'text-red-600' : ''}>{fdate(a.entry_deadline)}</td><td><Badge>{a.status}</Badge></td></tr>; })}</tbody></table>}</Card>
          {can && <Card title="New assessment"><form action={createAssessment} className="space-y-3 p-4">
            <Field label="Name"><input name="name" className="input" required placeholder="Periodic Test 1" /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Term"><select name="term" className="input">{(cfg.terms ?? ['Term 1', 'Term 2']).map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Component"><select name="component" className="input"><option value="">—</option>{(cfg.components ?? []).map((c) => <option key={c.name} value={c.name}>{c.name} ({c.weightage}%)</option>)}</select></Field></div>
            <Field label="Subject"><select name="subject_id" className="input" required>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Sections" help="Hold Ctrl to choose several."><select name="section_id" multiple required size={5} className="input">{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Max marks"><input name="max_marks" type="number" defaultValue={100} className="input" /></Field><Field label="Test date"><input name="date" type="date" className="input" /></Field></div>
            <Field label="Marks-entry deadline"><input name="entry_deadline" type="date" className="input" /></Field>
            <button className="btn w-full">Create</button></form></Card>}
        </div>)}
    </Page>
  );
}
