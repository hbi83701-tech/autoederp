'use client';
import { useState } from 'react';
import { saveMarks } from '../actions';

type Row = { student_id: string; name: string; roll_no: number | null; value: string };
/** Spreadsheet-style marks grid (GB-03): keyboard entry, arrow keys, paste a column from Excel, AB / EX / ML codes. */
export function MarksGrid({ assessmentId, max, rows, locked }: { assessmentId: string; max: number; rows: Row[]; locked: boolean }) {
  const [vals, setVals] = useState<string[]>(rows.map((r) => r.value));
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = (i: number, v: string) => { setVals((a) => a.map((x, j) => (j === i ? v : x))); setDirty(true); };
  const bad = (v: string) => { const t = v.trim().toUpperCase(); return t !== '' && !['AB', 'EX', 'ML'].includes(t) && (isNaN(Number(t)) || Number(t) < 0 || Number(t) > max); };
  const paste = (i: number, e: React.ClipboardEvent) => {
    const lines = e.clipboardData.getData('text').split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter((l, k, a) => !(k === a.length - 1 && l === ''));
    if (lines.length < 2) return;
    e.preventDefault();
    setVals((a) => a.map((x, j) => (j >= i && j < i + lines.length ? lines[j - i] : x)));
    setDirty(true);
  };
  const key = (i: number, e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    document.querySelector<HTMLInputElement>(`input[data-row="${e.key === 'ArrowUp' ? i - 1 : i + 1}"]`)?.focus();
  };
  const save = async () => {
    setBusy(true);
    const r = await saveMarks(assessmentId, rows.map((row, i) => ({ student_id: row.student_id, value: vals[i] })));
    setNote({ text: r.message, ok: r.ok }); if (r.ok) setDirty(false);
    setBusy(false);
  };
  const filled = vals.filter((v) => v.trim() !== '').length;
  const nums = vals.map((v) => Number(v)).filter((n, i) => vals[i].trim() !== '' && !isNaN(n));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{filled} of {rows.length} entered{nums.length ? ` · average ${(nums.reduce((t, n) => t + n, 0) / nums.length).toFixed(1)} / ${max}` : ''}{dirty && <span className="ml-2 text-amber-700">unsaved changes</span>}</span>
        {!locked && <button className="btn" onClick={save} disabled={busy || vals.some(bad)}>{busy ? 'Saving…' : 'Save marks'}</button>}
      </div>
      {note && <div role="status" className={`mb-3 rounded-lg px-4 py-2 text-sm ${note.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{note.text}</div>}
      <div className="card overflow-hidden"><table className="tbl"><thead><tr><th className="w-14">Roll</th><th>Student</th><th className="w-40">Marks (out of {max})</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.student_id}><td>{r.roll_no}</td><td>{r.name}</td>
            <td><input data-row={i} value={vals[i]} disabled={locked} onChange={(e) => set(i, e.target.value)} onPaste={(e) => paste(i, e)} onKeyDown={(e) => key(i, e)} inputMode="decimal"
              aria-label={`Marks for ${r.name}`} aria-invalid={bad(vals[i])} className={`input !py-1 text-right tabular-nums ${bad(vals[i]) ? '!border-red-500 !ring-red-200' : ''}`} /></td></tr>))}</tbody></table></div>
      <p className="mt-2 text-xs text-muted">Tip: copy a column of marks in Excel and paste into the first cell. Use AB for absent, EX for exempt, ML for medical leave.</p>
    </div>
  );
}
