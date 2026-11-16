import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { inr, inrShort, today, fdate, fullName } from '@/lib/fmt';
import { balance, ageingBucket, type Demand } from '@/lib/rules/fees';
import { logFollowup, applyLateFees } from '../actions';

export const metadata = { title: 'Defaulter worklist' };
/** One defaulter worklist by ageing, amount and class, with call and message actions and promises to pay (FEE-09). */
export default async function Dues({ searchParams }: { searchParams: Promise<{ bucket?: string; section?: string; open?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('fees');
  const d = today();
  let q = ctx.sb.from('fee_demands').select('id, student_id, amount, concession, fine, paid, due_date, student:students!fee_demands_student_id_fkey(first_name, last_name, admission_no, status, section_id, section:sections!students_section_id_fkey(name), household:households!students_household_id_fkey(phone))').in('status', ['due', 'partial']).lt('due_date', d).limit(20000);
  if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const [{ data }, { data: fu }, { data: sections }] = await Promise.all([q, ctx.sb.from('fee_followups').select('student_id, type, note, promise_date, promise_amount, created_at').order('created_at', { ascending: false }).limit(2000), ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name')]);
  type Row = Demand & { student_id: string; student: { first_name: string; last_name: string; admission_no: string; status: string; section_id: string; section: { name: string } | null; household: { phone: string } | null } | null };
  const by = new Map<string, { s: Row['student']; total: number; oldest: string; n: number }>();
  for (const r of (data ?? []) as unknown as Row[]) { const x = by.get(r.student_id) ?? { s: r.student, total: 0, oldest: r.due_date, n: 0 }; x.total += balance(r); x.n++; if (r.due_date < x.oldest) x.oldest = r.due_date; by.set(r.student_id, x); }
  const last = new Map<string, NonNullable<typeof fu>[number]>(); for (const f of fu ?? []) if (!last.has(f.student_id)) last.set(f.student_id, f);
  let rows = [...by].map(([id, x]) => ({ id, ...x, bucket: ageingBucket(x.oldest, d) })).filter((r) => r.total > 0);
  const buckets = ['0-30', '31-60', '61-90', '90+'] as const;
  const totals = Object.fromEntries(buckets.map((b) => [b, rows.filter((r) => r.bucket === b).reduce((t, r) => t + r.total, 0)]));
  if (sp.bucket) rows = rows.filter((r) => r.bucket === sp.bucket);
  if (sp.section) rows = rows.filter((r) => r.s?.section_id === sp.section);
  rows.sort((a, b) => b.total - a.total);
  const can = ctx.can('fees', 'write');
  return (
    <Page title="Defaulter worklist" sub="Overdue instalments by family. Reminders never block a child's attendance, classes or exams." actions={<>{can && <form action={applyLateFees}><ConfirmSubmit className="btn-ghost" message="Recalculate late fees on all overdue instalments using the school's late-fee rule?">Apply late fees</ConfirmSubmit></form>}<Link className="btn-ghost" href="/reports/fees?view=dues">Export</Link></>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{buckets.map((b) => <Stat key={b} label={`${b} days overdue`} value={inrShort(totals[b])} href={`/fees/dues?bucket=${b}`} tone={b === '90+' && totals[b] > 0 ? 'bad' : undefined} />)}</div>
      <form className="no-print mb-3 flex gap-2"><select name="section" defaultValue={sp.section ?? ''} className="input !w-auto" aria-label="Section"><option value="">All sections</option>{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select name="bucket" defaultValue={sp.bucket ?? ''} className="input !w-auto" aria-label="Ageing"><option value="">All ageing</option>{buckets.map((b) => <option key={b}>{b}</option>)}</select><button className="btn-ghost">Filter</button></form>
      <Card>{rows.length === 0 ? <Empty title="No overdue fees" hint="Instalments past their due date appear here automatically. No report building is needed." /> : (
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Student</th><th>Class</th><th>Phone</th><th className="text-right">Overdue</th><th>Oldest due</th><th>Ageing</th><th>Last follow-up</th><th></th></tr></thead>
          <tbody>{rows.slice(0, 300).map((r) => { const f = last.get(r.id); return (
            <tr key={r.id}><td><Link className="link font-medium" href={`/students/${r.id}?tab=fees`}>{fullName(r.s)}</Link>{r.s?.status !== 'active' && <> <Badge>{r.s?.status}</Badge></>}</td><td>{r.s?.section?.name}</td><td>{r.s?.household?.phone ? <a className="link" href={`tel:${r.s.household.phone}`}>{r.s.household.phone}</a> : ''}</td>
              <td className="text-right font-medium tabular-nums">{inr(r.total)}</td><td>{fdate(r.oldest)}</td><td><Badge tone={r.bucket === '90+' ? 'red' : r.bucket === '0-30' ? 'grey' : 'amber'}>{r.bucket}</Badge></td>
              <td className="text-xs text-muted">{f ? <>{f.type}{f.promise_date ? `: promised ${f.promise_amount ? inr(f.promise_amount) : ''} by ${fdate(f.promise_date)}` : f.note ? `: ${f.note}` : ''}</> : 'None'}</td>
              <td className="whitespace-nowrap text-right">{can && <><form action={logFollowup} className="inline"><input type="hidden" name="student_id" value={r.id} /><input type="hidden" name="type" value="message" /><input type="hidden" name="amount" value={r.total} /><button className="btn-ghost btn-sm">Remind</button></form> <Link className="btn-ghost btn-sm" href={`/fees/dues?open=${r.id}${sp.bucket ? `&bucket=${sp.bucket}` : ''}`}>Log</Link> <Link className="btn btn-sm" href={`/fees/counter?student=${r.id}`}>Collect</Link></>}</td></tr>); })}</tbody></table></div>)}
      </Card>
      {sp.open && can && (
        <Card title={`Log a follow-up · ${fullName(by.get(sp.open)?.s ?? null)}`} className="mt-4"><form action={logFollowup} className="grid gap-3 p-4 sm:grid-cols-5">
          <input type="hidden" name="student_id" value={sp.open} />
          <select name="type" className="input" aria-label="Type"><option value="call">Call</option><option value="promise">Promise to pay</option><option value="visit">Visit</option><option value="note">Note</option></select>
          <input name="note" className="input sm:col-span-2" placeholder="What was said" aria-label="Note" />
          <input name="promise_date" type="date" className="input" aria-label="Promise date" /><input name="promise_amount" type="number" className="input" placeholder="Promised amount" aria-label="Promised amount" />
          <button className="btn sm:col-span-5 sm:w-40">Save</button></form></Card>)}
    </Page>
  );
}
