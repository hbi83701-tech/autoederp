import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { entity, refOptions, labelOf } from '@/lib/crud';
import { Page, Card } from '@/components/ui';
import { RecordFields } from '@/components/record-form';
import { ConfirmSubmit } from '@/components/client';
import { saveRecord, deleteRecord } from '../../actions';
import { ftime } from '@/lib/fmt';

export default async function Record({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ entity: key, id }, sp] = await Promise.all([params, searchParams]);
  const ent = entity(key);
  if (!ent) notFound();
  const ctx = await getCtx();
  if (!ctx.can(ent.cap)) notFound();
  const isNew = id === 'new';
  const canWrite = ctx.can(ent.cap, 'write') && !ent.readonly;
  if (isNew && !canWrite) notFound();
  const [{ data: row }, options, { data: custom }, { data: history }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : ctx.sb.from(ent.table).select('*').eq('id', id).maybeSingle(),
    refOptions(ctx, ent),
    ent.custom ? ctx.sb.from('custom_fields').select('key, label, field_type, options, required, help').eq('entity', ent.table).order('sort') : Promise.resolve({ data: [] }),
    isNew || !ctx.can('audit') ? Promise.resolve({ data: [] }) : ctx.sb.from('audit_events').select('id, action, actor_name, at').eq('entity', ent.table).eq('entity_id', id).order('at', { ascending: false }).limit(8),
  ]);
  if (!isNew && !row) notFound();
  // Prefill from the query string so other screens can deep-link into "new" with context.
  const seed = isNew ? Object.fromEntries(ent.fields.filter((f) => sp[f.k]).map((f) => [f.k, sp[f.k]])) : (row as Record<string, unknown>);
  return (
    <Page title={isNew ? `New: ${ent.title}` : labelOf(ent, row as Record<string, unknown>) || ent.title} sub={<Link className="link" href={`/x/${key}`}>Back to {ent.title.toLowerCase()}</Link>}>
      <Card>
        <form action={saveRecord} className="space-y-5 p-4">
          <input type="hidden" name="_entity" value={key} />
          {!isNew && <input type="hidden" name="_id" value={id} />}
          {sp.back && <input type="hidden" name="_back" value={sp.back} />}
          <fieldset disabled={!canWrite} className="space-y-5">
            <RecordFields ent={ent} row={seed} options={options} custom={custom ?? []} />
          </fieldset>
          {canWrite && <div className="flex gap-2"><button className="btn">Save</button><Link className="btn-ghost" href={sp.back ?? `/x/${key}`}>Cancel</Link></div>}
        </form>
      </Card>
      {!isNew && canWrite && (
        <form action={deleteRecord} className="mt-4">
          <input type="hidden" name="_entity" value={key} /><input type="hidden" name="_id" value={id} />
          <ConfirmSubmit message="Delete this record? This cannot be undone." className="text-sm text-red-600 underline">Delete this record</ConfirmSubmit>
        </form>
      )}
      {(history ?? []).length > 0 && (
        <Card title="Change history" className="mt-4">
          <ul className="divide-y divide-line text-sm">{history!.map((h) => <li key={h.id} className="flex justify-between px-4 py-2"><span>{h.action} by {h.actor_name ?? 'system'}</span><span className="text-muted">{ftime(h.at)}</span></li>)}</ul>
        </Card>
      )}
    </Page>
  );
}
