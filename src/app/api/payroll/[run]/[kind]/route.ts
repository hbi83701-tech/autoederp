import { NextResponse } from 'next/server';
import { getCtx } from '@/lib/ctx';
import { csv, fullName } from '@/lib/fmt';

/** Bank transfer file and statutory (PF / ESI / PT / TDS) report for a locked payroll run. */
export async function GET(_: Request, { params }: { params: Promise<{ run: string; kind: string }> }) {
  const { run, kind } = await params;
  const ctx = await getCtx();
  if (!ctx.can('payroll')) return new NextResponse('Not allowed', { status: 403 });
  const { data: slips } = await ctx.sb.from('payslips').select('net, gross, deductions, employer_pf, employer_esi, staff_id, staff:staff!payslips_staff_id_fkey(first_name, last_name, emp_code)').eq('run_id', run);
  const { data: sens } = await ctx.sb.from('staff_sensitive').select('staff_id, bank_name, bank_account, ifsc, pan, uan, esi_no');
  await ctx.sb.rpc('log_view', { p_entity: 'payroll_runs', p_id: run, p_note: `${kind} file downloaded` });
  const S = (slips ?? []) as unknown as { net: number; gross: number; deductions: Record<string, number>; employer_pf: number; employer_esi: number; staff_id: string; staff: { first_name: string; last_name: string; emp_code: string } | null }[];
  const b = (id: string) => (sens ?? []).find((x) => x.staff_id === id);
  const rows = kind === 'bank'
    ? S.map((s) => ({ 'Employee code': s.staff?.emp_code, Name: fullName(s.staff), Bank: b(s.staff_id)?.bank_name, 'Account number': b(s.staff_id)?.bank_account, IFSC: b(s.staff_id)?.ifsc, Amount: s.net }))
    : S.map((s) => ({ 'Employee code': s.staff?.emp_code, Name: fullName(s.staff), UAN: b(s.staff_id)?.uan, 'ESI number': b(s.staff_id)?.esi_no, PAN: b(s.staff_id)?.pan, Gross: s.gross, 'PF (employee)': s.deductions?.['Provident fund'] ?? 0, 'PF (employer)': s.employer_pf, 'ESI (employee)': s.deductions?.ESI ?? 0, 'ESI (employer)': s.employer_esi, 'Professional tax': s.deductions?.['Professional tax'] ?? 0, TDS: s.deductions?.TDS ?? 0 }));
  return new NextResponse(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="payroll-${kind}.csv"` } });
}
