/** Fee rules as pure functions so they can be covered by golden tests (TEC-08). */
export type Demand = { id: string; amount: number; concession: number; fine: number; paid: number; due_date: string; status?: string };
export type FineRule = { type: 'none' | 'flat' | 'per_day' | 'slab'; amount?: number; grace_days?: number; cap?: number; slabs?: { after_days: number; amount: number }[] };

export const balance = (d: Demand) => Math.max(0, Number(d.amount) - Number(d.concession) + Number(d.fine) - Number(d.paid));
export const daysBetween = (from: string, to: string) => Math.floor((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

export function ageingBucket(dueDate: string, asOf: string): '0-30' | '31-60' | '61-90' | '90+' | 'not due' {
  const n = daysBetween(dueDate, asOf);
  if (n <= 0) return 'not due';
  return n <= 30 ? '0-30' : n <= 60 ? '31-60' : n <= 90 ? '61-90' : '90+';
}

/** Late fee for one instalment: flat, per day or slab, after a grace period and up to a cap. */
export function lateFine(d: Demand, asOf: string, rule: FineRule): number {
  if (!rule || rule.type === 'none') return 0;
  const principal = Number(d.amount) - Number(d.concession) - Number(d.paid);
  if (principal <= 0) return 0;
  const late = daysBetween(d.due_date, asOf) - (rule.grace_days ?? 0);
  if (late <= 0) return 0;
  let fine = 0;
  if (rule.type === 'flat') fine = rule.amount ?? 0;
  else if (rule.type === 'per_day') fine = (rule.amount ?? 0) * late;
  else if (rule.type === 'slab') fine = [...(rule.slabs ?? [])].sort((a, b) => b.after_days - a.after_days).find((s) => late >= s.after_days)?.amount ?? 0;
  return Math.round(rule.cap !== undefined ? Math.min(fine, rule.cap) : fine);
}

/** Spread a payment across instalments, oldest due date first. */
export function allocateOldestFirst(demands: Demand[], amount: number): { demand_id: string; amount: number }[] {
  let left = amount;
  const out: { demand_id: string; amount: number }[] = [];
  for (const d of [...demands].sort((a, b) => a.due_date.localeCompare(b.due_date))) {
    if (left <= 0) break;
    const take = Math.min(balance(d), left);
    if (take > 0) { out.push({ demand_id: d.id, amount: take }); left -= take; }
  }
  return out;
}

/** Mid-year joiners are not billed for instalments that fell due before they joined (FEE-02). */
export const billable = (itemDueDate: string, joinedOn: string | null) => !joinedOn || itemDueDate >= joinedOn.slice(0, 8) + '01';

/** Where a reminder falls on the ladder: -7, -1, +3, +10 days, then a call task at +15 (Appendix C). */
export function reminderStep(dueDate: string, asOf: string): 'before_7' | 'before_1' | 'after_3' | 'after_10' | 'call_15' | null {
  const n = daysBetween(dueDate, asOf);
  return n === -7 ? 'before_7' : n === -1 ? 'before_1' : n === 3 ? 'after_3' : n === 10 ? 'after_10' : n === 15 ? 'call_15' : null;
}
