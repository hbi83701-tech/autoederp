import Link from 'next/link';
import { me } from '@/lib/student';
import { Page, Card, Empty, Badge } from '@/components/ui';

export const metadata = { title: 'Tests' };
export default async function Tests() {
  const { ctx, s } = await me();
  if (!s) return <Page title="Tests"><Card><Empty title="Not linked to a student record" /></Card></Page>;
  const [{ data: tests }, { data: att }] = await Promise.all([ctx.sb.from('online_tests').select('id, title, duration_min, status, subject:subjects!online_tests_subject_id_fkey(name)').order('created_at', { ascending: false }), ctx.sb.from('test_attempts').select('test_id, score, max_score, submitted_at').eq('student_id', s.id)]);
  const done = new Map((att ?? []).map((a) => [a.test_id, a]));
  const T = (tests ?? []) as unknown as { id: string; title: string; duration_min: number; status: string; subject: { name: string } | null }[];
  return (
    <Page title="Online tests" sub="Objective and short-answer tests are marked as soon as you submit.">
      <Card>{T.length === 0 ? <Empty title="No tests yet" /> : <ul className="divide-y divide-line text-sm">{T.map((t) => { const a = done.get(t.id); return <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-3"><span><span className="font-medium">{t.title}</span><span className="block text-xs text-muted">{t.subject?.name} · {t.duration_min} minutes</span></span>{a?.submitted_at ? <Badge tone="green">{a.score} / {a.max_score}</Badge> : t.status === 'live' ? <Link className="btn btn-sm" href={`/student/tests/${t.id}`}>Start test</Link> : <Badge>closed</Badge>}</li>; })}</ul>}</Card>
    </Page>
  );
}
