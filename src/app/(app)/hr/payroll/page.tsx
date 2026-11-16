import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { fullName, inr, today } from '@/lib/fmt';
import { RULES } from '@/lib/rules/payroll';
import { runPayroll, lockPayroll } from '../actions';

export const metadata = { title: 'Payroll' };
export default async function Payroll({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('payroll');
  let rq = ctx.sb.from('payroll_runs').select('*').order('month', { ascending: false }).limit(24);
  if (ctx.branchId) rq = rq.eq('branch_id', ctx.branchId);
  const { data: runs } = await rq;
  const run = (runs ?? []).find((r) => r.id === sp.run) ?? (runs ?? [])[0];
  const { data: slips } = run ? await ctx.sb.from('payslips').select('id, paid_days, lop_days, gross, total_deductions, net, deductions, employer_pf, staff:staff!payslips_staff_id_fkey(first_name, last_name, emp_code)').eq('run_id', run.id) : { data: [] };
  const S = (slips ?? []) as unknown as { id: string; paid_days: number; lop_days: number; gross: number; total_deductions: number; net: number; deductions: Record<string, number>; employer_pf: number; staff: { first_name: string; last_name: string; emp_code: string } | null }[];
  const can = ctx.can('payroll', 'write');
  const sum = (k: string) => S.reduce((t, s) => t + Number(s.deductions?.[k] ?? 0), 0);
  return (
    <Page title="Payroll" sub={`Monthly run with attendance, leave and loss-of-pay inputs. Statutory rule set ${RULES.version}: PF, ESI, Professional Tax and TDS.`} actions={can ? <form action={runPayroll} className="flex gap-2"><input type="month" name="month" defaultValue={today().slice(0, 7)} className="input !w-auto" aria-label="Month" /><button className="btn">Compute payroll</button></form> : undefined}>
      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Runs">{(runs ?? []).length === 0 ? <Empty title="No payroll runs yet" hint="Set salary structures on each staff profile, then compute the month." /> : <ul className="divide-y divide-line text-sm">{runs!.map((r) => <li key={r.id}><Link href={`/hr/payroll?run=${r.id}`} className={`flex justify-between px-4 py-2.5 hover:bg-paper ${run?.id === r.id ? 'bg-brand-soft font-semibold' : ''}`}><span>{String(r.month).slice(0, 7)}</span><Badge>{r.status}</Badge></Link></li>)}</ul>}</Card>
        <div className="space-y-4 lg:col-span-3">{run && <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Gross" value={inr(run.total_gross)} hint={`${S.length} staff · ${run.working_days} working days`} /><Stat label="Deductions" value={inr(run.total_deductions)} /><Stat label="Net pay" value={inr(run.total_net)} tone="good" /><Stat label="Statutory" value={inr(sum('Provident fund') + sum('ESI') + sum('Professional tax') + sum('TDS'))} hint={`PF ${inr(sum('Provident fund'))} · PT ${inr(sum('Professional tax'))} · TDS ${inr(sum('TDS'))}`} /></div>
          <div className="no-print flex flex-wrap gap-2">{can && run.status === 'draft' && <form action={lockPayroll}><input type="hidden" name="run" value={run.id} /><ConfirmSubmit className="btn" message="Lock this payroll? Payslips are released to staff and the month can no longer be recomputed.">Lock and release payslips</ConfirmSubmit></form>}
            {run.status !== 'draft' && <><Link className="btn-ghost" href={`/api/payroll/${run.id}/bank`}>Bank transfer file</Link><Link className="btn-ghost" href={`/api/payroll/${run.id}/statutory`}>PF / ESI / PT report</Link></>}</div>
          <Card>{S.length === 0 ? <Empty title="No payslips in this run" /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Staff</th><th>Paid days</th><th>LOP</th><th className="text-right">Gross</th><th className="text-right">PF</th><th className="text-right">PT</th><th className="text-right">Other</th><th className="text-right">Net</th></tr></thead>
            <tbody>{S.map((s) => { const pf = Number(s.deductions?.['Provident fund'] ?? 0), pt = Number(s.deductions?.['Professional tax'] ?? 0); return <tr key={s.id}><td><Link className="link font-medium" href={`/payslip/${s.id}`}>{fullName(s.staff)}</Link><div className="text-xs text-muted">{s.staff?.emp_code}</div></td><td>{s.paid_days}</td><td>{Number(s.lop_days) || ''}</td><td className="text-right tabular-nums">{inr(s.gross)}</td><td className="text-right tabular-nums">{inr(pf)}</td><td className="text-right tabular-nums">{inr(pt)}</td><td className="text-right tabular-nums">{inr(Number(s.total_deductions) - pf - pt)}</td><td className="text-right font-medium tabular-nums">{inr(s.net)}</td></tr>; })}</tbody></table></div>}</Card></>}
        </div>
      </div>
    </Page>
  );
}
