/**
 * Early-warning rule (WB-04): combines attendance, marks trend, homework and incidents into reasons a student may need
 * support. It is an explanation for staff, never a score shown to parents or students.
 */
export type RiskInput = { attendancePct: number | null; recentAbsences: number; avgPct: number | null; prevAvgPct: number | null; homeworkLate: number; incidents: number };
export function riskReasons(i: RiskInput): string[] {
  const r: string[] = [];
  if (i.attendancePct !== null && i.attendancePct < 80) r.push(`Attendance is ${i.attendancePct}%`);
  if (i.recentAbsences >= 3) r.push(`${i.recentAbsences} absences in the last two weeks`);
  if (i.avgPct !== null && i.avgPct < 40) r.push(`Average marks are ${i.avgPct}%`);
  if (i.avgPct !== null && i.prevAvgPct !== null && i.prevAvgPct - i.avgPct >= 15) r.push(`Marks fell from ${i.prevAvgPct}% to ${i.avgPct}%`);
  if (i.homeworkLate >= 3) r.push(`${i.homeworkLate} late homework submissions`);
  if (i.incidents >= 2) r.push(`${i.incidents} discipline incidents this term`);
  return r;
}
