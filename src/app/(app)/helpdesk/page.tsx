import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat, Field } from '@/components/ui';
import { ftime, fullName, pct, go, str } from '@/lib/fmt';

export const metadata = { title: 'Helpdesk' };
async function raise(fd: FormData) { 'use server'; const ctx = await requireCap('helpdesk'); const { error } = await ctx.sb.from('tickets').insert({ type: str(fd, 'type') ?? 'concern', category: str(fd, 'category'), subject: str(fd, 'subject'), body: str(fd, 'body'), priority: str(fd, 'priority') ?? 'normal', branch_id: ctx.branchId }); go('/helpdesk', error ? error.message : 'Request logged and routed to its owner.', error ? 'err' : 'ok'); }

/** Helpdesk (HD-01..04): parent and staff requests with owners, SLA, escalation and ratings. */
export default async function Helpdesk({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('helpdesk');
  let q = ctx.sb.from('tickets').select('id, type, category, subject, priority, status, sla_due, owner_role, raised_by_name, created_at, resolved_at, rating, student:students!tickets_student_id_fkey(first_name, last_name)').order('created_at', { ascending: false }).limit(300);
  if (sp.status) q = q.eq('status', sp.status); else q = q.in('status', ['open', 'in_progress', 'waiting']);
  if (sp.mine) q = q.eq('owner_role', ctx.role);
  const [{ data }, { data: all }, { data: cats }] = await Promise.all([q, ctx.sb.from('tickets').select('status, sla_due, resolved_at, rating, category').limit(5000), ctx.sb.from('masters').select('name').eq('type', 'concern_category').order('sort')]);
  const T = (data ?? []) as unknown as { id: string; type: string; category: string; subject: string; priority: string; status: string; sla_due: string | null; owner_role: string; raised_by_name: string; created_at: string; student: { first_name: string; last_name: string } | null }[];
  const A = all ?? [];
  const closed = A.filter((t) => t.resolved_at);
  const inSla = closed.filter((t) => !t.sla_due || t.resolved_at! <= t.sla_due).length;
  const rated = A.filter((t) => t.rating);
  const now = new Date();
  return (
    <Page title="Helpdesk" sub="Requests are routed to an owner by category, with a service-level timer the parent can see.">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Open" value={A.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length} /><Stat label="Past SLA" value={A.filter((t) => !t.resolved_at && t.sla_due && new Date(t.sla_due) < now).length} tone="bad" /><Stat label="Resolved within SLA" value={closed.length ? `${pct(inSla, closed.length)}%` : '—'} hint="target above 85%" /><Stat label="Satisfaction" value={rated.length ? (rated.reduce((t, r) => t + (r.rating ?? 0), 0) / rated.length).toFixed(1) + ' / 5' : '—'} hint={`${rated.length} ratings`} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Requests" actions={<form className="flex gap-1"><select name="status" defaultValue={sp.status ?? ''} className="input !w-auto !py-1 text-xs" aria-label="Status"><option value="">Open</option>{['resolved', 'closed'].map((s) => <option key={s}>{s}</option>)}</select><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} />my desk</label><button className="btn-ghost btn-sm">Filter</button></form>}>
          {T.length === 0 ? <Empty title="No requests here" hint="Concerns, corrections, certificate and TC requests, and staff maintenance or IT requests all land here." /> : <table className="tbl"><thead><tr><th>Request</th><th>From</th><th>Owner</th><th>SLA</th><th>Status</th></tr></thead>
            <tbody>{T.map((t) => { const late = t.sla_due && new Date(t.sla_due) < now && !['resolved', 'closed'].includes(t.status); return <tr key={t.id}><td><Link className="link font-medium" href={`/helpdesk/${t.id}`}>{t.subject}</Link><div className="text-xs text-muted">{t.type.replace('_', ' ')}{t.category ? ` · ${t.category}` : ''} · <Badge>{t.priority}</Badge></div></td><td>{t.raised_by_name}<div className="text-xs text-muted">{fullName(t.student)}</div></td><td>{String(t.owner_role).replace('_', ' ')}</td><td className={late ? 'text-red-600' : 'text-muted'}>{ftime(t.sla_due)}{late ? ' · late' : ''}</td><td><Badge>{t.status}</Badge></td></tr>; })}</tbody></table>}</Card>
        <Card title="Log a request"><form action={raise} className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2"><Field label="Type"><select name="type" className="input">{['concern', 'maintenance', 'it', 'hr', 'correction', 'certificate'].map((t) => <option key={t}>{t}</option>)}</select></Field><Field label="Priority"><select name="priority" className="input" defaultValue="normal">{['low', 'normal', 'high', 'critical'].map((p) => <option key={p}>{p}</option>)}</select></Field></div>
          <Field label="Category"><select name="category" className="input"><option value="">—</option>{(cats ?? []).map((c) => <option key={c.name}>{c.name}</option>)}<option>IT</option><option>HR</option></select></Field>
          <Field label="Subject"><input name="subject" className="input" required /></Field><Field label="Details"><textarea name="body" rows={3} className="input" /></Field><button className="btn w-full">Log request</button></form></Card>
      </div>
    </Page>
  );
}
