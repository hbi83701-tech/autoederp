import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx';
import { REPORTS } from '@/lib/reports';
import { csv, today } from '@/lib/fmt';

export async function GET(request: NextRequest, { params }: { params: Promise<{ family: string }> }) {
  const { family } = await params;
  const rep = REPORTS[family];
  const ctx = await getCtx();
  if (!rep || !ctx.can('reports') || (rep.cap && !ctx.can(rep.cap))) return new NextResponse('Not allowed', { status: 403 });
  const sp = request.nextUrl.searchParams;
  const rows = await rep.run(ctx, { from: sp.get('from') ?? ctx.year?.start_date ?? today(), to: sp.get('to') ?? today(), section: sp.get('section') || undefined, group: sp.get('group') ?? rep.groups?.[0]?.[0] });
  await ctx.sb.from('export_log').insert({ report: rep.title, row_count: rows.length, actor_name: ctx.name });
  return new NextResponse(`${rep.title} · exported by ${ctx.name} on ${new Date().toISOString()}\n` + csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${family}.csv"` } });
}
