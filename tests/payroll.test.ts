import { describe, it, expect } from 'vitest';
import { computePayslip, professionalTax, leaveBalance } from '@/lib/rules/payroll';

const base = { basic: 22000, hra: 8000, da: 0, special_allowance: 2000, other_allowance: 0, pf_applicable: true, esi_applicable: false, pt_applicable: true, tds_monthly: 0 };
describe('payroll rules (golden cases, Telangana)', () => {
  it('full month: PF capped at Rs 15,000 wages, PT slab', () => {
    const p = computePayslip(base, { workingDays: 26, lopDays: 0 });
    expect(p.gross).toBe(32000); expect(p.deductions['Provident fund']).toBe(1800); expect(p.deductions['Professional tax']).toBe(200); expect(p.net).toBe(30000); expect(p.employerPf).toBe(1800);
  });
  it('loss of pay is pro-rated', () => {
    const p = computePayslip(base, { workingDays: 26, lopDays: 2 });
    expect(p.earnings.Basic).toBe(Math.round(22000 * 24 / 26)); expect(p.paidDays).toBe(24); expect(p.gross).toBe(20308 + 7385 + 1846); // each line is rounded on its own
  });
  it('ESI applies only when monthly gross is Rs 21,000 or less', () => {
    const low = computePayslip({ ...base, basic: 12000, hra: 3000, special_allowance: 2000, esi_applicable: true }, { workingDays: 26, lopDays: 0 });
    expect(low.deductions.ESI).toBe(128); expect(low.employerEsi).toBe(553); expect(low.deductions['Provident fund']).toBe(1440); expect(low.deductions['Professional tax']).toBe(150);
    expect(computePayslip({ ...base, esi_applicable: true }, { workingDays: 26, lopDays: 0 }).deductions.ESI).toBeUndefined();
  });
  it('bonus, reimbursement and loan recovery', () => {
    const p = computePayslip(base, { workingDays: 26, lopDays: 0, bonus: 5000, reimbursement: 1200, loanEmi: 3000 });
    expect(p.gross).toBe(38200); expect(p.deductions['Loan / advance recovery']).toBe(3000); expect(p.deductions['Professional tax']).toBe(200);
  });
  it('Professional Tax slabs by state', () => { expect(professionalTax(15000)).toBe(0); expect(professionalTax(18000)).toBe(150); expect(professionalTax(18000, 'Karnataka')).toBe(0); expect(professionalTax(30000, 'Karnataka')).toBe(200); });
  it('leave balance', () => { expect(leaveBalance(12, 3, 4.5)).toBe(10.5); });
});
