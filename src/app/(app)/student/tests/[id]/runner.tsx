'use client';
import { useEffect, useRef, useState } from 'react';
import { submitTest } from './actions';

type Q = { id: string; question: string; type: string; options: string[] | null; marks: number };
/** Online test with a time limit and basic proctoring: tab switches are counted and logged (EXM-05). */
export function TestRunner({ testId, studentId, minutes, questions }: { testId: string; studentId: string; minutes: number; questions: Q[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [left, setLeft] = useState(minutes * 60);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const switches = useRef(0);
  const sent = useRef(false);
  const finish = async () => {
    if (sent.current) return; sent.current = true; setBusy(true);
    const r = await submitTest(testId, studentId, answers, switches.current);
    setResult(r.ok ? `Submitted. You scored ${r.score} out of ${r.max}.` : r.message ?? 'Could not submit.');
    if (!r.ok) sent.current = false;
    setBusy(false);
  };
  useEffect(() => { const t = setInterval(() => setLeft((x) => x - 1), 1000); const vis = () => { if (document.hidden) switches.current++; }; document.addEventListener('visibilitychange', vis); return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); }; }, []);
  useEffect(() => { if (left <= 0) void finish(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  if (result) return <div className="card p-6 text-center text-lg font-medium" role="status">{result}</div>;
  const mm = String(Math.max(0, Math.floor(left / 60))).padStart(2, '0'), ss = String(Math.max(0, left % 60)).padStart(2, '0');
  return (
    <div className="space-y-3">
      <div className="sticky top-12 z-10 flex items-center justify-between rounded-xl border border-line bg-white px-4 py-2 text-sm"><span>{Object.keys(answers).length} of {questions.length} answered</span><span className={`tabular-nums font-semibold ${left < 60 ? 'text-red-600' : ''}`}>{mm}:{ss}</span><button className="btn" disabled={busy} onClick={() => { if (confirm('Submit your test? You cannot change answers afterwards.')) void finish(); }}>{busy ? 'Submitting…' : 'Submit'}</button></div>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="card p-4"><legend className="sr-only">Question {i + 1}</legend><div className="mb-2 text-sm font-medium">{i + 1}. {q.question} <span className="font-normal text-muted">({q.marks} mark{q.marks === 1 ? '' : 's'})</span></div>
          {q.type === 'mcq' || q.type === 'true_false' ? <div className="space-y-1">{(q.type === 'true_false' ? ['True', 'False'] : q.options ?? []).map((o) => <label key={o} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper"><input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o }))} className="h-4 w-4" />{o}</label>)}</div>
            : <textarea className="input" rows={q.type === 'long' ? 4 : 1} aria-label={`Answer ${i + 1}`} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />}</fieldset>))}
    </div>
  );
}
