'use server';
import { getCtx } from '@/lib/ctx';
import { go, str } from '@/lib/fmt';
import { generate, type Entry, type Need } from '@/lib/rules/timetable';

export async function setCell(fd: FormData) {
  const ctx = await getCtx();
  const section = str(fd, 'section')!, day = Number(fd.get('day')), period = Number(fd.get('period'));
  const subject = str(fd, 'subject_id'), staff = str(fd, 'staff_id'), room = str(fd, 'room');
  const back = `/timetable?section=${section}`;
  await ctx.sb.from('timetable_entries').delete().eq('section_id', section).eq('day', day).eq('period_no', period);
  if (subject || staff) {
    if (staff) { // clash detection before saving (TT-02)
      const { data: clash } = await ctx.sb.from('timetable_entries').select('section:sections!timetable_entries_section_id_fkey(name)').eq('staff_id', staff).eq('day', day).eq('period_no', period).neq('section_id', section).limit(1);
      if (clash?.length) go(back, `Clash: this teacher already has ${(clash[0] as unknown as { section: { name: string } }).section?.name} in that period. The cell was cleared.`, 'err');
    }
    const { data: sec } = await ctx.sb.from('sections').select('branch_id').eq('id', section).single();
    const { error } = await ctx.sb.from('timetable_entries').insert({ section_id: section, branch_id: sec?.branch_id, year_id: ctx.year?.id, day, period_no: period, subject_id: subject, staff_id: staff, room });
    if (error) go(back, error.message, 'err');
  }
  go(back, 'Timetable updated. Teachers and families see the change in their apps.');
}

/** Fill empty cells from teaching assignments (TT-03). Existing cells are kept. */
export async function autoGenerate(fd: FormData) {
  const ctx = await getCtx();
  const section = str(fd, 'section');
  let nq = ctx.sb.from('teacher_assignments').select('section_id, subject_id, staff_id, periods_per_week').eq('year_id', ctx.year?.id ?? '');
  if (section) nq = nq.eq('section_id', section);
  const [{ data: needs }, { data: existing }, { data: bells }, { data: secs }] = await Promise.all([nq,
    ctx.sb.from('timetable_entries').select('section_id, day, period_no, subject_id, staff_id, room').eq('year_id', ctx.year?.id ?? '').limit(20000),
    ctx.sb.from('bell_periods').select('period_no').eq('is_break', false).eq('day_type', 'weekday').order('period_no'), ctx.sb.from('sections').select('id, branch_id')]);
  if (!needs?.length) go(`/timetable${section ? `?section=${section}` : ''}`, 'Add teaching assignments first: who teaches which subject to which section, and how many periods a week.', 'err');
  const days: number[] = String(ctx.branches[0]?.working_days ?? '1,2,3,4,5,6').split(',').map(Number);
  const periods = [...new Set((bells ?? []).map((b) => b.period_no))];
  const { created, unplaced } = generate(needs as Need[], days, periods.length ? periods : [1, 2, 3, 4, 5, 6, 7, 8], (existing ?? []) as Entry[]);
  const br = new Map((secs ?? []).map((s) => [s.id, s.branch_id]));
  for (let i = 0; i < created.length; i += 500) await ctx.sb.from('timetable_entries').insert(created.slice(i, i + 500).map((e) => ({ ...e, year_id: ctx.year?.id, branch_id: br.get(e.section_id) })));
  go(`/timetable${section ? `?section=${section}` : ''}`, `${created.length} periods placed.${unplaced.length ? ` ${unplaced.reduce((t, u) => t + u.missing, 0)} could not be placed; fine-tune by hand.` : ''}`);
}

export async function confirmSub(fd: FormData) {
  const ctx = await getCtx();
  const date = str(fd, 'date')!, sub = str(fd, 'substitute')!;
  const { error } = await ctx.sb.from('substitutions').insert({ date, period_no: Number(fd.get('period')), section_id: str(fd, 'section'), subject_id: str(fd, 'subject'), absent_staff_id: str(fd, 'absent'), substitute_staff_id: sub, branch_id: ctx.branchId });
  if (!error) {
    const { data: p } = await ctx.sb.from('profiles').select('id').eq('staff_id', sub);
    if (p?.length) await ctx.sb.from('notifications').insert(p.map((x) => ({ org_id: ctx.org.id, user_id: x.id, title: `Cover: period ${fd.get('period')} on ${date}`, body: `${str(fd, 'section_name')} · it now shows in your timetable.`, link: '/', kind: 'cover' })));
  }
  go(`/timetable/substitutions?date=${date}`, error ? error.message : 'Substitute confirmed and notified. The day’s timetable is updated.', error ? 'err' : 'ok');
}
