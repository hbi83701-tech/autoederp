import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Tabs } from '@/components/ui';
import { fdate, fullName, today, pct } from '@/lib/fmt';
import { addDays } from '@/lib/calendar';
import { riskReasons } from '@/lib/rules/risk';
import { entitiesOf } from '@/lib/nav';

export const metadata = { title: 'Wellbeing' };
export default async function Wellbeing({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'feed' } = await searchParams;
  const ctx = await requireCap('wellbeing');
  const tabs = [{ href: '/wellbeing', label: 'Growth record' }, { href: '/wellbeing?tab=warning', label: 'Early warning' }, ...(ctx.can('health') ? [{ href: '/wellbeing?tab=health', label: 'Health alerts' }] : []), { href: '/wellbeing?tab=more', label: 'Houses, clubs and registers' }];
  return (
    <Page title="Wellbeing, health and conduct" sub="One growth record per student, with visibility levels for teachers, the counsellor and leadership.">
      <Tabs current={tab === 'feed' ? '/wellbeing' : `/wellbeing?tab=${tab}`} tabs={tabs} />
      {tab === 'feed' && <Feed />}{tab === 'warning' && <Warning />}{tab === 'health' && <Health />}{tab === 'more' && <More />}
    </Page>
  );
  async function Feed() {
    const { data } = await ctx.sb.from('growth_records').select('id, type, category, note, date, visibility, follow_up_date, follow_up_done, recorded_by_name, student:students!growth_records_student_id_fkey(id, first_name, last_name)').order('date', { ascending: false }).limit(80);
    const G = (data ?? []) as unknown as { id: string; type: string; category: string; note: string; date: string; visibility: string; follow_up_date: string | null; follow_up_done: boolean; recorded_by_name: string; student: { id: string; first_name: string; last_name: string } | null }[];
    const due = G.filter((g) => g.follow_up_date && !g.follow_up_done && g.follow_up_date <= today());
    return <div className="grid gap-4 lg:grid-cols-3"><Card title="Recent records" className="lg:col-span-2">{G.length === 0 ? <Empty title="Nothing recorded yet" hint="Add anecdotes, achievements, observations and discipline notes from a student's page (Growth record tab)." /> : <ul className="divide-y divide-line text-sm">{G.map((g) => <li key={g.id} className="px-4 py-2.5"><div className="flex flex-wrap items-center gap-2"><Link className="link font-medium" href={`/students/${g.student?.id}?tab=growth`}>{fullName(g.student)}</Link><Badge tone={g.type === 'discipline' ? 'red' : g.type === 'achievement' ? 'green' : 'blue'}>{g.type}</Badge>{g.visibility !== 'teacher' && <Badge tone="amber">{g.visibility} only</Badge>}<span className="text-xs text-muted">{fdate(g.date)} · {g.recorded_by_name}</span></div><p>{g.note}</p></li>)}</ul>}</Card>
      <Card title={`Follow-ups due (${due.length})`}>{due.length === 0 ? <Empty title="No follow-ups due" /> : <ul className="divide-y divide-line text-sm">{due.map((g) => <li key={g.id} className="px-4 py-2"><Link className="link" href={`/x/growth_records/${g.id}?back=/wellbeing`}>{fullName(g.student)}</Link><div className="text-muted">{g.note.slice(0, 80)}</div></li>)}</ul>}</Card></div>;
  }
  async function Warning() {
    const d = today(), two = addDays(d, -14);
    let sq = ctx.sb.from('students').select('id, first_name, last_name, section:sections!students_section_id_fkey(name)').eq('status', 'active').limit(3000);
    if (ctx.branchId) sq = sq.eq('branch_id', ctx.branchId);
    const [{ data: studs }, { data: att }, { data: res }, { data: hw }, { data: inc }] = await Promise.all([sq,
      ctx.sb.from('attendance').select('student_id, status, date').eq('person_type', 'student').eq('session', 'day').gte('date', ctx.year?.start_date ?? '2000-01-01').limit(200000),
      ctx.can('marks') ? ctx.sb.from('assessment_results').select('student_id, marks, assessment:assessments!assessment_results_assessment_id_fkey(max_marks, term)').not('marks', 'is', null).limit(100000) : Promise.resolve({ data: [] }),
      ctx.sb.from('post_submissions').select('student_id').eq('late', true).limit(20000), ctx.sb.from('growth_records').select('student_id').eq('type', 'discipline').gte('date', addDays(d, -120)).limit(20000)]);
    const by = <T extends { student_id: string }>(rows: T[] | null) => { const m = new Map<string, T[]>(); for (const r of rows ?? []) m.set(r.student_id, [...(m.get(r.student_id) ?? []), r]); return m; };
    const A = by(att), R = by(res as unknown as { student_id: string; marks: number; assessment: { max_marks: number; term: string } | null }[]), H = by(hw), I = by(inc);
    const avg = (rows: { marks: number; assessment: { max_marks: number } | null }[]) => rows.length ? Math.round(rows.reduce((t, r) => t + (Number(r.marks) / Number(r.assessment?.max_marks || 100)) * 100, 0) / rows.length) : null;
    const flagged = ((studs ?? []) as unknown as { id: string; first_name: string; last_name: string; section: { name: string } | null }[]).map((s) => { const a = A.get(s.id) ?? [], r = R.get(s.id) ?? []; const terms = [...new Set(r.map((x) => x.assessment?.term))].sort(); const cur = r.filter((x) => x.assessment?.term === terms[terms.length - 1]), prev = terms.length > 1 ? r.filter((x) => x.assessment?.term === terms[terms.length - 2]) : [];
      return { s, reasons: riskReasons({ attendancePct: a.length ? pct(a.filter((x) => !['A', 'LV'].includes(x.status)).length, a.length) : null, recentAbsences: a.filter((x) => x.status === 'A' && x.date >= two).length, avgPct: avg(cur), prevAvgPct: avg(prev), homeworkLate: (H.get(s.id) ?? []).length, incidents: (I.get(s.id) ?? []).length }) }; }).filter((x) => x.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length);
    return <Card title={`${flagged.length} students may need support`}>{flagged.length === 0 ? <Empty title="No students are flagged" hint="The view combines attendance, marks trend, homework and incidents, and always explains why. It is never shown to parents or students." /> : <table className="tbl"><thead><tr><th>Student</th><th>Class</th><th>Why</th></tr></thead><tbody>{flagged.slice(0, 100).map(({ s, reasons }) => <tr key={s.id}><td><Link className="link font-medium" href={`/students/${s.id}`}>{fullName(s)}</Link></td><td>{s.section?.name}</td><td>{reasons.join(' · ')}</td></tr>)}</tbody></table>}
      <p className="border-t border-line px-4 py-2 text-xs text-muted">For staff only. This is a prompt to look closer, not a judgement about a child.</p></Card>;
  }
  async function Health() {
    const [{ data: sens }, { data: visits }] = await Promise.all([ctx.can('sensitive') ? ctx.sb.from('student_sensitive').select('allergies, chronic_conditions, medications, student:students!student_sensitive_student_id_fkey(id, first_name, last_name, status, section:sections!students_section_id_fkey(name))').or('allergies.not.is.null,chronic_conditions.not.is.null').limit(1000) : Promise.resolve({ data: [] }),
      ctx.sb.from('infirmary_visits').select('id, at, complaint, action, parent_informed, student:students!infirmary_visits_student_id_fkey(first_name, last_name)').order('at', { ascending: false }).limit(30)]);
    const S = ((sens ?? []) as unknown as { allergies: string | null; chronic_conditions: string | null; medications: string | null; student: { id: string; first_name: string; last_name: string; status: string; section: { name: string } | null } | null }[]).filter((x) => x.student?.status === 'active');
    return <div className="grid gap-4 lg:grid-cols-2"><Card title="Allergy and medical alerts (need-to-know)">{S.length === 0 ? <Empty title="No alerts recorded" hint="Shown to class teachers, the canteen counter and trip organisers." /> : <table className="tbl"><thead><tr><th>Student</th><th>Class</th><th>Alert</th></tr></thead><tbody>{S.map((x, i) => <tr key={i}><td><Link className="link" href={`/students/${x.student?.id}?tab=health`}>{fullName(x.student)}</Link></td><td>{x.student?.section?.name}</td><td>{[x.allergies && `Allergy: ${x.allergies}`, x.chronic_conditions, x.medications && `Medication: ${x.medications}`].filter(Boolean).join(' · ')}</td></tr>)}</tbody></table>}</Card>
      <Card title="Infirmary visits" actions={ctx.can('health', 'write') ? <Link className="link text-sm" href="/x/infirmary_visits/new?back=/wellbeing?tab=health">Log a visit</Link> : undefined}>{(visits ?? []).length === 0 ? <Empty title="No visits logged" /> : <ul className="divide-y divide-line text-sm">{(visits as unknown as { id: string; at: string; complaint: string; action: string; parent_informed: boolean; student: { first_name: string; last_name: string } | null }[]).map((v) => <li key={v.id} className="px-4 py-2">{fullName(v.student)} · {v.complaint}<div className="text-xs text-muted">{fdate(v.at)} · {v.action}{v.parent_informed ? ' · parent informed' : ''}</div></li>)}</ul>}</Card></div>;
  }
  async function More() {
    const { data: hp } = await ctx.sb.from('house_points').select('house, points');
    const tot = new Map<string, number>(); for (const h of hp ?? []) tot.set(h.house, (tot.get(h.house) ?? 0) + h.points);
    const ents = [...entitiesOf('wellbeing'), ...entitiesOf('health'), ...entitiesOf('activities')].filter((e) => ctx.can(e.cap));
    return <div className="grid gap-4 lg:grid-cols-3"><Card title="House leaderboard">{tot.size === 0 ? <Empty title="No house points yet" /> : <ol className="divide-y divide-line text-sm">{[...tot].sort((a, b) => b[1] - a[1]).map(([h, p], i) => <li key={h} className="flex justify-between px-4 py-2.5"><span>{i + 1}. {h}</span><span className="font-semibold">{p}</span></li>)}</ol>}</Card>
      <Card title="Registers" className="lg:col-span-2"><div className="grid gap-px bg-line sm:grid-cols-2">{ents.map((e) => <Link key={e.table} href={`/x/${e.table}`} className="bg-white px-4 py-3 text-sm hover:bg-paper">{e.title}</Link>)}<Link href="/x/student_groups" className="bg-white px-4 py-3 text-sm hover:bg-paper">Clubs, activities and mentor groups</Link></div></Card></div>;
  }
}
