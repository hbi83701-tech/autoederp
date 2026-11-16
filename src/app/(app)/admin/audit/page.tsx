import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { ftime } from '@/lib/fmt';

export const metadata = { title: 'Audit log' };
const diff = (b: Record<string, unknown> | null, a: Record<string, unknown> | null) => !b || !a ? [] : Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && !['created_at'].includes(k)).map((k) => `${k}: ${JSON.stringify(b[k]) ?? '∅'} → ${JSON.stringify(a[k])}`);
export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string; action?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('audit');
  const page = Math.max(1, Number(sp.page ?? 1));
  let q = ctx.sb.from('audit_events').select('*').order('at', { ascending: false }).range((page - 1) * 60, page * 60 - 1);
  if (sp.entity) q = q.eq('entity', sp.entity); if (sp.action) q = q.eq('action', sp.action); if (sp.q) q = q.ilike('actor_name', `%${sp.q.replace(/[%,()]/g, ' ')}%`);
  const { data } = await q;
  return (
    <Page title="Audit log" sub="Append-only record of who created, changed, deleted or viewed what. It cannot be edited by anyone, including administrators.">
      <form className="no-print mb-3 flex flex-wrap gap-2"><input name="entity" defaultValue={sp.entity ?? ''} placeholder="Record type, e.g. receipts" className="input !w-52" aria-label="Record type" /><select name="action" defaultValue={sp.action ?? ''} className="input !w-auto" aria-label="Action"><option value="">Any action</option>{['created', 'updated', 'deleted', 'viewed'].map((a) => <option key={a}>{a}</option>)}</select><input name="q" defaultValue={sp.q ?? ''} placeholder="Person" className="input !w-44" aria-label="Person" /><button className="btn-ghost">Search</button></form>
      <Card>{(data ?? []).length === 0 ? <Empty title="No events match" /> : <table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What changed</th></tr></thead><tbody>{data!.map((e) => { const d = diff(e.before, e.after); return <tr key={e.id}><td className="whitespace-nowrap">{ftime(e.at)}</td><td>{e.actor_name ?? 'system'}</td><td><Badge tone={e.action === 'deleted' ? 'red' : e.action === 'viewed' ? 'grey' : e.action === 'created' ? 'green' : 'blue'}>{e.action}</Badge></td><td>{e.entity.replace(/_/g, ' ')}</td><td className="max-w-xl break-words text-xs text-muted">{e.note ?? (d.length ? d.slice(0, 4).join(' · ') : e.action === 'created' ? 'New record' : '')}</td></tr>; })}</tbody></table>}</Card>
      <div className="no-print mt-3 flex justify-end gap-2 text-sm">{page > 1 && <a className="btn-ghost btn-sm" href={`?${new URLSearchParams({ ...sp as Record<string, string>, page: String(page - 1) })}`}>Newer</a>}{(data ?? []).length === 60 && <a className="btn-ghost btn-sm" href={`?${new URLSearchParams({ ...sp as Record<string, string>, page: String(page + 1) })}`}>Older</a>}</div>
    </Page>
  );
}
