import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { ftime, go, str } from '@/lib/fmt';
import { entity } from '@/lib/crud';
import { ENTITIES } from '@/lib/entities.gen';

export const metadata = { title: 'Import and export' };
const IMPORTABLE = ['students', 'staff', 'households', 'guardians', 'books', 'items', 'vendors', 'vehicles', 'enquiries', 'questions', 'calendar_events', 'fee_heads', 'subjects'];
function parseCsv(text: string) { const rows: string[][] = []; let cur: string[] = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',') { cur.push(cell); cell = ''; } else if (c === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; } else if (c !== '\r') cell += c; } if (cell || cur.length) { cur.push(cell); rows.push(cur); } return rows.filter((r) => r.some((x) => x.trim())); }

/** Import with validation, a dry run, a per-row error report and one-click undo (migration toolkit, PLT-03). */
async function importCsv(fd: FormData) {
  'use server';
  const ctx = await requireCap('admin', 'write');
  const key = str(fd, 'entity')!; const ent = entity(key);
  if (!ent || !IMPORTABLE.includes(key)) go('/admin/import', 'Choose what to import.', 'err');
  const rows = parseCsv(str(fd, 'csv') ?? '');
  if (rows.length < 2) go('/admin/import', 'Paste a header row and at least one data row.', 'err');
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const fields = ent!.fields.filter((f) => f.t !== 'ref' && f.t !== 'json' && f.t !== 'uuid');
  const unknown = head.filter((h) => !fields.some((f) => f.k === h) && h !== 'section');
  if (unknown.length) go('/admin/import', `Unknown columns: ${unknown.join(', ')}. Use the template columns.`, 'err');
  const { data: secs } = key === 'students' ? await ctx.sb.from('sections').select('id, name, programme_id, branch_id').eq('year_id', ctx.year?.id ?? '') : { data: [] };
  const good: Record<string, unknown>[] = [], errors: { row: number; error: string }[] = [];
  rows.slice(1).forEach((r, i) => {
    const o: Record<string, unknown> = {}; let err = '';
    head.forEach((h, j) => { const v = (r[j] ?? '').trim(); const f = fields.find((x) => x.k === h); if (!f) { if (h === 'section' && v) { const s = (secs ?? []).find((x) => x.name.toLowerCase() === v.toLowerCase()); if (s) { o.section_id = s.id; o.programme_id = s.programme_id; o.branch_id = s.branch_id; } else err = `Section "${v}" not found`; } return; }
      if (v === '') return; if (f.t === 'number') { if (isNaN(Number(v))) err = `${f.label} is not a number`; else o[h] = Number(v); } else if (f.t === 'bool') o[h] = ['yes', 'true', '1', 'y'].includes(v.toLowerCase()); else if (f.t === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) err = `${f.label} must be YYYY-MM-DD`; else o[h] = v; } else if (f.t === 'select' && !f.opts!.includes(v)) err = `${f.label} must be one of ${f.opts!.join(', ')}`; else o[h] = v; });
    for (const f of fields.filter((x) => x.req)) if (o[f.k] === undefined && !err) err = `${f.label} is required`;
    if (err) errors.push({ row: i + 2, error: err }); else { if (ent!.branch && !o.branch_id) o.branch_id = ctx.branchId ?? ctx.branches[0]?.id; if (ent!.year) o.year_id = ctx.year?.id; good.push(o); }
  });
  if (fd.get('dry') === 'on') go('/admin/import', `Dry run: ${good.length} rows are ready, ${errors.length} have errors${errors.length ? ` (first: row ${errors[0].row}, ${errors[0].error})` : ''}. Nothing was saved.`, errors.length ? 'err' : 'ok');
  const ids: string[] = [];
  for (let i = 0; i < good.length; i += 300) { const { data, error } = await ctx.sb.from(ent!.table).insert(good.slice(i, i + 300)).select('id'); if (error) { errors.push({ row: i + 2, error: error.message }); continue; } ids.push(...(data ?? []).map((d) => d.id)); }
  await ctx.sb.from('import_jobs').insert({ entity: key, filename: str(fd, 'filename') ?? 'pasted', total: rows.length - 1, ok: ids.length, failed: rows.length - 1 - ids.length, errors, row_ids: ids });
  go('/admin/import', `${ids.length} ${ent!.title.toLowerCase()} imported, ${rows.length - 1 - ids.length} skipped. See the job below for the error report.`, ids.length ? 'ok' : 'err');
}
async function undo(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); const { data: j } = await ctx.sb.from('import_jobs').select('*').eq('id', str(fd, 'id')!).single(); const ent = j ? entity(j.entity) : null; if (!j || !ent || j.undone) go('/admin/import', 'Nothing to undo.', 'err'); const { error } = await ctx.sb.from(ent!.table).delete().in('id', (j!.row_ids ?? []) as string[]); if (!error) await ctx.sb.from('import_jobs').update({ undone: true, status: 'undone' }).eq('id', j!.id); go('/admin/import', error ? `Could not undo: ${error.message}` : 'Import undone. The rows were removed.', error ? 'err' : 'ok'); }

export default async function Import({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('admin');
  const { data: jobs } = await ctx.sb.from('import_jobs').select('*').order('created_at', { ascending: false }).limit(20);
  const sel = sp.entity && IMPORTABLE.includes(sp.entity) ? ENTITIES[sp.entity] : null;
  const cols = sel ? [...sel.fields.filter((f) => !['ref', 'json', 'uuid'].includes(f.t)).map((f) => f.k), ...(sel.table === 'students' ? ['section'] : [])] : [];
  return (
    <Page title="Import and export centre" sub="Bring data in from another ERP's Excel exports. Every import has a dry run, an error report and an undo.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Import" className="lg:col-span-2"><form className="flex gap-2 border-b border-line p-4"><select name="entity" defaultValue={sp.entity ?? ''} className="input" aria-label="What to import"><option value="">What are you importing?</option>{IMPORTABLE.map((k) => <option key={k} value={k}>{ENTITIES[k].title}</option>)}</select><button className="btn-ghost">Show template</button></form>
          {!sel ? <Empty title="Choose a record type" hint="Order that works best: staff, then students (with their section), then fee plans and opening dues." /> : <form action={importCsv} className="space-y-3 p-4"><input type="hidden" name="entity" value={sp.entity} />
            <div className="text-sm"><div className="font-medium">Template columns</div><code className="mt-1 block overflow-x-auto whitespace-nowrap rounded bg-paper p-2 text-xs">{cols.join(',')}</code><p className="mt-1 text-xs text-muted">Required: {sel.fields.filter((f) => f.req).map((f) => f.k).join(', ') || 'none'}. Dates as YYYY-MM-DD. For students, "section" is the section name.</p></div>
            <Field label="Paste CSV (header row first)"><textarea name="csv" rows={9} required className="input font-mono text-xs" placeholder={cols.slice(0, 4).join(',')} /></Field>
            <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dry" defaultChecked className="h-4 w-4" /> Dry run (check only, save nothing)</label><button className="btn">Run</button></div></form>}</Card>
        <Card title="Export">{<ul className="divide-y divide-line text-sm">{IMPORTABLE.slice(0, 8).map((k) => <li key={k}><Link className="block px-4 py-2.5 hover:bg-paper" href={`/x/${k}/export`}>{ENTITIES[k].title} (CSV)</Link></li>)}<li><Link className="block px-4 py-2.5 hover:bg-paper" href="/reports">All report families</Link></li></ul>}</Card>
        <Card title="Import jobs" className="lg:col-span-3">{(jobs ?? []).length === 0 ? <Empty title="No imports yet" /> : <table className="tbl"><thead><tr><th>When</th><th>What</th><th>Imported</th><th>Skipped</th><th>Errors</th><th></th></tr></thead><tbody>{jobs!.map((j) => <tr key={j.id}><td>{ftime(j.created_at)}</td><td>{ENTITIES[j.entity]?.title ?? j.entity}</td><td>{j.ok}</td><td>{j.failed}</td><td className="max-w-md text-xs text-muted">{((j.errors ?? []) as { row: number; error: string }[]).slice(0, 3).map((e) => `Row ${e.row}: ${e.error}`).join(' · ')}</td><td>{j.undone ? <Badge tone="grey">undone</Badge> : ctx.can('admin', 'write') && j.ok > 0 && <form action={undo}><input type="hidden" name="id" value={j.id} /><ConfirmSubmit className="btn-ghost btn-sm" message={`Remove the ${j.ok} rows this import created?`}>Undo</ConfirmSubmit></form>}</td></tr>)}</tbody></table>}</Card>
      </div>
    </Page>
  );
}
