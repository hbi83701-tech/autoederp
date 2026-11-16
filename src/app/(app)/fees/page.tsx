import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Stat, BarList, Empty } from '@/components/ui';
import { inr, inrShort, today, pct } from '@/lib/fmt';
import { balance, type Demand } from '@/lib/rules/fees';

export const metadata = { title: 'Fees' };
export default async function Fees() {
  const ctx = await requireCap('fees');
  const d = today();
  const b = <T extends { or: (f: string) => T }>(q: T) => (ctx.branchId ? q.or(`branch_id.eq.${ctx.branchId},branch_id.is.null`) : q);
  const [{ data: dem }, { data: rec }, { data: pays }, { data: con }] = await Promise.all([
    b(ctx.sb.from('fee_demands').select('id, amount, concession, fine, paid, due_date, status, head:fee_heads!fee_demands_head_id_fkey(name)').eq('year_id', ctx.year?.id ?? '').neq('status', 'cancelled').limit(30000)),
    b(ctx.sb.from('receipts').select('id, total, date').eq('year_id', ctx.year?.id ?? '').eq('status', 'valid').limit(30000)),
    ctx.sb.from('receipt_payments').select('mode, amount, receipt:receipts!receipt_payments_receipt_id_fkey(status, year_id)').limit(30000),
    ctx.can('concessions') ? ctx.sb.from('concessions').select('amount').eq('status', 'approved').eq('year_id', ctx.year?.id ?? '') : Promise.resolve({ data: [] }),
  ]);
  const D = (dem ?? []) as unknown as (Demand & { head: { name: string } | null })[];
  const demand = D.reduce((t, x) => t + Number(x.amount) - Number(x.concession) + Number(x.fine), 0);
  const collected = D.reduce((t, x) => t + Number(x.paid), 0);
  const dueToDate = D.filter((x) => x.due_date <= d).reduce((t, x) => t + Number(x.amount) - Number(x.concession) + Number(x.fine), 0);
  const overdue = D.filter((x) => x.due_date < d).reduce((t, x) => t + balance(x), 0);
  const P = ((pays ?? []) as unknown as { mode: string; amount: number; receipt: { status: string; year_id: string } | null }[]).filter((p) => p.receipt?.status === 'valid' && p.receipt.year_id === ctx.year?.id);
  const byMode = new Map<string, number>(); for (const p of P) byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + Number(p.amount));
  const online = P.filter((p) => ['upi', 'card', 'online', 'bank_transfer'].includes(p.mode)).reduce((t, p) => t + Number(p.amount), 0);
  const allPaid = P.reduce((t, p) => t + Number(p.amount), 0);
  const byHead = new Map<string, number>(); for (const x of D) byHead.set(x.head?.name ?? 'Other', (byHead.get(x.head?.name ?? 'Other') ?? 0) + balance(x));
  const byMonth = new Map<string, number>(); for (const r of rec ?? []) byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + Number(r.total));
  const conc = (con ?? []).reduce((t, c) => t + Number(c.amount), 0);
  const links = [['/fees/counter', 'Fee counter'], ['/fees/dues', 'Defaulter worklist'], ['/fees/receipts', 'Receipts and day sheet'], ['/fees/structure', 'Fee structure and plans'], ['/fees/cheques', 'Cheques'], ['/fees/reconciliation', 'Bank reconciliation'], ['/x/concession_types', 'Concession types'], ['/x/refunds', 'Refunds'], ['/x/fee_heads', 'Fee heads'], ['/reports/fees', 'Fee reports']];
  return (
    <Page title="Fees" sub={`Academic year ${ctx.year?.name ?? ''}`} actions={ctx.can('fees', 'write') ? <Link className="btn" href="/fees/counter">Collect a fee</Link> : undefined}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net demand this year" value={inrShort(demand)} hint={`after ${inrShort(conc)} concessions`} />
        <Stat label="Collected" value={inrShort(collected)} hint={`${pct(collected, dueToDate)}% of fees due to date (collection efficiency)`} tone="good" />
        <Stat label="Overdue" value={inrShort(overdue)} tone={overdue ? 'warn' : 'good'} href="/fees/dues" />
        <Stat label="Paid through online modes" value={`${pct(online, allPaid)}%`} hint="UPI, card, net banking" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Collections by month">{byMonth.size === 0 ? <Empty title="No collections yet" /> : <BarList rows={[...byMonth].sort().map(([label, value]) => ({ label, value }))} format={inrShort} />}</Card>
        <Card title="Outstanding by fee head">{byHead.size === 0 ? <Empty title="No demands raised" hint="Create a fee plan and generate demands." /> : <BarList rows={[...byHead].filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]).map(([label, value]) => ({ label, value }))} format={inrShort} />}</Card>
        <Card title="Collected by mode">{byMode.size === 0 ? <Empty title="No payments yet" /> : <BarList rows={[...byMode].sort((a, b2) => b2[1] - a[1]).map(([label, value]) => ({ label: label.replace('_', ' '), value }))} format={inr} />}</Card>
      </div>
      <Card title="Fee desk" className="mt-4"><div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">{links.map(([h, l]) => <Link key={h} href={h} className="bg-white px-4 py-3 text-sm hover:bg-paper">{l}</Link>)}</div></Card>
    </Page>
  );
}
