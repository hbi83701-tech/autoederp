import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { go, str, inr, today } from '@/lib/fmt';
import { balance, type Demand } from '@/lib/rules/fees';

export const metadata = { title: 'Year rollover' };
/** Rollover wizard (SIS-06): new year, copied sections, promotion by result rule, dues carried forward. Preview first, then commit. */
async function commit(fd: FormData) {
  'use server';
  const ctx = await requireCap('admin', 'write');
  if (!ctx.year) go('/admin/rollover', 'No current year.', 'err');
  const sb = ctx.sb, cur = ctx.year!;
  const ys = Number(cur.start_date.slice(0, 4)) + 1;
  const name = `${ys}-${String(ys + 1).slice(2)}`;
  const { data: exists } = await sb.from('academic_years').select('id').eq('name', name).maybeSingle();
  if (exists) go('/admin/rollover', `${name} already exists. Rollover has been run.`, 'err');
  const { data: ny, error } = await sb.from('academic_years').insert({ name, start_date: `${ys}-04-01`, end_date: `${ys + 1}-03-31`, is_current: false, status: 'planning' }).select('id').single();
  if (error) go('/admin/rollover', error.message, 'err');
  const [{ data: progs }, { data: secs }, { data: studs }, { data: cards }] = await Promise.all([sb.from('programmes').select('id, next_programme_id'), sb.from('sections').select('*').eq('year_id', cur.id), sb.from('students').select('id, section_id, programme_id, branch_id').eq('status', 'active').limit(20000), sb.from('report_cards').select('student_id, snapshot').eq('year_id', cur.id)]);
  // Copy sections into the new year, keeping names, rooms and class teachers.
  const map = new Map<string, string>();
  for (const s of secs ?? []) { const { data: n } = await sb.from('sections').insert({ branch_id: s.branch_id, year_id: ny!.id, programme_id: s.programme_id, name: s.name, class_teacher_id: s.class_teacher_id, room: s.room, capacity: s.capacity }).select('id').single(); if (n) map.set(s.id, n.id); }
  const next = new Map((progs ?? []).map((p) => [p.id, p.next_programme_id]));
  const detain = new Set(fd.getAll('detain').map(String));
  const passMark = Number(str(fd, 'pass') ?? 33);
  for (const c of cards ?? []) { const o = (c.snapshot as { overall: number | null })?.overall; if (o !== null && o !== undefined && o < passMark && fd.get('use_results') === 'on') detain.add(c.student_id); }
  let promoted = 0, detained = 0, graduated = 0;
  for (const s of studs ?? []) {
    const stay = detain.has(s.id), np = stay ? s.programme_id : next.get(s.programme_id ?? '') ?? null;
    await sb.from('enrolments').update({ status: stay ? 'detained' : 'promoted', end_date: cur.end_date, result: stay ? 'Detained' : 'Promoted' }).eq('student_id', s.id).eq('year_id', cur.id).eq('status', 'active');
    if (!stay && !np) { await sb.rpc('change_student_status', { p_student: s.id, p_to: 'alumni', p_reason: `Completed final grade in ${cur.name}`, p_date: cur.end_date }); graduated++; continue; }
    // Target section: the copy of a section in the new grade with the same suffix letter, else the first one.
    const oldName = (secs ?? []).find((x) => x.id === s.section_id)?.name ?? ''; const suffix = oldName.trim().split(' ').pop();
    const targets = (secs ?? []).filter((x) => x.programme_id === np && x.branch_id === s.branch_id);
    const target = targets.find((x) => x.name.trim().split(' ').pop() === suffix) ?? targets[0];
    const nsec = target ? map.get(target.id) ?? null : null;
    await sb.from('students').update({ programme_id: np, section_id: nsec, is_new: false }).eq('id', s.id);
    await sb.from('enrolments').insert({ student_id: s.id, year_id: ny!.id, branch_id: s.branch_id, programme_id: np, section_id: nsec, start_date: `${ys}-04-01` });
    if (stay) detained++; else promoted++;
  }
  // Previous-year dues are carried forward and shown separately (FEE-12).
  await sb.from('fee_demands').update({ carried_forward: true }).eq('year_id', cur.id).in('status', ['due', 'partial']);
  await sb.from('academic_years').update({ is_current: false, status: 'closed' }).eq('id', cur.id);
  await sb.from('academic_years').update({ is_current: true, status: 'active' }).eq('id', ny!.id);
  go('/admin/setup', `Rolled over to ${name}: ${promoted} promoted, ${detained} detained, ${graduated} moved to alumni. Next: create fee plans, routes and the timetable for the new year.`);
}

export default async function Rollover() {
  const ctx = await requireCap('admin');
  const cur = ctx.year;
  if (!cur) return <Page title="Year rollover"><Card><Empty title="No academic year" /></Card></Page>;
  const [{ data: progs }, { data: studs }, { data: dues }, { data: cards }, { data: open }] = await Promise.all([ctx.sb.from('programmes').select('id, name, sort, next_programme_id').order('sort'), ctx.sb.from('students').select('id, first_name, last_name, programme_id').eq('status', 'active').limit(20000),
    ctx.can('fees') ? ctx.sb.from('fee_demands').select('amount, concession, fine, paid, due_date').eq('year_id', cur.id).in('status', ['due', 'partial']).limit(50000) : Promise.resolve({ data: [] }), ctx.sb.from('report_cards').select('student_id, snapshot, status').eq('year_id', cur.id), ctx.sb.from('assessments').select('id', { count: 'exact', head: true }).eq('year_id', cur.id).eq('status', 'open')]);
  const ys = Number(cur.start_date.slice(0, 4)) + 1, name = `${ys}-${String(ys + 1).slice(2)}`;
  const by = (p: string) => (studs ?? []).filter((s) => s.programme_id === p);
  const carry = ((dues ?? []) as Demand[]).reduce((t, d) => t + balance(d), 0);
  const low = (cards ?? []).filter((c) => { const o = (c.snapshot as { overall: number | null })?.overall; return o !== null && o !== undefined && o < 33; });
  const early = today() < cur.end_date.slice(0, 5) + '02-01';
  return (
    <Page title="Year rollover wizard" sub={`From ${cur.name} to ${name}. Review everything below before you commit.`}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Active students" value={(studs ?? []).length} /><Stat label="Dues to carry forward" value={inr(carry)} hint="shown separately next year" /><Stat label="Below pass mark" value={low.length} hint="from published report cards" /><Stat label="Marks still open" value={(open as unknown as { count: number })?.count ?? 0} tone="warn" /></div>
      {early && <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">The year ends on {cur.end_date}. Rollover is usually run between March and May.</div>}
      <form action={commit}>
        <Card title="Step 1 · Promotion preview"><table className="tbl"><thead><tr><th>Current grade</th><th>Students</th><th>Moves to</th></tr></thead><tbody>{(progs ?? []).map((p) => { const nx = (progs ?? []).find((x) => x.id === p.next_programme_id); return <tr key={p.id}><td>{p.name}</td><td>{by(p.id).length}</td><td>{nx ? nx.name : <Badge tone="grey">final grade: students become alumni</Badge>}</td></tr>; })}</tbody></table></Card>
        <Card title="Step 2 · Result rule" className="mt-4"><div className="flex flex-wrap items-center gap-4 p-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="use_results" className="h-4 w-4" /> Detain students whose overall result is below</label><input name="pass" type="number" defaultValue={33} className="input !w-20" aria-label="Pass percentage" /><span>%</span></div>
          {low.length > 0 && <ul className="divide-y divide-line border-t border-line text-sm">{low.slice(0, 30).map((c) => { const s = (studs ?? []).find((x) => x.id === c.student_id); return s ? <li key={c.student_id} className="flex justify-between px-4 py-2"><span>{s.first_name} {s.last_name} · {(c.snapshot as { overall: number }).overall}%</span><label className="flex items-center gap-1"><input type="checkbox" name="detain" value={s.id} className="h-4 w-4" />detain</label></li> : null; })}</ul>}</Card>
        <Card title="Step 3 · What happens when you commit" className="mt-4"><ul className="list-disc space-y-1 px-8 py-4 text-sm"><li>Academic year {name} is created and becomes the current year.</li><li>Every section is copied with its class teacher and room.</li><li>Students move to the next grade; enrolment history is kept for each year.</li><li>Students in a final grade move to alumni.</li><li>Unpaid fees from {cur.name} are marked as previous-year dues.</li><li>Fee plans, routes and the timetable for {name} are yours to create next (the checklist will guide you).</li></ul></Card>
        {ctx.can('admin', 'write') && <div className="mt-4"><ConfirmSubmit className="btn" message={`Roll over to ${name}? This moves every active student and cannot be undone in one click.`}>Commit rollover to {name}</ConfirmSubmit></div>}
      </form>
    </Page>
  );
}
