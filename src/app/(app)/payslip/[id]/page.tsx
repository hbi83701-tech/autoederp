import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { PrintButton } from '@/components/client';
import { fullName, inr } from '@/lib/fmt';

export const metadata = { title: 'Payslip' };
export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { data: p } = await ctx.sb.from('payslips').select('*, staff:staff!payslips_staff_id_fkey(first_name, last_name, emp_code, designation, department)').eq('id', id).maybeSingle();
  if (!p) notFound();
  const E = Object.entries(p.earnings as Record<string, number>), D = Object.entries(p.deductions as Record<string, number>);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <div className="card p-6">
        <div className="border-b border-line pb-3 text-center"><div className="text-lg font-semibold">{ctx.org.name}</div><div className="text-sm text-muted">Payslip for {new Date(p.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div></div>
        <div className="grid grid-cols-2 gap-2 py-3 text-sm"><div><span className="text-muted">Name: </span>{fullName(p.staff)}</div><div><span className="text-muted">Employee code: </span>{p.staff?.emp_code}</div><div><span className="text-muted">Designation: </span>{p.staff?.designation}</div><div><span className="text-muted">Paid days: </span>{p.paid_days} of {p.working_days}{Number(p.lop_days) ? ` (LOP ${p.lop_days})` : ''}</div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <table className="tbl"><thead><tr><th>Earnings</th><th className="text-right">Rs</th></tr></thead><tbody>{E.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right tabular-nums">{Number(v).toLocaleString('en-IN')}</td></tr>)}<tr><td className="font-semibold">Gross</td><td className="text-right font-semibold tabular-nums">{Number(p.gross).toLocaleString('en-IN')}</td></tr></tbody></table>
          <table className="tbl"><thead><tr><th>Deductions</th><th className="text-right">Rs</th></tr></thead><tbody>{D.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right tabular-nums">{Number(v).toLocaleString('en-IN')}</td></tr>)}<tr><td className="font-semibold">Total</td><td className="text-right font-semibold tabular-nums">{Number(p.total_deductions).toLocaleString('en-IN')}</td></tr></tbody></table>
        </div>
        <div className="mt-4 rounded-lg bg-brand-soft px-4 py-3 text-center"><span className="text-sm text-muted">Net pay </span><span className="text-xl font-semibold">{inr(p.net)}</span></div>
        <p className="mt-3 text-xs text-muted">Employer contribution: PF {inr(p.employer_pf)}{Number(p.employer_esi) ? `, ESI ${inr(p.employer_esi)}` : ''}. This is a system-generated payslip.</p>
      </div>
    </div>
  );
}
