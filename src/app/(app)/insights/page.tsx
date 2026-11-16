import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { insightCards } from '@/lib/insights';
import { REPORTS } from '@/lib/reports';
import { aiJson, aiEnabled } from '@/lib/ai';
import { str } from '@/lib/fmt';

export const metadata = { title: 'Insights' };
/** Ask-your-data (RPT-07): a plain question is mapped to a report family and view, then answered with that report inside the user's permissions. */
async function ask(fd: FormData) {
  'use server';
  const ctx = await requireCap('reports');
  const q = (str(fd, 'q') ?? '').toLowerCase();
  const allowed = Object.entries(REPORTS).filter(([, r]) => !r.cap || ctx.can(r.cap));
  const catalogue = allowed.map(([k, r]) => `${k}: ${r.title} (views: ${(r.groups ?? []).map((g) => g[0]).join(', ')})`).join('\n');
  const ai = await aiJson<{ family: string; group?: string }>('You route a school administrator\'s question to one report. Reply as {"family": "...", "group": "..."} using only the keys listed.', `Reports:\n${catalogue}\n\nQuestion: ${q}`, 300);
  let family = ai && allowed.some(([k]) => k === ai.family) ? ai.family : null, group = ai?.group;
  if (!family) { // keyword fallback when AI is not configured
    const words: [string, string, string?][] = [['overdue', 'dues', 'bucket'], ['due', 'dues', 'section'], ['defaulter', 'dues', 'student'], ['collect', 'fees', 'date'], ['receipt', 'fees', 'register'], ['concession', 'concessions'], ['absent', 'attendance', 'student'], ['attendance', 'attendance', 'section'], ['topper', 'academics', 'toppers'], ['marks', 'academics', 'subject'], ['result', 'academics', 'subject'], ['strength', 'strength', 'section'], ['admission', 'admissions', 'source'], ['enquir', 'admissions', 'status'], ['bus', 'transport', 'route'], ['visitor', 'gate', 'date'], ['library', 'library', 'book'], ['book', 'library', 'book'], ['staff', 'hr', 'department'], ['homework', 'homework', 'teacher'], ['login', 'usage', 'role'], ['apaar', 'statutory', 'apaar'], ['udise', 'statutory', 'udise'], ['complaint', 'requests', 'category'], ['concern', 'requests', 'category']];
    const hit = words.find(([w, f]) => q.includes(w) && allowed.some(([k]) => k === f));
    if (hit) { family = hit[1]; group = hit[2]; }
  }
  if (!family) redirect('/insights?miss=1');
  redirect(`/reports/${family}${group ? `?group=${group}` : ''}`);
}

export default async function Insights({ searchParams }: { searchParams: Promise<{ miss?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('reports');
  const cards = await insightCards(ctx);
  return (
    <Page title="Insights" sub="What changed and needs a look. Every card links to the records behind it.">
      <Card title="Ask your data" className="mb-4"><form action={ask} className="flex gap-2 p-4"><input name="q" required className="input" placeholder="For example: which classes have the most overdue fees?" aria-label="Question" /><button className="btn">Ask</button></form>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">{sp.miss ? 'I could not match that to a report. Try words like attendance, dues, collections, marks, strength or admissions. ' : ''}Answers open as a report with the filter used, within your permissions. {aiEnabled() ? 'Questions are interpreted with AI; no student data is sent.' : 'Running on keyword matching; add an AI key for free-form questions.'}</p></Card>
      {cards.length === 0 ? <Card><Empty title="Nothing unusual right now" hint="Cards appear for attendance dips, collection slowdowns, teachers with pending marks, sections with low homework posting and unusual concession growth." /></Card>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c, i) => <Link key={i} href={c.href} className="card block p-4 hover:bg-paper"><Badge tone={c.tone === 'bad' ? 'red' : c.tone === 'warn' ? 'amber' : 'blue'}>{c.tone === 'bad' ? 'act now' : c.tone === 'warn' ? 'look into' : 'for information'}</Badge><div className="mt-2 font-medium">{c.title}</div><p className="mt-1 text-sm text-muted">{c.detail}</p></Link>)}</div>}
    </Page>
  );
}
