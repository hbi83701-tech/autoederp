import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { today, pct, inrShort } from '@/lib/fmt';
import { balance, type Demand } from '@/lib/rules/fees';
import { setFilter } from '@/lib/actions';

export const metadata = { title: 'Group console' };
/** Group console (GRP-01): compare branches on strength, attendance, collections, dues, staff and service without switching context. */
export default async function Group() {
  const ctx = await getCtx();
  if (ctx.profile.branch_id || !ctx.can('reports')) redirect('/');
  const d = today(), sb = ctx.sb;
  const [st, att, dem, staff, tk, subs, secs] = await Promise.all([
    sb.from('students').select('branch_id').eq('status', 'active').limit(50000), sb.from('attendance').select('branch_id, status').eq('date', d).eq('person_type', 'student').eq('session', 'day').limit(50000),
    ctx.can('fees') ? sb.from('fee_demands').select('branch_id, amount, concession, fine, paid, due_date').eq('year_id', ctx.year?.id ?? '').neq('status', 'cancelled').limit(100000) : Promise.resolve({ data: [] }),
    sb.from('staff').select('branch_id').eq('status', 'active'), sb.from('tickets').select('branch_id, status').in('status', ['open', 'in_progress', 'waiting']),
    sb.from('attendance_submissions').select('branch_id').eq('date', d), sb.from('sections').select('branch_id').eq('year_id', ctx.year?.id ?? ''),
  ]);
  const n = (rows: { branch_id: string | null }[] | null, b: string) => (rows ?? []).filter((r) => r.branch_id === b).length;
  const rows = ctx.branches.map((b) => { const a = (att.data ?? []).filter((x) => x.branch_id === b.id); const D = ((dem.data ?? []) as (Demand & { branch_id: string })[]).filter((x) => x.branch_id === b.id); const dueTo = D.filter((x) => x.due_date <= d).reduce((t, x) => t + Number(x.amount) - Number(x.concession) + Number(x.fine), 0);
    return { b, strength: n(st.data, b.id), att: a.length ? pct(a.filter((x) => !['A', 'LV'].includes(x.status)).length, a.length) : null, marked: `${n(subs.data, b.id)} / ${n(secs.data, b.id)}`, collected: D.reduce((t, x) => t + Number(x.paid), 0), eff: dueTo ? pct(D.filter((x) => x.due_date <= d).reduce((t, x) => t + Number(x.paid), 0), dueTo) : null, overdue: D.filter((x) => x.due_date < d).reduce((t, x) => t + balance(x), 0), staff: n(staff.data, b.id), tickets: n(tk.data, b.id) }; });
  const sum = (k: 'strength' | 'collected' | 'overdue' | 'staff' | 'tickets') => rows.reduce((t, r) => t + r[k], 0);
  return (
    <Page title="Group console" sub={`${ctx.branches.length} branch${ctx.branches.length === 1 ? '' : 'es'} · ${ctx.year?.name ?? ''}`} actions={<><Link className="btn-ghost" href="/x/branches">Branches</Link><Link className="btn-ghost" href="/x/quality_audits">Quality audits</Link><Link className="btn-ghost" href="/x/franchise_royalties">Franchise royalties</Link></>}>
      <Card>{rows.length === 0 ? <Empty title="No branches" /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Branch</th><th>Board</th><th className="text-right">Strength</th><th className="text-right">Attendance today</th><th className="text-right">Sections marked</th><th className="text-right">Collected</th><th className="text-right">Collection efficiency</th><th className="text-right">Overdue</th><th className="text-right">Staff</th><th className="text-right">Open requests</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.b.id}><td className="font-medium">{r.b.name}</td><td>{r.b.board}</td><td className="text-right tabular-nums">{r.strength}</td><td className="text-right tabular-nums">{r.att === null ? '—' : `${r.att}%`}</td><td className="text-right tabular-nums">{r.marked}</td><td className="text-right tabular-nums">{inrShort(r.collected)}</td><td className="text-right tabular-nums">{r.eff === null ? '—' : `${r.eff}%`}</td><td className="text-right tabular-nums">{inrShort(r.overdue)}</td><td className="text-right tabular-nums">{r.staff}</td><td className="text-right tabular-nums">{r.tickets}</td>
          <td><form action={setFilter}><input type="hidden" name="branch" value={r.b.id} /><button className="link text-sm">Drill down</button></form></td></tr>)}
          {rows.length > 1 && <tr className="font-semibold"><td colSpan={2}>Group</td><td className="text-right tabular-nums">{sum('strength')}</td><td /><td /><td className="text-right tabular-nums">{inrShort(sum('collected'))}</td><td /><td className="text-right tabular-nums">{inrShort(sum('overdue'))}</td><td className="text-right tabular-nums">{sum('staff')}</td><td className="text-right tabular-nums">{sum('tickets')}</td><td /></tr>}</tbody></table></div>}</Card>
      <p className="mt-3 text-sm text-muted">Drill down sets the branch filter in the header; choose “All branches” to come back. Group-level masters (fee heads, grading scales, templates, roles) are shared by every branch.</p>
    </Page>
  );
}
