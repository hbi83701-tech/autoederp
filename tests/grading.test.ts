import { describe, it, expect } from 'vitest';
import { gradeFor, subjectResult, ranks, promoted, overall } from '@/lib/rules/grading';
import { SCALES, SCHEME_CONFIG } from '@/lib/pack';

const cbse = SCALES.CBSE;
describe('assessment engine (golden cases)', () => {
  it('CBSE grade bands', () => { expect(gradeFor(91, cbse)?.grade).toBe('A1'); expect(gradeFor(90.5, cbse)?.grade).toBe('A2'); expect(gradeFor(33, cbse)?.grade).toBe('D'); expect(gradeFor(32, cbse)?.grade).toBe('E'); expect(gradeFor(null, cbse)).toBeNull(); });
  it('Cambridge bands', () => { expect(gradeFor(92, SCALES.Cambridge)?.grade).toBe('A*'); expect(gradeFor(15, SCALES.Cambridge)?.grade).toBe('U'); });
  it('weighted components with best-of', () => {
    const cfg = SCHEME_CONFIG.CBSE as Parameters<typeof subjectResult>[1];
    const r = subjectResult([
      { component: 'Periodic Test', marks: 20, max: 40 }, { component: 'Periodic Test', marks: 36, max: 40 }, { component: 'Periodic Test', marks: 30, max: 40 },
      { component: 'Notebook', marks: 5, max: 5 }, { component: 'Subject Enrichment', marks: 4, max: 5 }, { component: 'Term Exam', marks: 60, max: 80 },
    ], cfg, cbse);
    // PT best 2 of 3 = (90+75)/2 = 82.5 at 10; NB 100 at 5; SE 80 at 5; Exam 75 at 80 -> (825+500+400+6000)/100 = 77.25
    expect(r.percent).toBe(77);
    expect(r.grade).toBe('B1');
    expect(r.pass).toBe(true);
  });
  it('absent counts as zero, exempt is left out', () => {
    expect(subjectResult([{ component: null, marks: null, max: 100, code: 'AB' }, { component: null, marks: 80, max: 100 }], { pass_percent: 33 }, cbse).percent).toBe(40);
    expect(subjectResult([{ component: null, marks: null, max: 100, code: 'EX' }, { component: null, marks: 80, max: 100 }], { pass_percent: 33 }, cbse).percent).toBe(80);
    expect(subjectResult([{ component: null, marks: null, max: 100, code: 'ML' }], {}, cbse).percent).toBeNull();
  });
  it('grace lifts only a near miss to the pass mark', () => {
    expect(subjectResult([{ component: null, marks: 31, max: 100 }], { pass_percent: 33, grace_marks: 2 }, cbse).percent).toBe(33);
    expect(subjectResult([{ component: null, marks: 29, max: 100 }], { pass_percent: 33, grace_marks: 2 }, cbse).pass).toBe(false);
  });
  it('dense ranks share ties', () => { const r = ranks([{ id: 'a', total: 90 }, { id: 'b', total: 85 }, { id: 'c', total: 90 }, { id: 'd', total: null }]); expect([r.get('a'), r.get('c'), r.get('b'), r.get('d')]).toEqual([1, 1, 2, null]); });
  it('promotion and overall', () => { expect(promoted([{ pass: true }, { pass: false }])).toBe(false); expect(promoted([{ pass: true }, { pass: false }], 1)).toBe(true); expect(overall([{ percent: 80 }, { percent: 71 }, { percent: null }])).toBe(75.5); });
});
