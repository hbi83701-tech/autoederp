import { me } from '@/lib/student';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { fdate, today, go, str } from '@/lib/fmt';

export const metadata = { title: 'Homework' };
async function submit(fd: FormData) { 'use server'; const { ctx, s } = await me(); if (!s) go('/student/homework', 'Not linked.', 'err'); const post = str(fd, 'post')!; const { data: p } = await ctx.sb.from('posts').select('due_date').eq('id', post).single(); const { error } = await ctx.sb.from('post_submissions').insert({ post_id: post, student_id: s!.id, body: str(fd, 'body'), file_path: str(fd, 'link'), late: !!p?.due_date && today() > p.due_date }); go('/student/homework', error ? (error.code === '23505' ? 'You have already submitted this.' : error.message) : 'Submitted.', error ? 'err' : 'ok'); }

export default async function StudentHomework() {
  const { ctx, s } = await me();
  if (!s) return <Page title="Homework"><Card><Empty title="Not linked to a student record" /></Card></Page>;
  const [{ data: posts }, { data: subs }, { data: content }] = await Promise.all([
    ctx.sb.from('posts').select('id, type, title, body, due_date, allow_submission, attachment_path, max_marks, subject:subjects!posts_subject_id_fkey(name)').or(`section_id.eq.${s.section_id},student_id.eq.${s.id}`).order('created_at', { ascending: false }).limit(40),
    ctx.sb.from('post_submissions').select('post_id, marks, feedback, late').eq('student_id', s.id), ctx.sb.from('content_items').select('id, title, type, url').or(`section_id.eq.${s.section_id},section_id.is.null`).limit(20),
  ]);
  const done = new Map((subs ?? []).map((x) => [x.post_id, x]));
  const P = (posts ?? []) as unknown as { id: string; type: string; title: string; body: string; due_date: string | null; allow_submission: boolean; attachment_path: string | null; max_marks: number | null; subject: { name: string } | null }[];
  return (
    <Page title="Homework and resources" sub={s.section?.name ?? ''}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">{P.length === 0 ? <Card><Empty title="Nothing posted yet" /></Card> : P.map((p) => { const d = done.get(p.id); return <Card key={p.id}><div className="p-4 text-sm"><div className="flex flex-wrap items-center gap-2"><Badge tone="teal">{p.type}</Badge><span className="font-medium">{p.title}</span><span className="text-xs text-muted">{p.subject?.name}{p.due_date ? ` · due ${fdate(p.due_date)}` : ''}</span></div>{p.body && <p className="mt-1 whitespace-pre-wrap">{p.body}</p>}{p.attachment_path && <a className="link" href={p.attachment_path} target="_blank" rel="noreferrer">Open attachment</a>}
          {d ? <div className="mt-2 rounded-lg bg-paper px-3 py-2">Submitted{d.late ? ' (late)' : ''}{d.marks !== null ? ` · ${d.marks}${p.max_marks ? ` / ${p.max_marks}` : ''}` : ''}{d.feedback ? ` · ${d.feedback}` : ''}</div>
            : p.allow_submission && <form action={submit} className="mt-2 space-y-2"><input type="hidden" name="post" value={p.id} /><textarea name="body" rows={2} required className="input" placeholder="Type your answer" aria-label="Answer" /><input name="link" className="input" placeholder="Link to your file (optional)" aria-label="File link" /><button className="btn btn-sm">Submit</button></form>}</div></Card>; })}</div>
        <Card title="Resources">{(content ?? []).length === 0 ? <Empty title="No resources shared" /> : <ul className="divide-y divide-line text-sm">{content!.map((c) => <li key={c.id} className="px-4 py-2">{c.url ? <a className="link" href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title} <Badge tone="grey">{c.type}</Badge></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
