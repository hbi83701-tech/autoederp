import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { inr, fdate } from '@/lib/fmt';
import { importBankLines, matchBankLine } from '../actions';

export const metadata = { title: 'Bank reconciliation' };
export default async function Recon() {
  const ctx = await requireCap('fees');
  const [{ data: lines }, { data: pays }] = await Promise.all([
    ctx.sb.from('bank_lines').select('*').order('date', { ascending: false }).limit(500),
    ctx.sb.from('receipt_payments').select('id, mode, amount, reference, cheque_no, receipt:receipts!receipt_payments_receipt_id_fkey(receipt_no, status)').is('bank_line_id', null).neq('mode', 'cash').limit(500),
  ]);
  const P = ((pays ?? []) as unknown as { id: string; mode: string; amount: number; reference: string | null; cheque_no: string | null; receipt: { receipt_no: string; status: string } | null }[]).filter((p) => p.receipt?.status === 'valid');
  const L = lines ?? [];
  const un = L.filter((l) => l.status === 'unmatched');
  const can = ctx.can('fees', 'write');
  return (
    <Page title="Bank reconciliation" sub="Gateway settlement files and bank statements are matched to receipts by reference and amount. What is left goes to the unmatched queue.">
      <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Matched lines" value={L.filter((l) => l.status === 'matched').length} tone="good" /><Stat label="Unmatched bank lines" value={un.length} tone={un.length ? 'warn' : 'good'} /><Stat label="Non-cash payments not yet in bank" value={P.length} hint={inr(P.reduce((t, p) => t + Number(p.amount), 0))} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Unmatched queue" className="lg:col-span-2">{un.length === 0 ? <Empty title="Nothing to match" hint="Import a statement on the right. Lines with a matching reference and amount reconcile on their own." /> : <table className="tbl"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Amount</th><th>Match to</th></tr></thead>
          <tbody>{un.map((l) => { const cands = P.filter((p) => Number(p.amount) === Number(l.amount)); return <tr key={l.id}><td>{fdate(l.date)}</td><td>{l.description}</td><td>{l.reference}</td><td className="text-right tabular-nums">{inr(l.amount)}</td>
            <td>{can && <form action={matchBankLine} className="flex gap-1"><input type="hidden" name="line" value={l.id} /><select name="payment" className="input !py-1 text-xs" aria-label="Payment"><option value="">{cands.length ? 'Choose a payment' : 'No payment of this amount'}</option>{cands.map((p) => <option key={p.id} value={p.id}>{p.receipt?.receipt_no} · {p.mode} {p.reference ?? p.cheque_no ?? ''}</option>)}</select><button name="action" value="match" className="btn-ghost btn-sm">Match</button><button name="action" value="ignore" className="btn-ghost btn-sm">Ignore</button></form>}</td></tr>; })}</tbody></table>}</Card>
        {can && <Card title="Import statement lines"><form action={importBankLines} className="space-y-3 p-4"><textarea name="csv" rows={8} className="input font-mono text-xs" placeholder={'2026-06-10, UPI credit, 15000, 412345678901\n2026-06-10, CHQ deposit, 22000, 004512'} required aria-label="Statement lines" /><p className="text-xs text-muted">One line each: date (YYYY-MM-DD), description, amount, reference.</p><button className="btn w-full">Import and match</button></form></Card>}
      </div>
      {L.filter((l) => l.status !== 'unmatched').length > 0 && <Card title="Recently reconciled" className="mt-4"><ul className="divide-y divide-line text-sm">{L.filter((l) => l.status !== 'unmatched').slice(0, 15).map((l) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{fdate(l.date)} · {l.description} · {l.reference}</span><span>{inr(l.amount)} <Badge>{l.status}</Badge></span></li>)}</ul></Card>}
    </Page>
  );
}
