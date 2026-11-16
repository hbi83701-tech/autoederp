import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { go, str, csv } from '@/lib/fmt';
import { FormFields, type FField } from './fields';

async function respond(fd: FormData) {
  'use server';
  const ctx = await getCtx();
  const id = str(fd, 'form')!;
  const { data: f } = await ctx.sb.from('forms').select('fields, anonymous, maps_to').eq('id', id).single();
  const answers = Object.fromEntries(((f?.fields ?? []) as FField[]).map((x) => [x.label, str(fd, x.key)]));
  const { data: kids } = ctx.isStaff ? { data: [] } : await ctx.sb.from('students').select('id').limit(1);
  const student = kids?.[0]?.id ?? null;
  const { error } = await ctx.sb.from('form_responses').insert({ form_id: id, user_id: ctx.user.id, student_id: f?.anonymous ? null : student, answers });
  if (error) go(`/forms/${id}`, error.message, 'err');
  go(ctx.isStaff ? '/forms' : '/parent/messages', 'Thank you. Your response is saved.');
}

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { data: f } = await ctx.sb.from('forms').select('*').eq('id', id).maybeSingle();
  if (!f) notFound();
  const fields = (f.fields ?? []) as FField[];
  const staffView = ctx.isStaff && ctx.can('forms');
  const { data: resp } = staffView ? await ctx.sb.from('form_responses').select('answers, at, student:students!form_responses_student_id_fkey(first_name, last_name)').eq('form_id', id).order('at', { ascending: false }).limit(500) : { data: [] };
  const R = (resp ?? []) as unknown as { answers: Record<string, string | null>; at: string; student: { first_name: string; last_name: string } | null }[];
  const summary = fields.filter((x) => ['select', 'yesno', 'rating'].includes(x.type)).map((x) => { const m = new Map<string, number>(); for (const r of R) { const v = r.answers[x.label]; if (v) m.set(v, (m.get(v) ?? 0) + 1); } return { label: x.label, counts: [...m].sort((a, b) => b[1] - a[1]) }; });
  return (
    <Page title={f.title} sub={f.description ?? undefined}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={staffView ? 'Preview' : undefined}>{f.status !== 'published' ? <Empty title="This form is closed" /> : <form action={respond} className="space-y-4 p-4"><input type="hidden" name="form" value={id} /><FormFields fields={fields} /><button className="btn">Submit</button>{f.anonymous && <p className="text-xs text-muted">Your name is not stored with this response.</p>}</form>}</Card>
        {staffView && <Card title={`${R.length} responses`}>{R.length === 0 ? <Empty title="No responses yet" /> : <><div className="space-y-3 p-4 text-sm">{summary.map((s) => <div key={s.label}><div className="font-medium">{s.label}</div>{s.counts.map(([v, n]) => <div key={v} className="flex justify-between text-muted"><span>{v}</span><span>{n}</span></div>)}</div>)}</div>
          <details className="border-t border-line p-4 text-sm"><summary className="cursor-pointer">All responses (CSV)</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-paper p-2 text-xs">{csv(R.map((r) => ({ ...(f.anonymous ? {} : { Student: r.student ? `${r.student.first_name} ${r.student.last_name ?? ''}` : '' }), ...r.answers })))}</pre></details></>}</Card>}
      </div>
    </Page>
  );
}
