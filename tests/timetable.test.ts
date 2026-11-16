import { describe, it, expect } from 'vitest';
import { findClashes, generate, rankSubstitutes } from '@/lib/rules/timetable';
import { isWorking, countWorking } from '@/lib/calendar';
import { riskReasons } from '@/lib/rules/risk';

describe('timetable and calendar rules', () => {
  it('detects a teacher double-booked', () => { const c = findClashes([{ section_id: 'A', day: 1, period_no: 1, subject_id: 'm', staff_id: 'T1' }, { section_id: 'B', day: 1, period_no: 1, subject_id: 'm', staff_id: 'T1' }]); expect(c.filter((x) => x.kind === 'teacher')).toHaveLength(1); });
  it('generator places all periods without clashes and at most two a day', () => {
    const needs = [{ section_id: 'A', subject_id: 'math', staff_id: 'T1', periods_per_week: 6 }, { section_id: 'B', subject_id: 'math', staff_id: 'T1', periods_per_week: 6 }, { section_id: 'A', subject_id: 'eng', staff_id: 'T2', periods_per_week: 5 }];
    const { created, unplaced } = generate(needs, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(unplaced).toHaveLength(0); expect(created).toHaveLength(17); expect(findClashes(created)).toHaveLength(0);
    for (const day of [1, 2, 3, 4, 5, 6]) expect(created.filter((e) => e.section_id === 'A' && e.subject_id === 'math' && e.day === day).length).toBeLessThanOrEqual(2);
  });
  it('ranks substitutes by subject fit, then fairness', () => { const r = rankSubstitutes([{ staff_id: 'a', name: 'A', teachesSubject: false, teachesSection: false, loadToday: 2, coversThisWeek: 0 }, { staff_id: 'b', name: 'B', teachesSubject: true, teachesSection: false, loadToday: 5, coversThisWeek: 1 }]); expect(r[0].staff_id).toBe('b'); });
  it('weekends and holidays are never working days', () => {
    expect(isWorking('2026-11-15', '1,2,3,4,5,6', [])).toBe(false); // Sunday
    expect(isWorking('2026-11-14', '1,2,3,4,5,6', [])).toBe(true); // Saturday
    expect(isWorking('2026-11-14', '1,2,3,4,5', [])).toBe(false);
    expect(isWorking('2026-11-16', '1,2,3,4,5,6', [{ start_date: '2026-11-16', end_date: null }])).toBe(false);
    expect(countWorking('2026-11-09', '2026-11-15', '1,2,3,4,5,6', [])).toBe(6);
  });
  it('early warning explains itself', () => { expect(riskReasons({ attendancePct: 72, recentAbsences: 3, avgPct: 50, prevAvgPct: 70, homeworkLate: 0, incidents: 0 })).toEqual(['Attendance is 72%', '3 absences in the last two weeks', 'Marks fell from 70% to 50%']); expect(riskReasons({ attendancePct: 96, recentAbsences: 0, avgPct: 80, prevAvgPct: 78, homeworkLate: 1, incidents: 0 })).toEqual([]); });
});
