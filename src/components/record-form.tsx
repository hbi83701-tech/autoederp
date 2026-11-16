import type { EntityDef, FieldDef } from '@/lib/entities.gen';

type Opt = { value: string; label: string };
const toLocal = (v: unknown) => (v ? new Date(new Date(String(v)).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16) : '');

export function FieldInput({ f, value, options }: { f: FieldDef; value: unknown; options?: Opt[] }) {
  const v = value ?? f.def ?? '';
  const common = { name: f.k, required: f.req, className: 'input' } as const;
  switch (f.t) {
    case 'bool': return <input type="checkbox" name={f.k} defaultChecked={value === undefined || value === null ? f.def === 'true' : !!value} className="h-4 w-4 accent-[#0f6e6e]" />;
    case 'select': return <select {...common} defaultValue={String(v)}>{!f.req && <option value="">—</option>}{f.opts!.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select>;
    case 'ref': return <select {...common} defaultValue={String(v)}><option value="">—</option>{(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    case 'textarea': return <textarea {...common} rows={3} defaultValue={String(v)} />;
    case 'json': return <textarea {...common} rows={4} className="input font-mono text-xs" defaultValue={v === '' ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 1)} />;
    case 'number': return <input {...common} type="number" step="any" defaultValue={String(v)} />;
    case 'date': return <input {...common} type="date" defaultValue={String(v).slice(0, 10)} />;
    case 'time': return <input {...common} type="time" defaultValue={String(v).slice(0, 5)} />;
    case 'datetime': return <input {...common} type="datetime-local" defaultValue={toLocal(value)} />;
    default: return <input {...common} type="text" defaultValue={String(v)} />;
  }
}

export function RecordFields({ ent, row, options, custom }: { ent: EntityDef; row?: Record<string, unknown> | null; options: Record<string, Opt[]>; custom?: { key: string; label: string; field_type: string; options: string | null; required: boolean; help: string | null }[] }) {
  const c = (row?.custom ?? {}) as Record<string, unknown>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ent.fields.filter((f) => f.t !== 'uuid').map((f) => (
        <label key={f.k} className={`block ${f.t === 'textarea' || f.t === 'json' ? 'sm:col-span-2 lg:col-span-3' : ''} ${f.t === 'bool' ? 'flex items-center gap-2 pt-5' : ''}`}>
          {f.t === 'bool' ? <><FieldInput f={f} value={row?.[f.k]} /><span className="text-sm">{f.label}</span></> : <><span className="label">{f.label}{f.req ? ' *' : ''}</span><FieldInput f={f} value={row?.[f.k]} options={options[f.k]} /></>}
        </label>
      ))}
      {(custom ?? []).map((cf) => (
        <label key={cf.key} className="block">
          <span className="label">{cf.label}{cf.required ? ' *' : ''}</span>
          {cf.field_type === 'select' ? (
            <select name={`custom.${cf.key}`} className="input" defaultValue={String(c[cf.key] ?? '')} required={cf.required}><option value="">—</option>{(cf.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select>
          ) : cf.field_type === 'textarea' ? <textarea name={`custom.${cf.key}`} className="input" rows={2} defaultValue={String(c[cf.key] ?? '')} required={cf.required} />
            : <input name={`custom.${cf.key}`} className="input" type={cf.field_type === 'number' ? 'number' : cf.field_type === 'date' ? 'date' : 'text'} defaultValue={String(c[cf.key] ?? '')} required={cf.required} />}
          {cf.help && <span className="mt-1 block text-xs text-muted">{cf.help}</span>}
        </label>
      ))}
    </div>
  );
}
