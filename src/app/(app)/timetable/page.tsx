import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fullName } from '@/lib/fmt';
import { DAYS } from '@/lib/calendar';
import { findClashes, type Entry } from '@/lib/rules/timetable';
import { setCell, autoGenerate } from './actions';

export const metadata = { title: 'Timetable' };
export default async function Timetable({ searchParams }: { searchParams: Promise<{ section?: string; teacher?: string; edit?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('timetable');
  const mineStaff = ['class_teacher', 'subject_teacher'].includes(ctx.role) ? ctx.profile.staff_id as string | null : null;
  const teacher = sp.teacher ?? (!sp.section ? mineStaff : null);
  const [{ data: sections }, { data: bells }, { data: subjects }, { data: staff }, { data: all }] = await Promise.all([
    ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name'),
    ctx.sb.from('bell_periods').select('period_no, name, start_time, end_time, is_break').eq('day_type', 'weekday').order('start_time'),
    ctx.sb.from('subjects').select('id, name').order('name'), ctx.sb.from('staff').select('id, first_name, last_name').eq('status', 'active').in('staff_type', ['teaching', 'admin']).order('first_name'),
    ctx.sb.from('timetable_entries').select('id, section_id, day, period_no, subject_id, staff_id, room').eq('year_id', ctx.year?.id ?? '').limit(20000),
  ]);
  const E = (all ?? []) as Entry[];
  const days: number[] = String(ctx.branches[0]?.working_days ?? '1,2,3,4,5,6').split(',').map(Number);
  const periods = (bells ?? []).filter((b) => !b.is_break);
  const view = E.filter((e) => (sp.section ? e.section_id === sp.section : teacher ? e.staff_id === teacher : false));
  const name = { sub: new Map((subjects ?? []).map((s) => [s.id, s.name])), staff: new Map((staff ?? []).map((s) => [s.id, fullName(s)])), sec: new Map((sections ?? []).map((s) => [s.id, s.name])) };
  const clashes = findClashes(E).filter((c) => c.kind === 'teacher');
  const can = ctx.can('timetable', 'write');
  const [ed, ep] = (sp.edit ?? '').split('-').map(Number);
  const cur = view.find((e) => e.day === ed && e.period_no === ep);
  const load = new Map<string, number>(); for (const e of E) if (e.staff_id) load.set(e.staff_id, (load.get(e.staff_id) ?? 0) + 1);
  return (
    <Page title="Timetable" sub="Section, teacher and room timetables from one grid. Clashes are checked as you save." actions={<><Link className="btn-ghost" href="/x/teacher_assignments">Teaching assignments</Link><Link className="btn-ghost" href="/x/bell_periods">Bell schedule</Link><Link className="btn" href="/timetable/substitutions">Substitutions</Link></>}>
      <form className="no-print mb-3 flex flex-wrap gap-2"><select name="section" defaultValue={sp.section ?? ''} className="input !w-auto" aria-label="Section"><option value="">Section…</option>{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="teacher" defaultValue={sp.section ? '' : teacher ?? ''} className="input !w-auto" aria-label="Teacher"><option value="">Teacher…</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)} ({load.get(s.id) ?? 0}/wk)</option>)}</select><button className="btn-ghost">Show</button>
        {can && <button formAction={autoGenerate} className="btn-ghost">{sp.section ? 'Auto-fill this section' : 'Auto-generate all sections'}</button>}</form>
      {clashes.length > 0 && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{clashes.length} teacher clash{clashes.length > 1 ? 'es' : ''}: {clashes.slice(0, 4).map((c) => `${name.staff.get(c.key) ?? 'Teacher'} on ${DAYS[c.day]} period ${c.period_no} (${c.sections.map((s) => name.sec.get(s)).join(', ')})`).join('; ')}</div>}
      {!sp.section && !teacher ? <Card><Empty title="Choose a section or a teacher" hint="Start with teaching assignments, then auto-generate and fine-tune by clicking any cell." /></Card> : (
        <Card><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Period</th>{days.map((d) => <th key={d}>{DAYS[d]}</th>)}</tr></thead>
          <tbody>{(bells ?? []).map((b, i) => b.is_break ? <tr key={`b${i}`}><td colSpan={days.length + 1} className="bg-paper text-center text-xs text-muted">{b.name} · {String(b.start_time).slice(0, 5)}</td></tr> : (
            <tr key={b.period_no}><td className="whitespace-nowrap text-xs text-muted"><b className="text-ink">{b.period_no}</b> {String(b.start_time).slice(0, 5)}–{String(b.end_time).slice(0, 5)}</td>
              {days.map((d) => { const e = view.find((x) => x.day === d && x.period_no === b.period_no); const body = e ? <><div className="font-medium">{name.sub.get(e.subject_id ?? '') ?? '—'}</div><div className="text-xs text-muted">{sp.section ? name.staff.get(e.staff_id ?? '') : name.sec.get(e.section_id)}{e.room ? ` · ${e.room}` : ''}</div></> : <span className="text-xs text-muted">{can && sp.section ? '+ add' : ''}</span>;
                return <td key={d} className={ed === d && ep === b.period_no ? 'bg-brand-soft' : ''}>{can && sp.section ? <Link href={`/timetable?section=${sp.section}&edit=${d}-${b.period_no}`} className="block min-h-[36px] hover:opacity-70">{body}</Link> : body}</td>; })}</tr>))}</tbody></table></div>
          {periods.length === 0 && <Empty title="No bell schedule" hint="Add periods under Bell schedule." />}</Card>)}
      {can && sp.section && sp.edit && <Card title={`${DAYS[ed]} · period ${ep}`} className="mt-4"><form action={setCell} className="grid gap-3 p-4 sm:grid-cols-4">
        <input type="hidden" name="section" value={sp.section} /><input type="hidden" name="day" value={ed} /><input type="hidden" name="period" value={ep} />
        <Field label="Subject"><select name="subject_id" className="input" defaultValue={cur?.subject_id ?? ''}><option value="">Free period</option>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Teacher"><select name="staff_id" className="input" defaultValue={cur?.staff_id ?? ''}><option value="">—</option>{(staff ?? []).map((s) => { const busy = E.some((e) => e.staff_id === s.id && e.day === ed && e.period_no === ep && e.section_id !== sp.section); return <option key={s.id} value={s.id} disabled={busy}>{fullName(s)}{busy ? ' (busy)' : ''}</option>; })}</select></Field>
        <Field label="Room"><input name="room" className="input" defaultValue={cur?.room ?? ''} /></Field><div className="flex items-end"><button className="btn w-full">Save cell</button></div></form></Card>}
      <p className="mt-3 text-xs text-muted">Every change is kept with its date, so attendance and workload reports stay correct for past weeks. <Badge tone="grey">versioned</Badge></p>
    </Page>
  );
}
