/** Timetable rules as pure functions: clash detection, generator and substitute ranking (TT-02, TT-03, TT-04). */
export type Entry = { id?: string; section_id: string; day: number; period_no: number; subject_id: string | null; staff_id: string | null; room?: string | null };
export type Clash = { kind: 'teacher' | 'room' | 'section'; day: number; period_no: number; key: string; sections: string[] };

export function findClashes(entries: Entry[]): Clash[] {
  const out: Clash[] = [];
  const group = (kind: Clash['kind'], keyOf: (e: Entry) => string | null | undefined) => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) { const k = keyOf(e); if (!k) continue; const id = `${e.day}:${e.period_no}:${k}`; m.set(id, [...(m.get(id) ?? []), e]); }
    for (const [id, list] of m) if (list.length > 1) { const [day, period, key] = id.split(':'); out.push({ kind, day: Number(day), period_no: Number(period), key, sections: list.map((l) => l.section_id) }); }
  };
  group('teacher', (e) => e.staff_id);
  group('room', (e) => e.room);
  group('section', (e) => e.section_id);
  return out;
}

export type Need = { section_id: string; subject_id: string; staff_id: string; periods_per_week: number };
/**
 * Greedy generator from constraints: periods per subject, teacher availability, at most two periods of a subject
 * per day for a section. Returns the placed entries and what could not be placed, for manual fine-tuning.
 */
export function generate(needs: Need[], days: number[], periods: number[], existing: Entry[] = []) {
  const placed: Entry[] = [...existing];
  const busyT = new Set(placed.filter((e) => e.staff_id).map((e) => `${e.staff_id}:${e.day}:${e.period_no}`));
  const busyS = new Set(placed.map((e) => `${e.section_id}:${e.day}:${e.period_no}`));
  const perDay = new Map<string, number>();
  for (const e of placed) perDay.set(`${e.section_id}:${e.subject_id}:${e.day}`, (perDay.get(`${e.section_id}:${e.subject_id}:${e.day}`) ?? 0) + 1);
  const unplaced: { need: Need; missing: number }[] = [];
  const created: Entry[] = [];
  for (const need of [...needs].sort((a, b) => b.periods_per_week - a.periods_per_week)) {
    let left = need.periods_per_week - placed.filter((e) => e.section_id === need.section_id && e.subject_id === need.subject_id).length;
    for (let pass = 1; pass <= 2 && left > 0; pass++) {
      for (const p of periods) { for (const d of days) {
        if (left <= 0) break;
        const dk = `${need.section_id}:${need.subject_id}:${d}`;
        if ((perDay.get(dk) ?? 0) >= pass) continue;
        if (busyS.has(`${need.section_id}:${d}:${p}`) || busyT.has(`${need.staff_id}:${d}:${p}`)) continue;
        const e: Entry = { section_id: need.section_id, day: d, period_no: p, subject_id: need.subject_id, staff_id: need.staff_id };
        placed.push(e); created.push(e);
        busyS.add(`${need.section_id}:${d}:${p}`); busyT.add(`${need.staff_id}:${d}:${p}`); perDay.set(dk, (perDay.get(dk) ?? 0) + 1); left--;
      } }
    }
    if (left > 0) unplaced.push({ need, missing: left });
  }
  return { created, unplaced };
}

export type Candidate = { staff_id: string; name: string; teachesSubject: boolean; teachesSection: boolean; loadToday: number; coversThisWeek: number };
/** Rank substitutes: free that period (caller filters), then subject fit, knows the section, fairness, lighter day. */
export function rankSubstitutes(c: Candidate[]): (Candidate & { score: number; why: string })[] {
  return c.map((x) => {
    const score = (x.teachesSubject ? 50 : 0) + (x.teachesSection ? 20 : 0) - x.coversThisWeek * 8 - x.loadToday * 3;
    const why = [x.teachesSubject ? 'teaches this subject' : null, x.teachesSection ? 'knows this class' : null, `${x.loadToday} periods today`, x.coversThisWeek ? `${x.coversThisWeek} covers this week` : 'no covers this week'].filter(Boolean).join(' · ');
    return { ...x, score, why };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
