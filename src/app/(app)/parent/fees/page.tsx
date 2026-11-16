import Link from 'next/link';
import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { today, fdate, inr } from '@/lib/fmt';
import { balance, type Demand } from '@/lib/rules/fees';

export const metadata = { title: 'Fees' };
export default async function ParentFees() {
  const { ctx, children, t } = await family();
  const ids = children.map((c) => c.id);
  const d = today();
  const [{ data: dem }, { data: rec }, { data: wallets }, { data: gw }] = await Promise.all([
    ctx.sb.from('fee_demands').select('id, student_id, label, amount, concession, fine, paid, due_date, status, head:fee_heads!fee_demands_head_id_fkey(name)').in('student_id', ids).neq('status', 'cancelled').order('due_date'),
    ctx.sb.from('receipts').select('id, receipt_no, date, total, status, student_id').in('student_id', ids).order('date', { ascending: false }).limit(40),
    ctx.sb.from('wallets').select('student_id, balance, daily_limit').in('student_id', ids), ctx.sb.from('issued_documents').select('id, number, title').in('student_id', ids).eq('type', 'fee'),
  ]);
  const D = (dem ?? []) as unknown as (Demand & { student_id: string; label: string; status: string; head: { name: string } | null })[];
  const open = D.filter((x) => ['due', 'partial'].includes(x.status));
  const name = (id: string) => children.find((c) => c.id === id)?.first_name ?? '';
  const total = open.reduce((x, y) => x + balance(y), 0);
  return (
    <Page title={t('Fees')} sub="Dues and receipts for all your children in one place.">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3"><Stat label={t('Fees due')} value={inr(total)} tone={open.some((x) => x.due_date < d) ? 'bad' : undefined} /><Stat label="Paid this year" value={inr(D.reduce((x, y) => x + Number(y.paid), 0))} tone="good" />{(wallets ?? []).length > 0 && <Stat label="Canteen wallet" value={inr((wallets ?? []).reduce((x, w) => x + Number(w.balance), 0))} />}</div>
      {total > 0 && <div className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-sm">Online payment (UPI, card, net banking) appears here as soon as your school connects its payment gateway. Until then, pay at the school counter; the receipt shows up below within a minute.</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Instalments" className="lg:col-span-2">{D.length === 0 ? <Empty title="No fees have been raised yet" /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Fee</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Status</th></tr></thead><tbody>{D.map((x) => <tr key={x.id}><td>{x.head?.name}<div className="text-xs text-muted">{children.length > 1 ? `${name(x.student_id)} · ` : ''}{x.label}{Number(x.concession) ? ` · concession ${inr(x.concession)}` : ''}</div></td><td>{fdate(x.due_date)}</td><td className="text-right tabular-nums">{inr(Number(x.amount) - Number(x.concession) + Number(x.fine))}</td><td className="text-right tabular-nums">{inr(balance(x))}</td><td><Badge tone={x.status === 'due' && x.due_date < d ? 'red' : undefined}>{x.status === 'due' && x.due_date < d ? 'overdue' : x.status}</Badge></td></tr>)}</tbody></table></div>}</Card>
        <div className="space-y-4"><Card title="Receipts">{(rec ?? []).length === 0 ? <Empty title="No payments yet" /> : <ul className="divide-y divide-line text-sm">{rec!.map((r) => <li key={r.id} className="flex justify-between px-4 py-2"><Link className="link" href={`/receipt/${r.id}`}>{r.receipt_no}</Link><span>{inr(r.total)} <span className="text-xs text-muted">{fdate(r.date)}</span></span></li>)}</ul>}</Card>
          <Card title="Fee certificates">{(gw ?? []).length === 0 ? <div className="p-4 text-sm text-muted">Ask for the annual fee certificate (for income tax) under Requests.</div> : <ul className="divide-y divide-line text-sm">{gw!.map((g) => <li key={g.id} className="px-4 py-2"><Link className="link" href={`/documents/${g.id}`}>{g.title} {g.number}</Link></li>)}</ul>}</Card></div>
      </div>
    </Page>
  );
}
