import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card } from '@/components/ui';
import { REPORTS } from '@/lib/reports';

export const metadata = { title: 'Reports' };
export default async function Reports() {
  const ctx = await requireCap('reports');
  const [{ data: saved }] = await Promise.all([ctx.sb.from('saved_reports').select('id, name, family, filters, schedule').order('created_at', { ascending: false }).limit(20)]);
  return (
    <Page title="Reports" sub="About 250 fixed reports are replaced by these families. Each has filters, grouping, drill-down and export." actions={<><Link className="btn-ghost" href="/diary">Principal&apos;s diary</Link><Link className="btn-ghost" href="/insights">Insights</Link></>}>
      {(saved ?? []).length > 0 && <Card title="Saved views" className="mb-4"><ul className="divide-y divide-line text-sm">{saved!.map((s) => <li key={s.id} className="flex justify-between px-4 py-2"><Link className="link" href={`/reports/${s.family}?${new URLSearchParams(s.filters as Record<string, string>)}`}>{s.name}</Link><span className="text-muted">{s.schedule !== 'none' ? `emailed ${s.schedule}` : ''}</span></li>)}</ul></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(REPORTS).filter(([, r]) => !r.cap || ctx.can(r.cap)).map(([k, r]) => <Link key={k} href={`/reports/${k}`} className="card block p-4 hover:bg-paper"><div className="font-medium">{r.title}</div><p className="mt-1 text-xs text-muted">Replaces: {r.replaces}</p></Link>)}</div>
    </Page>
  );
}
