import { notFound } from 'next/navigation';
import { me } from '@/lib/student';
import { Page, Card, Empty } from '@/components/ui';
import { TestRunner } from './runner';

export default async function TakeTest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, s } = await me();
  if (!s) notFound();
  const { data: t } = await ctx.sb.from('online_tests').select('id, title, duration_min, status').eq('id', id).maybeSingle();
  if (!t) notFound();
  const { data: done } = await ctx.sb.from('test_attempts').select('score, max_score, submitted_at').eq('test_id', id).eq('student_id', s.id).maybeSingle();
  if (done?.submitted_at) return <Page title={t.title}><Card><Empty title={`You scored ${done.score} out of ${done.max_score}`} hint="Your teacher can see your answers and will share feedback." /></Card></Page>;
  const { data: qs, error } = await ctx.sb.rpc('get_test_questions', { p_test: id });
  if (error) return <Page title={t.title}><Card><Empty title="This test is not open" hint={error.message} /></Card></Page>;
  return <Page title={t.title} sub={`${t.duration_min} minutes · stay on this tab until you submit`}><TestRunner testId={id} studentId={s.id} minutes={t.duration_min} questions={qs as { id: string; question: string; type: string; options: string[] | null; marks: number }[]} /></Page>;
}
