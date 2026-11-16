import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fullName, fdate, inr, today } from '@/lib/fmt';
import { balance, type Demand } from '@/lib/rules/fees';
import { collectFee, addDemand } from '../actions';
import { CounterTotals } from './totals';

export const metadata = { title: 'Fee counter' };
/** Counter collection (FEE-04): search or scan, dues by head and instalment, several modes in one receipt, siblings together. */
export default async function Counter({ searchParams }: { searchParams: Promise<{ q?: string; student?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('fees', 'write');
  const term = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
  const { data: hits } = term ? await ctx.sb.from('students').select('id, first_name, last_name, admission_no, section:sections!students_section_id_fkey(name)').or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_no.ilike.%${term}%`).in('status', ['active', 'admitted', 'withdrawn']).limit(12) : { data: null };
  const { data: st } = sp.student ? await ctx.sb.from('students').select('id, first_name, last_name, admission_no, household_id, section:sections!students_section_id_fkey(name)').eq('id', sp.student).maybeSingle() : { data: null };
  const { data: family } = st?.household_id ? await ctx.sb.from('students').select('id, first_name, last_name').eq('household_id', st.household_id).in('status', ['active', 'admitted']) : { data: st ? [st] : [] };
  const fam = family?.length ? family : st ? [st] : [];
  const [{ data: dem }, { data: heads }] = await Promise.all([
    st ? ctx.sb.from('fee_demands').select('id, student_id, label, amount, concession, fine, paid, due_date, status, head:fee_heads!fee_demands_head_id_fkey(name)').in('student_id', fam.map((f) => f.id)).in('status', ['due', 'partial']).order('due_date') : Promise.resolve({ data: [] }),
    ctx.sb.from('fee_heads').select('id, name').eq('active', true).order('name'),
  ]);
  const d = (dem ?? []) as unknown as (Demand & { student_id: string; label: string; head: { name: string } | null })[];
  const t = today();
  return (
    <Page title="Fee counter" sub="Search by name or admission number, or scan the ID card." actions={<><Link className="btn-ghost" href="/fees/receipts">Day sheet</Link><Link className="btn-ghost" href="/fees/dues">Defaulters</Link></>}>
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q ?? ''} autoFocus={!st} placeholder="Student name, admission number or scanned ID" className="input max-w-md" aria-label="Find student" /><button className="btn">Find</button></form>
      {hits && <Card className="mb-4">{hits.length === 0 ? <Empty title="No student found" hint="Check the spelling or try the admission number." /> : <ul className="divide-y divide-line">{(hits as unknown as { id: string; first_name: string; last_name: string; admission_no: string; section: { name: string } | null }[]).map((h) => <li key={h.id}><Link className="flex justify-between px-4 py-2.5 text-sm hover:bg-paper" href={`/fees/counter?student=${h.id}`}><span className="font-medium">{fullName(h)}</span><span className="text-muted">{h.section?.name} · {h.admission_no}</span></Link></li>)}</ul>}</Card>}
      {st && (
        <div className="grid gap-4 lg:grid-cols-3">
          <form action={collectFee} className="space-y-4 lg:col-span-2" id="collect">
            <input type="hidden" name="student" value={st.id} /><input type="hidden" name="key" value={randomUUID()} />
            <Card title={<>{fullName(st)} <span className="font-normal text-muted">· {(st.section as unknown as { name: string } | null)?.name} · {st.admission_no}</span>{fam.length > 1 && <Badge tone="teal">{fam.length} children in this family</Badge>}</>}>
              {d.length === 0 ? <Empty title="No dues" hint="Nothing is pending for this family. Add an ad-hoc fee on the right, or assign a fee plan." /> : (
                <table className="tbl"><thead><tr><th>Fee</th><th>Due</th><th className="text-right">Balance</th><th className="w-36">Collect now</th></tr></thead>
                  <tbody>{d.map((x) => { const b = balance(x); const overdue = x.due_date < t; return (
                    <tr key={x.id}><td>{x.head?.name}<div className="text-xs text-muted">{fam.length > 1 ? `${fam.find((f) => f.id === x.student_id)?.first_name} · ` : ''}{x.label}{Number(x.fine) > 0 ? ` · includes fine ${inr(x.fine)}` : ''}</div></td>
                      <td>{fdate(x.due_date)} {overdue && <Badge tone="red">overdue</Badge>}</td><td className="text-right tabular-nums">{inr(b)}</td>
                      <td><input name={`a_${x.id}`} type="number" min={0} max={b} step="1" defaultValue={overdue || x.due_date <= t ? b : ''} className="input amt !py-1 text-right" aria-label={`Amount for ${x.label}`} /></td></tr>); })}</tbody></table>)}
            </Card>
            {d.length > 0 && <Card title="Payment"><div className="space-y-3 p-4">
              {[1, 2].map((n) => (
                <div key={n} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <select name={`mode${n}`} className="input" defaultValue={n === 1 ? 'cash' : ''} aria-label={`Payment mode ${n}`}>{n > 1 && <option value="">+ second mode</option>}{['cash', 'upi', 'card', 'cheque', 'dd', 'bank_transfer'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select>
                  <input name={`amount${n}`} type="number" min={0} step="1" placeholder={n === 1 ? 'Full amount' : 'Amount'} className="input text-right" aria-label={`Amount in mode ${n}`} />
                  <input name={`ref${n}`} placeholder="UPI / card reference" className="input" aria-label="Reference" />
                  <input name={`cheque_no${n}`} placeholder="Cheque number" className="input" aria-label="Cheque number" />
                  <input name={`cheque_bank${n}`} placeholder="Bank" className="input" aria-label="Cheque bank" />
                </div>))}
              <div className="grid gap-2 sm:grid-cols-3"><Field label="Receipt date"><input type="date" name="date" defaultValue={t} max={t} className="input" /></Field><Field label="Note" span={2}><input name="note" className="input" /></Field></div>
              <CounterTotals />
            </div></Card>}
          </form>
          <Card title="Add a one-off fee"><form action={addDemand} className="space-y-3 p-4">
            <input type="hidden" name="student_id" value={st.id} />
            <Field label="Fee head"><select name="head_id" className="input" required>{(heads ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <Field label="Description"><input name="label" className="input" required /></Field>
            <Field label="Amount"><input name="amount" type="number" min={1} className="input" required /></Field>
            <Field label="Due date"><input name="due_date" type="date" defaultValue={t} className="input" /></Field>
            <button className="btn-ghost w-full">Add fee</button>
            <p className="text-xs text-muted">For application, event, store or miscellaneous collections. <Link className="link" href={`/students/${st.id}?tab=fees`}>Open Student 360</Link></p>
          </form></Card>
        </div>
      )}
    </Page>
  );
}
