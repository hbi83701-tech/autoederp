import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { inr, fdate } from '@/lib/fmt';
import { ChildSwitcher } from '../switcher';
import { setConsent, storeOrder, dataRequest, logReading } from '../actions';

export const metadata = { title: 'Store, wallet and more' };
const PURPOSES: [string, string][] = [['photos', 'Photos of my child in the school gallery and publications'], ['whatsapp', 'School messages on WhatsApp'], ['trip', 'Participation in school trips'], ['marketing', 'Using photos or results in school marketing']];
export default async function More() {
  const { ctx, children, child, t } = await family();
  if (!child) return <Page title="More"><Card><Empty title="No child linked" /></Card></Page>;
  void t;
  const [{ data: wallet }, { data: txns }, { data: items }, { data: orders }, { data: loans }, { data: consents }, { data: health }, { data: reading }] = await Promise.all([
    ctx.sb.from('wallets').select('balance, daily_limit, blocked_items').eq('student_id', child.id).maybeSingle(), ctx.sb.from('wallet_txns').select('type, amount, note, at').eq('student_id', child.id).order('at', { ascending: false }).limit(8),
    ctx.sb.from('items').select('id, name, price, variants').in('category', ['store', 'uniform', 'book', 'stationery']).eq('active', true).order('name'),
    ctx.sb.from('store_orders').select('id, lines, total, status, created_at').eq('student_id', child.id).order('created_at', { ascending: false }).limit(6),
    ctx.sb.from('loans').select('id, due_on, returned_on, book:books!loans_book_id_fkey(title)').eq('student_id', child.id).is('returned_on', null),
    ctx.sb.from('consents').select('purpose, granted, at').eq('user_id', ctx.user.id).eq('student_id', child.id), ctx.sb.from('student_sensitive').select('blood_group, allergies, emergency_contact').eq('student_id', child.id).maybeSingle(),
    ctx.sb.from('reading_logs').select('id, title, pages, date').eq('student_id', child.id).order('date', { ascending: false }).limit(5),
  ]);
  const cons = new Map((consents ?? []).map((c) => [c.purpose, c]));
  const hid = <input type="hidden" name="student_id" value={child.id} />;
  return (
    <Page title="Store, wallet and more" sub={`For ${child.first_name}`} actions={<ChildSwitcher children={children} current={child.id} />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Canteen wallet">{!wallet ? <Empty title="No wallet yet" hint="Ask the school office to open a canteen wallet." /> : <><div className="p-4"><div className="text-2xl font-semibold">{inr(wallet.balance)}</div><div className="text-sm text-muted">{wallet.daily_limit ? `Daily limit ${inr(wallet.daily_limit)}` : 'No daily limit'}{wallet.blocked_items ? ` · blocked: ${wallet.blocked_items}` : ''}</div><p className="mt-2 text-xs text-muted">To change the daily limit or block items, raise a request; top up at the counter.</p></div><ul className="divide-y divide-line border-t border-line text-sm">{(txns ?? []).map((x, i) => <li key={i} className="flex justify-between px-4 py-2"><span>{x.note ?? x.type}</span><span className={x.type === 'purchase' ? 'text-red-700' : 'text-emerald-700'}>{x.type === 'purchase' ? '-' : '+'}{inr(x.amount)}</span></li>)}</ul></>}</Card>
        <Card title="School store">{(items ?? []).length === 0 ? <Empty title="The store has no items listed" /> : <form action={storeOrder} className="space-y-3 p-4">{hid}<Field label="Item"><select name="item" className="input">{items!.map((i) => <option key={i.id} value={`${i.id}|${i.name}|${i.price}`}>{i.name} · {inr(i.price)}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="Size"><input name="size" className="input" placeholder="e.g. 32" /></Field><Field label="Quantity"><input name="qty" type="number" min={1} defaultValue={1} className="input" /></Field></div><button className="btn w-full">Order for pick-up</button></form>}
          <ul className="divide-y divide-line border-t border-line text-sm">{(orders ?? []).map((o) => <li key={o.id} className="flex justify-between px-4 py-2"><span>{(o.lines as { name: string }[]).map((l) => l.name).join(', ')}</span><span>{inr(o.total)} <Badge>{o.status}</Badge></span></li>)}</ul></Card>
        <Card title="Library and reading"><ul className="divide-y divide-line text-sm">{((loans ?? []) as unknown as { id: string; due_on: string; book: { title: string } | null }[]).map((l) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{l.book?.title}</span><span className="text-muted">due {fdate(l.due_on)}</span></li>)}{(reading ?? []).map((r) => <li key={r.id} className="flex justify-between px-4 py-2"><span>Read: {r.title}</span><span className="text-muted">{r.pages} pages</span></li>)}</ul>
          <form action={logReading} className="space-y-2 border-t border-line p-4">{hid}<input name="title" required placeholder="Book read at home" className="input" aria-label="Book title" /><div className="grid grid-cols-2 gap-2"><input name="pages" type="number" placeholder="Pages" className="input" aria-label="Pages" /><input name="minutes" type="number" placeholder="Minutes" className="input" aria-label="Minutes" /></div><button className="btn-ghost w-full">Add to reading log</button></form></Card>
        <Card title="Consent choices" className="lg:col-span-2"><ul className="divide-y divide-line text-sm">{PURPOSES.map(([p, label]) => { const c = cons.get(p); return <li key={p} className="flex items-center justify-between gap-3 px-4 py-2.5"><span>{label}{c && <span className="block text-xs text-muted">{c.granted ? 'Agreed' : 'Declined'} on {fdate(c.at)}</span>}</span><form action={setConsent} className="flex gap-1">{hid}<input type="hidden" name="purpose" value={p} /><button name="granted" value="true" className={c?.granted ? 'btn btn-sm' : 'btn-ghost btn-sm'}>I agree</button><button name="granted" value="false" className={c && !c.granted ? 'btn-danger btn-sm' : 'btn-ghost btn-sm'}>I do not agree</button></form></li>; })}</ul>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Educational activities and your child's safety do not need separate consent. You can change these choices at any time.</p></Card>
        <Card title="Health details and data requests"><dl className="space-y-1 p-4 text-sm"><div className="flex justify-between"><dt className="text-muted">Blood group</dt><dd>{health?.blood_group ?? '—'}</dd></div><div className="flex justify-between"><dt className="text-muted">Allergies</dt><dd>{health?.allergies ?? '—'}</dd></div><div className="flex justify-between"><dt className="text-muted">Emergency contact</dt><dd>{health?.emergency_contact ?? '—'}</dd></div></dl>
          <form action={dataRequest} className="space-y-2 border-t border-line p-4"><select name="type" className="input" aria-label="Request type"><option value="access">Send me a copy of my family's data</option><option value="correction">Correct our data</option><option value="erasure">Erase data the school no longer needs</option></select><input name="details" className="input" placeholder="Details" aria-label="Details" /><button className="btn-ghost w-full">Make a data request</button></form></Card>
      </div>
    </Page>
  );
}
