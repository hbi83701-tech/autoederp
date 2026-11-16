import type { Ctx } from './ctx';

/** ISO weekday 1 (Mon) to 7 (Sun) for a YYYY-MM-DD date. */
export const weekday = (d: string) => { const n = new Date(d + 'T00:00:00Z').getUTCDay(); return n === 0 ? 7 : n; };
export const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const addDays = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

/** Pure rule: a date is a working day when its weekday is in the branch's list and no holiday covers it. */
export function isWorking(date: string, workingDays: string | null | undefined, holidays: { start_date: string; end_date: string | null }[]) {
  const days = (workingDays ?? '1,2,3,4,5,6').split(',').map((s) => Number(s.trim()));
  if (!days.includes(weekday(date))) return false;
  return !holidays.some((h) => date >= h.start_date && date <= (h.end_date ?? h.start_date));
}

/** Calendar-aware check used by every monitor so weekends and holidays are never counted as misses (ADO-01). */
export async function workingDay(ctx: Ctx, date: string, branchId?: string | null) {
  const b = ctx.branches.find((x) => x.id === (branchId ?? ctx.branchId)) ?? ctx.branches[0];
  const { data } = await ctx.sb.from('calendar_events').select('title, start_date, end_date, branch_id').eq('type', 'holiday').lte('start_date', date);
  const hols = (data ?? []).filter((h) => !h.branch_id || !b || h.branch_id === b.id);
  const hit = hols.find((h) => date >= h.start_date && date <= (h.end_date ?? h.start_date));
  const working = isWorking(date, b?.working_days, hols);
  return { working, reason: hit ? hit.title : working ? null : `${DAYS[weekday(date)]} is not a working day` };
}
/** Working days between two dates inclusive. */
export function countWorking(from: string, to: string, workingDays: string | null | undefined, holidays: { start_date: string; end_date: string | null }[]) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorking(d, workingDays, holidays)) n++;
  return n;
}
