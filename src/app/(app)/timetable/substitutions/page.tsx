import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { today, fdate, fullName } from '@/lib/fmt';
import { weekday, DAYS, addDays } from '@/lib/calendar';
import { rankSubstitutes } from '@/lib/rules/timetable';
import { confirmSub } from '../actions';

export const metadata = { title: 'Substitutions' };
/** Substitution planner (TT-04): affected periods of absent teachers with ranked suggestions. */
export default async function Subs({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = today() } = await searchParams;
  const ctx = await requireCap('timetable');
  const dow = weekday(date);
  const [{ data: att }, { data: leave }, { data: tt }, { data: staff }, { data: subs }, { data: ta }, { data: week }, { data: sections }, { data: subjects }] = await Promise.all([
    ctx.sb.from('attendance').select('staff_id, status').eq('date', date).eq('person_type', 'staff').in('status', ['A', 'LV']),
    ctx.sb.from('leave_requests').select('staff_id').eq('person_type', 'staff').eq('status', 'approved').lte('from_date', date).gte('to_date', date),
    ctx.sb.from('timetable_entries').select('section_id, period_no, subject_id, staff_id').eq('day', dow).eq('year_id', ctx.year?.id ?? '').limit(5000),
    ctx.sb.from('staff').select('id, first_name, last_name').eq('status', 'active').eq('staff_type', 'teaching'),
    ctx.sb.from('substitutions').select('period_no, section_id, absent_staff_id, substitute_staff_id').eq('date', date).eq('status', 'confirmed'),
    ctx.sb.from('teacher_assignments').select('staff_id, section_id, subject_id').eq('year_id', ctx.year?.id ?? ''),
    ctx.sb.from('substitutions').select('substitute_staff_id').gte('date', addDays(date, -6)).lte('date', date).eq('status', 'confirmed'),
    ctx.sb.from('sections').select('id, name'), ctx.sb.from('subjects').select('id, name'),
  ]);
  const absent = new Set([...(att ?? []).map((a) => a.staff_id), ...(leave ?? []).map((l) => l.staff_id)].filter(Boolean) as string[]);
  const T = tt ?? [];
  const affected = T.filter((e) => e.staff_id && absent.has(e.staff_id)).sort((a, b) => a.period_no - b.period_no);
  const nm = { sec: new Map((sections ?? []).map((s) => [s.id, s.name])), sub: new Map((subjects ?? []).map((s) => [s.id, s.name])), st: new Map((staff ?? []).map((s) => [s.id, fullName(s)])) };
  const can = ctx.can('timetable', 'write');
  const covers = new Map<string, number>(); for (const w of week ?? []) if (w.substitute_staff_id) covers.set(w.substitute_staff_id, (covers.get(w.substitute_staff_id) ?? 0) + 1);
  const done = affected.filter((e) => (subs ?? []).some((s) => s.period_no === e.period_no && s.section_id === e.section_id)).length;
  return (
    <Page title="Substitution planner" sub={`${DAYS[dow]}, ${fdate(date)} · ${absent.size} teacher${absent.size === 1 ? '' : 's'} away · ${done} of ${affected.length} periods covered`} actions={<form className="flex gap-2"><input type="date" name="date" defaultValue={date} className="input !w-auto" aria-label="Date" /><button className="btn-ghost">Go</button><Link className="btn-ghost" href="/timetable">Timetable</Link></form>}>
      {affected.length === 0 ? <Card><Empty title="No cover needed" hint="When a teacher's leave is approved or they are marked absent, every affected period is listed here with suggested substitutes." /></Card> : (
        <div className="space-y-3">{affected.map((e, i) => {
          const sub = (subs ?? []).find((s) => s.period_no === e.period_no && s.section_id === e.section_id);
          const busy = new Set([...T.filter((x) => x.period_no === e.period_no).map((x) => x.staff_id), ...(subs ?? []).filter((s) => s.period_no === e.period_no).map((s) => s.substitute_staff_id)]);
          const ranked = rankSubstitutes((staff ?? []).filter((s) => !absent.has(s.id) && !busy.has(s.id)).map((s) => ({ staff_id: s.id, name: fullName(s), teachesSubject: (ta ?? []).some((a) => a.staff_id === s.id && a.subject_id === e.subject_id), teachesSection: (ta ?? []).some((a) => a.staff_id === s.id && a.section_id === e.section_id), loadToday: T.filter((x) => x.staff_id === s.id).length, coversThisWeek: covers.get(s.id) ?? 0 }))).slice(0, 4);
          return <Card key={i}><div className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm"><b>Period {e.period_no}</b> · {nm.sec.get(e.section_id)} · {nm.sub.get(e.subject_id ?? '') ?? 'Free'} <span className="text-muted">· {nm.st.get(e.staff_id!)} is away</span></div>{sub ? <Badge tone="green">covered by {nm.st.get(sub.substitute_staff_id ?? '')}</Badge> : <Badge tone="red">needs cover</Badge>}</div>
            {!sub && (ranked.length === 0 ? <p className="mt-2 text-sm text-muted">No teacher is free in this period. Consider combining sections.</p> : <ul className="mt-2 divide-y divide-line border-t border-line">{ranked.map((r, k) => <li key={r.staff_id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><b>{k + 1}. {r.name}</b> <span className="text-muted">· {r.why}</span></span>
              {can && <form action={confirmSub}><input type="hidden" name="date" value={date} /><input type="hidden" name="period" value={e.period_no} /><input type="hidden" name="section" value={e.section_id} /><input type="hidden" name="section_name" value={nm.sec.get(e.section_id) ?? ''} /><input type="hidden" name="subject" value={e.subject_id ?? ''} /><input type="hidden" name="absent" value={e.staff_id!} /><input type="hidden" name="substitute" value={r.staff_id} /><button className={k === 0 ? 'btn btn-sm' : 'btn-ghost btn-sm'}>Confirm</button></form>}</li>)}</ul>)}</div></Card>; })}</div>)}
    </Page>
  );
}
