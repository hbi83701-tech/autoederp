import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx';
import { entity, selectWithRefs, show } from '@/lib/crud';
import { csv } from '@/lib/fmt';

/** CSV export with permission control and an export log (PRV-04). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity: key } = await params;
  const ent = entity(key);
  const ctx = await getCtx();
  if (!ent || !ctx.can(ent.cap) || !ctx.can('reports')) return new NextResponse('Not allowed', { status: 403 });
  let q = ctx.sb.from(ent.table).select(selectWithRefs(ent)).order('created_at', { ascending: false }).limit(5000);
  if (ent.branch && ctx.branchId) q = q.or(`branch_id.eq.${ctx.branchId},branch_id.is.null`);
  if (ent.year && ctx.year) q = q.or(`year_id.eq.${ctx.year.id},year_id.is.null`);
  const { data } = await q;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => Object.fromEntries(ent.fields.filter((f) => f.t !== 'uuid').map((f) => [f.label, show(ent, f, r)])));
  await ctx.sb.from('export_log').insert({ report: ent.title, row_count: rows.length, actor_name: ctx.name });
  return new NextResponse(`Exported by ${ctx.name} on ${new Date().toISOString()}\n` + csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${key}.csv"` } });
}
