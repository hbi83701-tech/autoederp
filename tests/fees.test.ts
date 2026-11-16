import { describe, it, expect } from 'vitest';
import { balance, ageingBucket, lateFine, allocateOldestFirst, billable, reminderStep } from '@/lib/rules/fees';

const d = (id: string, amount: number, due: string, extra: Partial<{ concession: number; fine: number; paid: number }> = {}) => ({ id, amount, due_date: due, concession: 0, fine: 0, paid: 0, ...extra });
describe('fee rules (golden cases)', () => {
  it('balance = amount - concession + fine - paid', () => { expect(balance(d('a', 20000, '2026-04-15', { concession: 2000, fine: 100, paid: 5000 }))).toBe(13100); expect(balance(d('a', 1000, '2026-04-15', { paid: 1200 }))).toBe(0); });
  it('ageing buckets', () => { expect(ageingBucket('2026-11-15', '2026-11-15')).toBe('not due'); expect(ageingBucket('2026-11-01', '2026-11-15')).toBe('0-30'); expect(ageingBucket('2026-09-20', '2026-11-15')).toBe('31-60'); expect(ageingBucket('2026-08-01', '2026-11-15')).toBe('90+'); });
  it('late fee: grace, per day, cap, flat, slab', () => {
    const x = d('a', 10000, '2026-10-01');
    expect(lateFine(x, '2026-10-05', { type: 'per_day', amount: 10, grace_days: 7 })).toBe(0);
    expect(lateFine(x, '2026-10-18', { type: 'per_day', amount: 10, grace_days: 7 })).toBe(100);
    expect(lateFine(x, '2027-01-01', { type: 'per_day', amount: 10, grace_days: 7, cap: 500 })).toBe(500);
    expect(lateFine(x, '2026-10-02', { type: 'flat', amount: 250 })).toBe(250);
    expect(lateFine(x, '2026-11-15', { type: 'slab', slabs: [{ after_days: 1, amount: 100 }, { after_days: 30, amount: 300 }] })).toBe(300);
    expect(lateFine(d('b', 10000, '2026-10-01', { paid: 10000 }), '2026-12-01', { type: 'flat', amount: 250 })).toBe(0);
  });
  it('allocates oldest first and never beyond a balance', () => {
    expect(allocateOldestFirst([d('t2', 18000, '2026-08-15'), d('t1', 18000, '2026-04-15', { paid: 8000 })], 15000)).toEqual([{ demand_id: 't1', amount: 10000 }, { demand_id: 't2', amount: 5000 }]);
  });
  it('mid-year joiners are not billed for past instalments', () => { expect(billable('2026-04-15', '2026-07-10')).toBe(false); expect(billable('2026-08-15', '2026-07-10')).toBe(true); expect(billable('2026-07-15', '2026-07-10')).toBe(true); });
  it('reminder ladder -7, -1, +3, +10, call at +15', () => { expect(reminderStep('2026-11-22', '2026-11-15')).toBe('before_7'); expect(reminderStep('2026-11-12', '2026-11-15')).toBe('after_3'); expect(reminderStep('2026-10-31', '2026-11-15')).toBe('call_15'); expect(reminderStep('2026-11-14', '2026-11-15')).toBe(null); });
});
