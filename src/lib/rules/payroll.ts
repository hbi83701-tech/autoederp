/**
 * Payroll rules as pure functions (HR-04, HR-05). Statutory values are versioned here so they can be golden-tested:
 * PF 12% of PF wages capped at Rs 15,000; ESI 0.75% / 3.25% when gross is Rs 21,000 or less; Professional Tax by state slab.
 * TDS is taken as the monthly figure set on the salary structure. Confirm rates with your payroll consultant each year.
 */
export type Structure = { basic: number; hra: number; da: number; special_allowance: number; other_allowance: number; pf_applicable: boolean; esi_applicable: boolean; pt_applicable: boolean; tds_monthly: number };
export type Inputs = { workingDays: number; lopDays: number; bonus?: number; arrears?: number; reimbursement?: number; otherDeduction?: number; loanEmi?: number; state?: string };
export const RULES = { version: '2026-04', pfRate: 0.12, pfWageCeiling: 15000, esiEmployee: 0.0075, esiEmployer: 0.0325, esiGrossLimit: 21000 };

const PT_SLABS: Record<string, { upTo: number; tax: number }[]> = {
  Telangana: [{ upTo: 15000, tax: 0 }, { upTo: 20000, tax: 150 }, { upTo: Infinity, tax: 200 }],
  'Andhra Pradesh': [{ upTo: 15000, tax: 0 }, { upTo: 20000, tax: 150 }, { upTo: Infinity, tax: 200 }],
  Karnataka: [{ upTo: 24999, tax: 0 }, { upTo: Infinity, tax: 200 }],
  Maharashtra: [{ upTo: 7500, tax: 0 }, { upTo: 10000, tax: 175 }, { upTo: Infinity, tax: 200 }],
  'Tamil Nadu': [{ upTo: 3500, tax: 0 }, { upTo: 5000, tax: 22.5 }, { upTo: 7500, tax: 52.5 }, { upTo: 10000, tax: 115 }, { upTo: 12500, tax: 171 }, { upTo: Infinity, tax: 208 }],
};
export const professionalTax = (gross: number, state = 'Telangana') => (PT_SLABS[state] ?? PT_SLABS.Telangana).find((s) => gross <= s.upTo)!.tax;
const r = (n: number) => Math.round(n);

export function computePayslip(s: Structure, i: Inputs) {
  const wd = Math.max(1, i.workingDays);
  const lop = Math.min(Math.max(0, i.lopDays), wd);
  const factor = (wd - lop) / wd;
  const earnings: Record<string, number> = {
    Basic: r(s.basic * factor), HRA: r(s.hra * factor), DA: r(s.da * factor), 'Special allowance': r(s.special_allowance * factor), 'Other allowance': r(s.other_allowance * factor),
    ...(i.bonus ? { Bonus: r(i.bonus) } : {}), ...(i.arrears ? { Arrears: r(i.arrears) } : {}), ...(i.reimbursement ? { Reimbursement: r(i.reimbursement) } : {}),
  };
  for (const k of Object.keys(earnings)) if (!earnings[k]) delete earnings[k];
  const gross = Object.values(earnings).reduce((t, x) => t + x, 0);
  const statutoryGross = gross - (i.reimbursement ? r(i.reimbursement) : 0);
  const pfWages = Math.min((earnings.Basic ?? 0) + (earnings.DA ?? 0), RULES.pfWageCeiling);
  const pf = s.pf_applicable ? r(pfWages * RULES.pfRate) : 0;
  const esiOn = s.esi_applicable && s.basic + s.hra + s.da + s.special_allowance + s.other_allowance <= RULES.esiGrossLimit;
  const esi = esiOn ? Math.ceil(statutoryGross * RULES.esiEmployee) : 0;
  const pt = s.pt_applicable ? professionalTax(statutoryGross, i.state) : 0;
  const deductions: Record<string, number> = { 'Provident fund': pf, ESI: esi, 'Professional tax': pt, TDS: r(s.tds_monthly ?? 0), 'Loan / advance recovery': r(i.loanEmi ?? 0), 'Other deductions': r(i.otherDeduction ?? 0) };
  for (const k of Object.keys(deductions)) if (!deductions[k]) delete deductions[k];
  const totalDeductions = Object.values(deductions).reduce((t, x) => t + x, 0);
  return { earnings, deductions, gross, totalDeductions, net: gross - totalDeductions, paidDays: wd - lop, lopDays: lop, employerPf: pf, employerEsi: esiOn ? Math.ceil(statutoryGross * RULES.esiEmployer) : 0 };
}

/** Leave balance: allotted plus carried forward minus approved days in the year. */
export const leaveBalance = (allotted: number, carried: number, used: number) => Math.round((allotted + carried - used) * 10) / 10;
