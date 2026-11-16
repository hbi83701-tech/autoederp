import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { fdate, go, str, today, pct } from '@/lib/fmt';

export const metadata = { title: 'Admissions' };
const STAGES = ['enquiry', 'visit', 'applied', 'test', 'offered', 'admitted', 'lost'] as const;
async function move(fd: FormData) { 'use server'; const ctx = await requireCap('admissions', 'write'); const { error } = await ctx.sb.from('enquiries').update({ status: str(fd, 'status'), follow_up_date: str(fd, 'follow_up_date') ?? undefined }).eq('id', str(fd, 'id')!); go('/admissions', error ? error.message : 'Updated.', error ? 'err' : 'ok'); }

/** Lighter admissions module for schools without the CRM (ADM-02): enquiry to admitted, then one-click conversion (ADM-03). */
export default async function Admissions({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('admissions');
  let q = ctx.sb.from('enquiries').select('id, child_name, dob, gender, parent_name, phone, email, source, status, follow_up_date, test_score, student_id, programme:programmes!enquiries_programme_id_fkey(name)').order('created_at', { ascending: false }).limit(500);
  if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const { data } = await q;
  const all = (data ?? []) as unknown as { id: string; child_name: string; dob: string | null; gender: string | null; parent_name: string; phone: string; email: string | null; source: string; status: string; follow_up_date: string | null; test_score: number | null; student_id: string | null; programme: { name: string } | null }[];
  const rows = sp.stage ? all.filter((e) => e.status === sp.stage) : all.filter((e) => !['admitted', 'lost'].includes(e.status));
  const d = today(), can = ctx.can('admissions', 'write');
  const n = (s: string) => all.filter((e) => e.status === s).length;
  return (
    <Page title="Admissions" sub="Enquiry, visit, application, entrance test, offer and admission. A confirmed admission becomes a student with nothing re-entered." actions={<>{can && <Link className="btn" href="/x/enquiries/new?back=/admissions">New enquiry</Link>}<Link className="btn-ghost" href="/x/integrations">CRM connectors</Link></>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Open enquiries" value={all.filter((e) => !['admitted', 'lost'].includes(e.status)).length} /><Stat label="Follow-ups due" value={all.filter((e) => e.follow_up_date && e.follow_up_date <= d && !['admitted', 'lost'].includes(e.status)).length} tone="warn" /><Stat label="Admitted" value={n('admitted')} tone="good" /><Stat label="Conversion" value={all.length ? `${pct(n('admitted'), all.length)}%` : '—'} hint="enquiry to admission" /></div>
      <div className="no-print mb-3 flex flex-wrap gap-1"><Link href="/admissions" className={!sp.stage ? 'btn btn-sm' : 'btn-ghost btn-sm'}>Open</Link>{STAGES.map((s) => <Link key={s} href={`/admissions?stage=${s}`} className={sp.stage === s ? 'btn btn-sm' : 'btn-ghost btn-sm'}>{s} ({n(s)})</Link>)}</div>
      <Card>{rows.length === 0 ? <Empty title="No enquiries here" hint="Front-office walk-ins, website forms and imports from another CRM all start as an enquiry." /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Child</th><th>Grade</th><th>Parent</th><th>Source</th><th>Follow up</th><th>Stage</th><th></th></tr></thead><tbody>{rows.map((e) => <tr key={e.id}><td><Link className="link font-medium" href={`/x/enquiries/${e.id}?back=/admissions`}>{e.child_name}</Link></td><td>{e.programme?.name}</td><td>{e.parent_name}<div className="text-xs text-muted">{e.phone}</div></td><td>{e.source}</td><td className={e.follow_up_date && e.follow_up_date <= d ? 'text-red-600' : ''}>{fdate(e.follow_up_date)}</td><td><Badge tone={e.status === 'admitted' ? 'green' : e.status === 'lost' ? 'grey' : 'blue'}>{e.status}</Badge></td>
        <td className="whitespace-nowrap text-right">{can && !['admitted', 'lost'].includes(e.status) && <><form action={move} className="inline-flex gap-1"><input type="hidden" name="id" value={e.id} /><select name="status" defaultValue={STAGES[Math.min(STAGES.indexOf(e.status as typeof STAGES[number]) + 1, 4)]} className="input !w-auto !py-1 text-xs" aria-label="Move to stage">{STAGES.map((s) => <option key={s}>{s}</option>)}</select><button className="btn-ghost btn-sm">Move</button></form> {ctx.can('students', 'write') && <Link className="btn btn-sm" href={`/students/new?enquiry_id=${e.id}&first_name=${encodeURIComponent(e.child_name.split(' ')[0])}&last_name=${encodeURIComponent(e.child_name.split(' ').slice(1).join(' '))}&dob=${e.dob ?? ''}&gender=${e.gender ?? ''}&parent_name=${encodeURIComponent(e.parent_name)}&phone=${encodeURIComponent(e.phone)}&email=${encodeURIComponent(e.email ?? '')}`}>Admit</Link>}</>}{e.student_id && <Link className="link" href={`/students/${e.student_id}`}>Student record</Link>}</td></tr>)}</tbody></table></div>}</Card>
    </Page>
  );
}
