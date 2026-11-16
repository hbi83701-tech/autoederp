import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { PrintButton } from '@/components/client';
import { REPORTS } from '@/lib/reports';
import { today, go, str } from '@/lib/fmt';

async function saveView(fd: FormData) { 'use server'; const ctx = await requireCap('reports'); const family = str(fd, 'family')!; const filters = Object.fromEntries(['from', 'to', 'section', 'group'].map((k) => [k, str(fd, k) ?? '']).filter(([, v]) => v)); const { error } = await ctx.sb.from('saved_reports').insert({ name: str(fd, 'name'), family, filters, schedule: str(fd, 'schedule') ?? 'none' }); go(`/reports/${family}?${new URLSearchParams(filters)}`, error ? error.message : 'View saved. It is listed on the Reports page.', error ? 'err' : 'ok'); }

export default async function ReportPage({ params, searchParams }: { params: Promise<{ family: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ family }, sp] = await Promise.all([params, searchParams]);
  const rep = REPORTS[family];
  if (!rep) notFound();
  const ctx = await requireCap('reports');
  if (rep.cap && !ctx.can(rep.cap)) notFound();
  const f = { from: sp.from ?? ctx.year?.start_date ?? today(), to: sp.to ?? today(), section: sp.section || undefined, group: sp.group ?? rep.groups?.[0]?.[0] };
  const [rows, { data: sections }] = await Promise.all([rep.run(ctx, f), ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name')]);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const numeric = (c: string) => rows.every((r) => typeof r[c] === 'number');
  const total = (c: string) => rows.reduce((t, r) => t + Number(r[c] ?? 0), 0);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <Page title={rep.title} sub={<Link className="link" href="/reports">All report families</Link>} actions={<><Link className="btn-ghost" href={`/reports/${family}/export?${qs}`}>Export CSV</Link><PrintButton /></>}>
      <form className="no-print mb-3 flex flex-wrap items-end gap-2">
        <label><span className="label">From</span><input type="date" name="from" defaultValue={f.from} className="input !w-auto" /></label><label><span className="label">To</span><input type="date" name="to" defaultValue={f.to} className="input !w-auto" /></label>
        <label><span className="label">Section</span><select name="section" defaultValue={f.section ?? ''} className="input !w-auto"><option value="">All</option>{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {rep.groups && <label><span className="label">View</span><select name="group" defaultValue={f.group} className="input !w-auto">{rep.groups.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}<button className="btn">Apply</button>
      </form>
      <Card>{rows.length === 0 ? <Empty title="No data for these filters" hint="Widen the date range or change the view." /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr>{cols.map((c) => <th key={c} className={numeric(c) ? 'text-right' : ''}>{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 1000).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={numeric(c) ? 'text-right tabular-nums' : ''}>{typeof r[c] === 'number' ? (r[c] as number).toLocaleString('en-IN') : String(r[c] ?? '')}</td>)}</tr>)}
          {cols.some(numeric) && rows.length > 1 && <tr>{cols.map((c, i) => <td key={c} className={`font-semibold ${numeric(c) ? 'text-right tabular-nums' : ''}`}>{i === 0 ? 'Total' : numeric(c) && !c.includes('%') ? total(c).toLocaleString('en-IN') : ''}</td>)}</tr>}</tbody></table></div>}</Card>
      <form action={saveView} className="no-print mt-3 flex flex-wrap items-end gap-2 text-sm"><input type="hidden" name="family" value={family} />{Object.entries(f).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}<label><span className="label">Save this view as</span><input name="name" required className="input !w-56" /></label><label><span className="label">Schedule</span><select name="schedule" className="input !w-auto">{['none', 'daily', 'weekly', 'monthly'].map((s) => <option key={s}>{s}</option>)}</select></label><button className="btn-ghost">Save view</button></form>
    </Page>
  );
}
