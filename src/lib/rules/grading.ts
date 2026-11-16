/** Assessment engine rules as pure functions (GB-01). One engine; boards differ only in configuration. */
export type Band = { min: number; grade: string; point?: number; descriptor?: string };
export type Component = { name: string; weightage: number; best_of?: number };
export type SchemeConfig = { terms?: string[]; components?: Component[]; pass_percent?: number; rounding?: 'nearest' | 'up' | 'none'; grace_marks?: number };
export type Score = { component: string | null; marks: number | null; max: number; code?: string | null; weightage?: number };

export function gradeFor(percent: number | null, bands: Band[]): Band | null {
  if (percent === null || isNaN(percent)) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((b) => percent >= b.min) ?? null;
}
export function round(n: number, mode: SchemeConfig['rounding'] = 'nearest') {
  return mode === 'up' ? Math.ceil(n) : mode === 'none' ? Math.round(n * 100) / 100 : Math.round(n);
}

/**
 * Subject result for a term. Each component contributes its weightage; within a component the best N
 * assessments count when best_of is set. Absent (AB) counts as zero, exempt and medical (EX, ML) are left out.
 */
export function subjectResult(scores: Score[], cfg: SchemeConfig, bands: Band[]) {
  const usable = scores.filter((s) => !['EX', 'ML'].includes(s.code ?? '') && (s.marks !== null || s.code === 'AB') && s.max > 0);
  if (!usable.length) return { percent: null as number | null, grade: null as string | null, point: null as number | null, pass: null as boolean | null, absent: scores.some((s) => s.code === 'AB') };
  const comps = cfg.components ?? [];
  const groups = new Map<string, Score[]>();
  for (const s of usable) { const k = s.component ?? ''; groups.set(k, [...(groups.get(k) ?? []), s]); }
  let got = 0, weight = 0;
  for (const [name, list] of groups) {
    const c = comps.find((x) => x.name === name);
    const pcts = list.map((s) => ((s.marks ?? 0) / s.max) * 100).sort((a, b) => b - a);
    const counted = c?.best_of ? pcts.slice(0, c.best_of) : pcts;
    const avg = counted.reduce((t, x) => t + x, 0) / counted.length;
    const w = c?.weightage ?? list.reduce((t, s) => t + (s.weightage ?? 100), 0) / list.length;
    got += avg * w; weight += w;
  }
  let percent = weight ? got / weight : 0;
  const pass = cfg.pass_percent ?? 33;
  if (cfg.grace_marks && percent < pass && percent + cfg.grace_marks >= pass) percent = pass; // grace lifts a near miss to the pass mark only
  percent = round(percent, cfg.rounding);
  const band = gradeFor(percent, bands);
  return { percent, grade: band?.grade ?? null, point: band?.point ?? null, pass: percent >= pass, absent: false };
}

export function overall(subjects: { percent: number | null }[]) {
  const v = subjects.map((s) => s.percent).filter((p): p is number => p !== null);
  return v.length ? Math.round((v.reduce((t, x) => t + x, 0) / v.length) * 10) / 10 : null;
}
/** Dense rank: equal totals share a rank. */
export function ranks(totals: { id: string; total: number | null }[]) {
  const sorted = [...new Set(totals.filter((t) => t.total !== null).map((t) => t.total as number))].sort((a, b) => b - a);
  return new Map(totals.map((t) => [t.id, t.total === null ? null : sorted.indexOf(t.total) + 1]));
}
/** Promotion rule fed to the rollover wizard (GB-10). */
export const promoted = (subjects: { pass: boolean | null }[], maxFails = 0) => subjects.filter((s) => s.pass === false).length <= maxFails;

/** Template remark used when no AI key is configured; always reviewed by a teacher (GB-06). */
export function draftRemark(name: string, overallPct: number | null, attendancePct: number | null, best?: string, weakest?: string) {
  const first = name.split(' ')[0];
  const lead = overallPct === null ? `${first} has settled into the class.` : overallPct >= 85 ? `${first} has had an excellent term and works with real independence.` : overallPct >= 65 ? `${first} has made steady progress this term.` : overallPct >= 45 ? `${first} is working towards the expected level and responds well to support.` : `${first} needs regular support and practice to build confidence.`;
  const strength = best ? ` ${best} is a clear strength.` : '';
  const next = weakest && weakest !== best ? ` A little more practice in ${weakest} will help.` : '';
  const att = attendancePct !== null && attendancePct < 85 ? ' More regular attendance will make a difference.' : '';
  return lead + strength + next + att;
}
