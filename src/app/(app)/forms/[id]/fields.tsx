'use client';
import { useState } from 'react';

export type FField = { key: string; label: string; type: string; options: string[]; show_if: string | null };
/** Renders a built form with conditional logic: a question with show-if "f1=Yes" appears only when f1 is Yes. */
export function FormFields({ fields }: { fields: FField[] }) {
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string, x: string) => setV((a) => ({ ...a, [k]: x }));
  const visible = (f: FField) => { if (!f.show_if) return true; const [k, want] = f.show_if.split('='); return (v[k.trim()] ?? '') === (want ?? '').trim(); };
  return <>{fields.filter(visible).map((f) => (
    <label key={f.key} className="block"><span className="label">{f.label}</span>
      {f.type === 'textarea' ? <textarea name={f.key} rows={3} className="input" onChange={(e) => set(f.key, e.target.value)} />
        : f.type === 'select' || f.type === 'yesno' || f.type === 'rating' ? <select name={f.key} className="input" defaultValue="" onChange={(e) => set(f.key, e.target.value)}><option value="">Choose</option>{(f.type === 'yesno' ? ['Yes', 'No'] : f.type === 'rating' ? ['5', '4', '3', '2', '1'] : f.options).map((o) => <option key={o}>{o}</option>)}</select>
        : <input name={f.key} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'file' ? 'url' : 'text'} placeholder={f.type === 'file' ? 'Paste a link to the file' : undefined} className="input" onChange={(e) => set(f.key, e.target.value)} />}</label>))}</>;
}
