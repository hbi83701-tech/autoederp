import Link from 'next/link';
import { me } from '@/lib/student';
import { Page, Card, Empty } from '@/components/ui';
import { fdate } from '@/lib/fmt';
import { logReading } from '../../parent/actions';

export const metadata = { title: 'Results and library' };
export default async function Results() {
  const { ctx, s } = await me();
  if (!s) return <Page title="Results"><Card><Empty title="Not linked to a student record" /></Card></Page>;
  const [{ data: cards }, { data: res }, { data: loans }, { data: books }] = await Promise.all([
    ctx.sb.from('report_cards').select('id, term').eq('student_id', s.id).eq('status', 'published'),
    ctx.sb.from('assessment_results').select('marks, code, assessment:assessments!assessment_results_assessment_id_fkey(name, max_marks, subject:subjects!assessments_subject_id_fkey(name))').eq('student_id', s.id).limit(60),
    ctx.sb.from('loans').select('id, due_on, book:books!loans_book_id_fkey(title)').eq('student_id', s.id).is('returned_on', null), ctx.sb.from('books').select('id, title, author, url').eq('is_digital', true).limit(20),
  ]);
  return (
    <Page title="Results and library">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Report cards">{(cards ?? []).length === 0 ? <Empty title="None published yet" /> : <ul className="divide-y divide-line text-sm">{cards!.map((c) => <li key={c.id} className="px-4 py-2.5"><Link className="link" href={`/report-cards/${c.id}`}>{c.term}</Link></li>)}</ul>}</Card>
        <Card title="Marks">{(res ?? []).length === 0 ? <Empty title="No marks published yet" /> : <ul className="divide-y divide-line text-sm">{(res as unknown as { marks: number | null; code: string | null; assessment: { name: string; max_marks: number; subject: { name: string } | null } | null }[]).map((r, i) => <li key={i} className="flex justify-between px-4 py-2"><span>{r.assessment?.subject?.name} · {r.assessment?.name}</span><span className="tabular-nums">{r.code ?? r.marks} / {r.assessment?.max_marks}</span></li>)}</ul>}</Card>
        <Card title="Library"><ul className="divide-y divide-line text-sm">{((loans ?? []) as unknown as { id: string; due_on: string; book: { title: string } | null }[]).map((l) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{l.book?.title}</span><span className="text-muted">due {fdate(l.due_on)}</span></li>)}{(books ?? []).map((b) => <li key={b.id} className="px-4 py-2">{b.url ? <a className="link" href={b.url} target="_blank" rel="noreferrer">{b.title}</a> : b.title} <span className="text-muted">{b.author}</span></li>)}</ul>
          <form action={logReading} className="space-y-2 border-t border-line p-4"><input type="hidden" name="student_id" value={s.id} /><input type="hidden" name="back" value="/student/results" /><input name="title" required placeholder="What did you read?" className="input" aria-label="Title" /><input name="pages" type="number" placeholder="Pages" className="input" aria-label="Pages" /><button className="btn-ghost w-full">Add to my reading log</button></form></Card>
      </div>
    </Page>
  );
}
