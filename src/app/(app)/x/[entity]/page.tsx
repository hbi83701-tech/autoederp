import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { entity, selectWithRefs, show } from '@/lib/crud';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { MODULE_TITLES } from '@/lib/nav';

const PAGE = 50;
export default async function List({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ entity: key }, sp] = await Promise.all([params, searchParams]);
  const ent = entity(key);
  if (!ent) notFound();
  const ctx = await getCtx();
  if (!ctx.can(ent.cap)) notFound();
  const cols = ent.list.map((k) => ent.fields.find((f) => f.k === k)).filter((f) => !!f);
  const filters = ent.fields.filter((f) => f.t === 'select').slice(0, 3);
  const page = Math.max(1, Number(sp.page ?? 1));
  let q = ctx.sb.from(ent.table).select(selectWithRefs(ent, cols), { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (ent.branch && ctx.branchId) q = q.or(`branch_id.eq.${ctx.branchId},branch_id.is.null`);
  if (ent.year && ctx.year && sp.all_years !== '1') q = q.or(`year_id.eq.${ctx.year.id},year_id.is.null`);
  for (const f of filters) if (sp[f.k]) q = q.eq(f.k, sp[f.k]!);
  const term = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
  const textCols = ent.fields.filter((f) => f.t === 'text' && (ent.label.includes(f.k) || ent.list.includes(f.k))).map((f) => f.k);
  if (term && textCols.length) q = q.or(textCols.map((c) => `${c}.ilike.%${term}%`).join(','));
  const { data, count, error } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const canWrite = ctx.can(ent.cap, 'write') && !ent.readonly;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), ...extra }).toString();
  return (
    <Page title={ent.title} sub={ent.desc || <Link className="link" href={`/m/${ent.module}`}>{MODULE_TITLES[ent.module] ?? ent.module}</Link>}
      actions={<><Link className="btn-ghost" href={`/x/${key}/export?${qs({})}`}>Export CSV</Link>{canWrite && <Link className="btn" href={`/x/${key}/new`}>New</Link>}</>}>
      <form className="no-print mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Search" className="input !w-56" aria-label="Search" />
        {filters.map((f) => (
          <select key={f.k} name={f.k} defaultValue={sp[f.k] ?? ''} className="input !w-auto" aria-label={f.label}>
            <option value="">{f.label}: all</option>{f.opts!.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        ))}
        <button className="btn-ghost">Filter</button>
      </form>
      <Card>
        {error ? <Empty title="This list could not be loaded" hint={error.message} /> : rows.length === 0 ? (
          <Empty title={`No ${ent.title.toLowerCase()} yet`} hint={ent.desc || 'Records you add will appear here, and in search, reports and exports.'} action={canWrite ? <Link className="btn" href={`/x/${key}/new`}>Add the first one</Link> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>{cols.map((f) => <th key={f!.k}>{f!.label}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={String(r.id)} className="hover:bg-paper">
                  {cols.map((f, i) => {
                    const text = show(ent, f!, r);
                    const cell = f!.k === 'status' || f!.t === 'select' && text.length < 16 ? (text ? <Badge>{text}</Badge> : '') : text.length > 80 ? text.slice(0, 80) + '…' : text;
                    return <td key={f!.k}>{i === 0 ? <Link className="link font-medium" href={`/x/${key}/${r.id}`}>{cell || '(open)'}</Link> : cell}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="no-print mt-3 flex items-center justify-between text-sm text-muted">
        <span>{count ?? 0} records</span>
        <span className="flex gap-2">
          {page > 1 && <Link className="btn-ghost btn-sm" href={`?${qs({ page: String(page - 1) })}`}>Previous</Link>}
          {(count ?? 0) > page * PAGE && <Link className="btn-ghost btn-sm" href={`?${qs({ page: String(page + 1) })}`}>Next</Link>}
        </span>
      </div>
    </Page>
  );
}
