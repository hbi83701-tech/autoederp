import { requireCap } from '@/lib/ctx';
import { Page, Card, Stat, Empty } from '@/components/ui';
import { PrintButton } from '@/components/client';
import { today, fdate, pct, inr, go, str } from '@/lib/fmt';
import { workingDay } from '@/lib/calendar';

export const metadata = { title: "Principal's diary" };
type Snap = { working: boolean; reason: string | null; students: { marked: number; present: number; absent: number }; sections: { total: number; marked: number }; staff: { present: number; away: number }; posts: number; assessments: number; observations: number; incidents: number; visitors: number; gatePasses: number; collected: number; tickets: number; events: string[] };

/** Principal's daily diary (RPT-03): compiled from the day's records, with the principal's comments, printable and archived. */
async function compile(fd: FormData) {
  'use server';
  const ctx = await requireCap('reports');
  const d = str(fd, 'date') ?? today();
  const branch = ctx.branchId ?? ctx.branches[0]?.id;
  const sb = ctx.sb; const day = [d + 'T00:00:00+05:30', d + 'T23:59:59+05:30'] as const;
  const wd = await workingDay(ctx, d, branch);
  const [att, subs, secs, satt, posts, asm, obs, inc, vis, gp, rec, tk, ev] = await Promise.all([
    sb.from('attendance').select('status').eq('date', d).eq('person_type', 'student').eq('session', 'day').eq('branch_id', branch ?? '').limit(20000), sb.from('attendance_submissions').select('id', { count: 'exact', head: true }).eq('date', d).eq('branch_id', branch ?? ''),
    sb.from('sections').select('id', { count: 'exact', head: true }).eq('year_id', ctx.year?.id ?? '').eq('branch_id', branch ?? ''), sb.from('attendance').select('status').eq('date', d).eq('person_type', 'staff'),
    sb.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', day[0]).lte('created_at', day[1]), sb.from('assessments').select('id', { count: 'exact', head: true }).eq('date', d),
    sb.from('classroom_observations').select('id', { count: 'exact', head: true }).eq('date', d), sb.from('incidents').select('id', { count: 'exact', head: true }).eq('date', d),
    sb.from('visitors').select('id', { count: 'exact', head: true }).gte('in_at', day[0]).lte('in_at', day[1]), sb.from('gate_passes').select('id', { count: 'exact', head: true }).gte('created_at', day[0]).lte('created_at', day[1]),
    ctx.can('fees') ? sb.from('receipts').select('total').eq('date', d).eq('status', 'valid') : Promise.resolve({ data: [] }), sb.from('tickets').select('id', { count: 'exact', head: true }).gte('created_at', day[0]).lte('created_at', day[1]),
    sb.from('calendar_events').select('title').lte('start_date', d).or(`end_date.gte.${d},and(end_date.is.null,start_date.eq.${d})`),
  ]);
  const a = att.data ?? [], s = satt.data ?? [];
  const snapshot: Snap = { working: wd.working, reason: wd.reason, students: { marked: a.length, present: a.filter((x) => !['A', 'LV'].includes(x.status)).length, absent: a.filter((x) => x.status === 'A').length }, sections: { total: secs.count ?? 0, marked: subs.count ?? 0 },
    staff: { present: s.filter((x) => ['P', 'L', 'HD'].includes(x.status)).length, away: s.filter((x) => ['A', 'LV'].includes(x.status)).length }, posts: posts.count ?? 0, assessments: asm.count ?? 0, observations: obs.count ?? 0, incidents: inc.count ?? 0, visitors: vis.count ?? 0, gatePasses: gp.count ?? 0,
    collected: (rec.data ?? []).reduce((t, r) => t + Number(r.total), 0), tickets: tk.count ?? 0, events: (ev.data ?? []).map((e) => e.title) };
  const { data: ex } = await sb.from('principal_diary').select('id, comments').eq('date', d).eq('branch_id', branch ?? '').maybeSingle();
  const comments = str(fd, 'comments') ?? ex?.comments ?? null;
  const { error } = ex ? await sb.from('principal_diary').update({ snapshot, comments, compiled_at: new Date().toISOString() }).eq('id', ex.id) : await sb.from('principal_diary').insert({ date: d, branch_id: branch, snapshot, comments });
  go(`/diary?date=${d}`, error ? error.message : 'Diary compiled and saved.', error ? 'err' : 'ok');
}

export default async function Diary({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = today() } = await searchParams;
  const ctx = await requireCap('reports');
  const branch = ctx.branchId ?? ctx.branches[0]?.id;
  const [{ data: entry }, { data: past }] = await Promise.all([ctx.sb.from('principal_diary').select('*').eq('date', date).eq('branch_id', branch ?? '').maybeSingle(), ctx.sb.from('principal_diary').select('date').eq('branch_id', branch ?? '').order('date', { ascending: false }).limit(14)]);
  const s = entry?.snapshot as Snap | undefined;
  return (
    <Page title="Principal's daily diary" sub={`${fdate(date)} · ${ctx.branches.find((b) => b.id === branch)?.name ?? ''}`} actions={<><form className="flex gap-2"><input type="date" name="date" defaultValue={date} max={today()} className="input !w-auto" aria-label="Date" /><button className="btn-ghost">Open</button></form><PrintButton /></>}>
      {!s ? <Card><Empty title="Not compiled yet for this day" hint="The diary gathers attendance, staff present, diaries and assignments posted, observations, incidents, visitors and events automatically." action={<form action={compile}><input type="hidden" name="date" value={date} /><button className="btn">Compile the diary</button></form>} /></Card> : <>
        {!s.working && <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">{s.reason}. Nothing is counted as missed on this day.</div>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Student attendance" value={s.students.marked ? `${pct(s.students.present, s.students.marked)}%` : '—'} hint={`${s.students.absent} absent · ${s.sections.marked} of ${s.sections.total} sections marked`} />
          <Stat label="Staff present" value={s.staff.present} hint={`${s.staff.away} away`} /><Stat label="Diary and homework posts" value={s.posts} /><Stat label="Assessments held" value={s.assessments} />
          <Stat label="Classroom observations" value={s.observations} /><Stat label="Incidents" value={s.incidents} tone={s.incidents ? 'warn' : undefined} /><Stat label="Visitors and gate passes" value={`${s.visitors} / ${s.gatePasses}`} /><Stat label="Fees collected" value={inr(s.collected)} hint={`${s.tickets} new requests`} />
        </div>
        {s.events.length > 0 && <Card title="Events and calendar" className="mt-4"><ul className="list-disc px-8 py-3 text-sm">{s.events.map((e) => <li key={e}>{e}</li>)}</ul></Card>}
        <Card title="Principal's comments" className="mt-4"><form action={compile} className="space-y-3 p-4"><input type="hidden" name="date" value={date} /><textarea name="comments" rows={4} className="input" defaultValue={entry?.comments ?? ''} aria-label="Comments" /><div className="no-print flex gap-2"><button className="btn">Save comments and refresh the numbers</button></div></form></Card></>}
      {(past ?? []).length > 0 && <p className="no-print mt-4 text-sm text-muted">Archive: {past!.map((p) => <a key={p.date} className="link mr-2" href={`/diary?date=${p.date}`}>{fdate(p.date)}</a>)}</p>}
    </Page>
  );
}
