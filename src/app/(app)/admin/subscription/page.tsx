import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Stat, Empty, Badge } from '@/components/ui';
import { inr, fdate, ftime } from '@/lib/fmt';

export const metadata = { title: 'Plan and wallet' };
export default async function Subscription() {
  const ctx = await requireCap('admin');
  const o = ctx.org;
  const [{ data: plans }, { data: inv }, { data: wal }, { count: students }, { data: out }, { data: tasks }] = await Promise.all([ctx.sb.from('platform_plans').select('*').order('price_per_student'), ctx.sb.from('platform_invoices').select('*').order('created_at', { ascending: false }), ctx.sb.from('platform_wallet_ledger').select('*').order('at', { ascending: false }).limit(20), ctx.sb.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'), ctx.sb.from('outbox').select('channel, cost').limit(20000), ctx.sb.from('platform_onboarding').select('*').order('sort')]);
  const byCh = new Map<string, number>(); for (const x of out ?? []) byCh.set(x.channel, (byCh.get(x.channel) ?? 0) + 1);
  return (
    <Page title="Plan, licences and messaging wallet" sub="Three clear tiers with predictable per-student pricing." actions={<Link className="btn-ghost" href="/x/support_tickets/new">Contact support</Link>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Plan" value={o.plan} hint={<Badge>{o.status}</Badge>} /><Stat label="Active students" value={students ?? 0} hint={`${inr(Number(o.price_per_student))} per student per year`} /><Stat label="Estimated annual fee" value={inr((students ?? 0) * Number(o.price_per_student))} hint={o.renewal_date ? `Renews ${fdate(o.renewal_date)}` : o.trial_ends ? `Trial ends ${fdate(o.trial_ends)}` : ''} /><Stat label="Messaging wallet" value={inr(o.messaging_balance)} tone={Number(o.messaging_balance) < 500 ? 'warn' : undefined} hint={Number(o.messaging_balance) < 500 ? 'Low balance: WhatsApp and SMS need credits' : 'for WhatsApp, SMS and voice'} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        {(plans ?? []).map((p) => <Card key={p.id} title={<>{p.name} {p.name === o.plan && <Badge tone="green">current</Badge>}</>}><div className="p-4 text-sm"><div className="text-xl font-semibold">{inr(p.price_per_student)} <span className="text-sm font-normal text-muted">per student per year</span></div><div className="text-xs text-muted">Minimum {inr(p.min_per_branch)} per branch per year</div><p className="mt-2">{p.includes}</p></div></Card>)}
        <Card title="Onboarding tracker" className="lg:col-span-2">{(tasks ?? []).length === 0 ? <Empty title="No onboarding plan" /> : <ul className="divide-y divide-line text-sm">{tasks!.map((t) => <li key={t.id} className="flex justify-between px-4 py-2"><span>{t.item}{t.blocker ? <span className="text-red-600"> · blocked: {t.blocker}</span> : null}</span><Badge>{t.status}</Badge></li>)}</ul>}</Card>
        <Card title="Messages by channel">{byCh.size === 0 ? <Empty title="No external messages queued" /> : <ul className="divide-y divide-line text-sm">{[...byCh].map(([c, n]) => <li key={c} className="flex justify-between px-4 py-2"><span>{c}</span><span>{n}</span></li>)}</ul>}</Card>
        <Card title="Invoices" className="lg:col-span-2">{(inv ?? []).length === 0 ? <Empty title="No invoices yet" /> : <table className="tbl"><tbody>{inv!.map((i) => <tr key={i.id}><td>{i.invoice_no}</td><td>{i.period}</td><td>{inr(Number(i.amount) + Number(i.gst))}</td><td><Badge>{i.status}</Badge></td></tr>)}</tbody></table>}</Card>
        <Card title="Wallet ledger">{(wal ?? []).length === 0 ? <Empty title="No credits bought yet" /> : <ul className="divide-y divide-line text-sm">{wal!.map((w) => <li key={w.id} className="flex justify-between px-4 py-2"><span>{w.note ?? w.type}<span className="block text-xs text-muted">{ftime(w.at)}</span></span><span className={w.type === 'credit' ? 'text-emerald-700' : 'text-red-700'}>{w.type === 'credit' ? '+' : '-'}{inr(w.amount)}</span></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
