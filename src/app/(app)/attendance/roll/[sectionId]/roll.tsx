'use client';
import { useEffect, useState } from 'react';
import { submitRoll, type Mark } from '../../actions';

type Student = { id: string; name: string; roll_no: number | null; status: 'P' | 'A' | 'L' | 'LV'; alert?: string | null };
const KEY = 'autoed.attendance.queue';
type Queued = { sectionId: string; date: string; session: string; marks: Mark[]; at: string };

/** Roll call: everyone starts present, tap the few who are absent or late, submit. Works offline and syncs (ATT-02). */
export function Roll({ sectionId, date, session, students, alreadyMarked }: { sectionId: string; date: string; session: string; students: Student[]; alreadyMarked: boolean }) {
  const [marks, setMarks] = useState<Record<string, Student['status']>>(() => Object.fromEntries(students.map((s) => [s.id, s.status])));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'bad' | 'wait' } | null>(null);
  const [online, setOnline] = useState(true);

  const flush = async () => {
    const q: Queued[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!q.length) return;
    const left: Queued[] = [];
    for (const item of q) {
      try { const r = await submitRoll(item.sectionId, item.date, item.session, item.marks); if (!r.ok) left.push(item); } catch { left.push(item); }
    }
    localStorage.setItem(KEY, JSON.stringify(left));
    if (left.length < q.length) setNote({ text: 'Attendance saved on this phone has been synced.', tone: 'ok' });
  };
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    if (navigator.onLine) void flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cycle = (id: string) => setMarks((m) => (m[id] === 'LV' ? m : { ...m, [id]: m[id] === 'P' ? 'A' : m[id] === 'A' ? 'L' : 'P' }));
  const payload = (): Mark[] => students.filter((s) => marks[s.id] !== 'LV').map((s) => ({ student_id: s.id, status: marks[s.id] as Mark['status'] }));
  const queue = () => {
    const q: Queued[] = JSON.parse(localStorage.getItem(KEY) ?? '[]').filter((x: Queued) => !(x.sectionId === sectionId && x.date === date && x.session === session));
    q.push({ sectionId, date, session, marks: payload(), at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(q));
    setNote({ text: 'No network. Saved on this phone; it will sync as soon as you are back online.', tone: 'wait' });
  };
  const submit = async () => {
    setBusy(true);
    if (!navigator.onLine) { queue(); setBusy(false); return; }
    try { const r = await submitRoll(sectionId, date, session, payload()); setNote({ text: r.message, tone: r.ok ? 'ok' : 'bad' }); }
    catch { queue(); }
    setBusy(false);
  };
  const n = (s: string) => Object.values(marks).filter((v) => v === s).length;
  const tone: Record<string, string> = { P: 'bg-emerald-50 border-emerald-200 text-emerald-800', A: 'bg-red-50 border-red-300 text-red-800', L: 'bg-amber-50 border-amber-300 text-amber-900', LV: 'bg-sky-50 border-sky-200 text-sky-800' };
  const word: Record<string, string> = { P: 'Present', A: 'Absent', L: 'Late', LV: 'On leave' };
  return (
    <div>
      <div className="sticky top-12 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm">
        <span><b>{n('P')}</b> present · <b className="text-red-700">{n('A')}</b> absent · <b className="text-amber-700">{n('L')}</b> late{n('LV') ? <> · {n('LV')} on leave</> : null}{!online && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">offline</span>}</span>
        <button className="btn" onClick={submit} disabled={busy || students.length === 0}>{busy ? 'Saving…' : alreadyMarked ? 'Update attendance' : 'Submit attendance'}</button>
      </div>
      {note && <div role="status" className={`mb-3 rounded-lg px-4 py-2 text-sm ${note.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : note.tone === 'bad' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{note.text}</div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {students.map((s) => (
          <button key={s.id} type="button" onClick={() => cycle(s.id)} aria-label={`${s.name}: ${word[marks[s.id]]}. Tap to change.`}
            className={`flex min-h-[52px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${tone[marks[s.id]]}`}>
            <span><span className="font-medium">{s.roll_no ? `${s.roll_no}. ` : ''}{s.name}</span>{s.alert && <span className="block text-xs opacity-80">{s.alert}</span>}</span>
            <span className="text-xs font-semibold">{word[marks[s.id]]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
