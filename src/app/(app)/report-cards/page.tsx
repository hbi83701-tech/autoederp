import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { fullName } from '@/lib/fmt';
import { aiEnabled } from '@/lib/ai';
import { generateCards, draftRemarks, advanceCards, saveRemark } from './actions';

export const metadata = { title: 'Report cards' };
export default async function ReportCards({ searchParams }: { searchParams: Promise<{ section?: string; term?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('marks');
  const [{ data: sections }, { data: scheme }] = await Promise.all([
    ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name'),
    ctx.sb.from('assessment_schemes').select('name, pack, config').eq('active', true).eq('year_id', ctx.year?.id ?? '').limit(1).maybeSingle(),
  ]);
  const terms = ((scheme?.config ?? {}) as { terms?: string[] }).terms ?? ['Term 1', 'Term 2'];
  const term = sp.term ?? terms[0];
  const [{ data: cards }, { data: pending }] = sp.section ? await Promise.all([
    ctx.sb.from('report_cards').select('id, status, class_teacher_remark, snapshot, views, student:students!report_cards_student_id_fkey(first_name, last_name, roll_no)').eq('section_id', sp.section).eq('term', term).eq('year_id', ctx.year?.id ?? ''),
    ctx.sb.from('assessments').select('id, name, status').eq('section_id', sp.section).eq('term', term).eq('year_id', ctx.year?.id ?? '').eq('status', 'open'),
  ]) : [{ data: null }, { data: null }];
  const C = ((cards ?? []) as unknown as { id: string; status: string; class_teacher_remark: string | null; views: number; snapshot: { overall: number | null; overall_grade: string | null; rank: number | null }; student: { first_name: string; last_name: string; roll_no: number | null } | null }[]).sort((a, b) => (a.student?.roll_no ?? 999) - (b.student?.roll_no ?? 999));
  const n = (s: string) => C.filter((c) => c.status === s).length;
  const hidden = <><input type="hidden" name="section" value={sp.section ?? ''} /><input type="hidden" name="term" value={term} /></>;
  const can = ctx.can('marks', 'write');
  const back = `/report-cards?section=${sp.section}&term=${encodeURIComponent(term)}`;
  return (
    <Page title="Report cards" sub={`${scheme?.name ?? 'No active scheme'} · generate, check, sign off and publish a whole section in one place.`} actions={<Link className="btn-ghost" href="/x/remark_bank">Remark bank</Link>}>
      <form className="no-print mb-4 flex flex-wrap gap-2"><select name="section" defaultValue={sp.section ?? ''} className="input !w-auto" aria-label="Section" required><option value="">Choose a section</option>{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select name="term" defaultValue={term} className="input !w-auto" aria-label="Term">{terms.map((t) => <option key={t}>{t}</option>)}</select><button className="btn-ghost">Open</button></form>
      {!sp.section ? <Card><Empty title="Choose a section and term" hint="Cards are built from the marks in the gradebook using the school's scheme, weightages and grading scale." /></Card> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="Draft" value={n('draft')} /><Stat label="Reviewed" value={n('reviewed')} /><Stat label="Signed off" value={n('signed')} /><Stat label="Published" value={n('published')} tone={n('published') ? 'good' : undefined} /><Stat label="Opened by parents" value={C.filter((c) => c.views > 0).length} /></div>
        {(pending ?? []).length > 0 && <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">Marks entry is still open for: {pending!.map((p) => p.name).join(', ')}. You can generate now and refresh later.</div>}
        {can && <div className="no-print mb-4 flex flex-wrap gap-2">
          <form action={generateCards}>{hidden}<button className="btn">{C.length ? 'Refresh from latest marks' : 'Generate report cards'}</button></form>
          {C.length > 0 && <form action={draftRemarks}>{hidden}<button className="btn-ghost">Draft missing remarks{aiEnabled() ? ' with AI' : ''}</button></form>}
          {n('draft') > 0 && <form action={advanceCards}>{hidden}<button name="to" value="reviewed" className="btn-ghost">Mark {n('draft')} as reviewed</button></form>}
          {n('reviewed') > 0 && <form action={advanceCards}>{hidden}<button name="to" value="signed" className="btn-ghost">Principal sign-off ({n('reviewed')})</button></form>}
          {n('signed') > 0 && <form action={advanceCards}>{hidden}<ConfirmSubmit name="to" value="published" className="btn" message={`Publish ${n('signed')} report cards to parents? Marks for this term will be locked.`}>Publish to parents ({n('signed')})</ConfirmSubmit></form>}
        </div>}
        <Card>{C.length === 0 ? <Empty title="No report cards generated yet" hint="Generate to preview each student's card. Nothing is visible to parents until it is published." /> : (
          <table className="tbl"><thead><tr><th>Roll</th><th>Student</th><th>Overall</th><th>Grade</th><th>Rank</th><th className="w-2/5">Class teacher remark</th><th>Status</th></tr></thead>
            <tbody>{C.map((c) => <tr key={c.id}><td>{c.student?.roll_no}</td><td><Link className="link font-medium" href={`/report-cards/${c.id}`}>{fullName(c.student)}</Link></td><td>{c.snapshot?.overall ?? '—'}{c.snapshot?.overall !== null ? '%' : ''}</td><td>{c.snapshot?.overall_grade}</td><td>{c.snapshot?.rank}</td>
              <td>{c.status === 'published' || !can ? c.class_teacher_remark : <form action={saveRemark} className="flex gap-1"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="back" value={back} /><textarea name="class_teacher_remark" rows={2} defaultValue={c.class_teacher_remark ?? ''} className="input !py-1 text-xs" aria-label={`Remark for ${fullName(c.student)}`} /><button className="btn-ghost btn-sm self-start">Save</button></form>}</td>
              <td><Badge>{c.status}</Badge></td></tr>)}</tbody></table>)}</Card>
      </>}
    </Page>
  );
}
