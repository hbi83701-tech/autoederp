import { ENTITIES, type EntityDef, type FieldDef } from './entities.gen';
import type { Ctx } from './ctx';

export function entity(key: string): EntityDef | null {
  return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : null;
}
/** PostgREST select string that embeds the label of every referenced record. */
export function selectWithRefs(ent: EntityDef, fields: FieldDef[] = ent.fields) {
  const refs = fields.filter((f) => f.t === 'ref' && ENTITIES[f.ref!]).map((f) => `${f.k}__ref:${f.ref}!${ent.table}_${f.k}_fkey(${ENTITIES[f.ref!].label.join(',')})`);
  return ['*', ...refs].join(',');
}
export function labelOf(ent: EntityDef, row: Record<string, unknown> | null | undefined) {
  return row ? ent.label.map((l) => row[l] ?? '').join(' ').trim() : '';
}
export function show(ent: EntityDef, f: FieldDef, row: Record<string, unknown>): string {
  const v = row[f.k];
  if (f.t === 'ref') { const r = row[`${f.k}__ref`] as Record<string, unknown> | null; return r ? labelOf(ENTITIES[f.ref!], r) : ''; }
  if (v === null || v === undefined) return '';
  if (f.t === 'bool') return v ? 'Yes' : 'No';
  if (f.t === 'json') return JSON.stringify(v);
  if (f.t === 'date') return new Date(String(v)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (f.t === 'datetime') return new Date(String(v)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return String(v);
}
/** Options for every reference field on a form, loaded under the caller's permissions. */
export async function refOptions(ctx: Ctx, ent: EntityDef) {
  const out: Record<string, { value: string; label: string }[]> = {};
  await Promise.all(ent.fields.filter((f) => f.t === 'ref' && ENTITIES[f.ref!]).map(async (f) => {
    const r = ENTITIES[f.ref!];
    let q = ctx.sb.from(r.table).select(['id', ...r.label].join(',')).order(r.label[0]).limit(1000);
    if (r.table === 'students') q = q.in('status', ['active', 'admitted']);
    const { data } = await q;
    out[f.k] = ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({ value: String(d.id), label: labelOf(r, d) }));
  }));
  return out;
}
/** Turn a submitted form into a row, coercing by field type. */
export function rowFromForm(ent: EntityDef, fd: FormData, custom: { key: string }[] = []) {
  const row: Record<string, unknown> = {};
  for (const f of ent.fields) {
    if (f.t === 'bool') { row[f.k] = fd.get(f.k) === 'on'; continue; }
    if (!fd.has(f.k)) continue;
    const raw = String(fd.get(f.k) ?? '').trim();
    if (raw === '') { row[f.k] = null; continue; }
    if (f.t === 'number') row[f.k] = Number(raw);
    else if (f.t === 'json') { try { row[f.k] = JSON.parse(raw); } catch { throw new Error(`${f.label} is not valid JSON.`); } }
    else row[f.k] = raw;
  }
  if (ent.custom && custom.length) {
    const c: Record<string, unknown> = {};
    for (const cf of custom) { const v = fd.get(`custom.${cf.key}`); if (typeof v === 'string' && v !== '') c[cf.key] = v; }
    row.custom = c;
  }
  return row;
}
