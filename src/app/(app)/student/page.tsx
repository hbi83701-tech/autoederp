import Link from 'next/link';
import { me } from '@/lib/student';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { today, fdate } from '@/lib/fmt';
import { weekday, DAYS } from '@/lib/calendar';

export const metadata = { title: 'My day' };
export default async function StudentHome() {
  const { ctx, s } = await me();
  if (!s) return <Page title="My day"><Card><Empty title="Your login is not linked to a student record" hint="Ask your class teacher or the school office." /></Card></Page>;
  const d = today();
  const [{ data: tt }, { data: bells }, { data: posts }, { data: tests }, { data: cls }] = await Promise.all([
    ctx.sb.from('timetable_entries').select('period_no, room, subject:subjects!timetable_entries_subject_id_fkey(name)').eq('section_id', s.section_id ?? '').eq('day', weekday(d)).order('period_no'),
    ctx.sb.from('bell_periods').select('period_no, start_time').eq('is_break', false),
    ctx.sb.from('posts').select('id, type, title, due_date').eq('section_id', s.section_id ?? '').gte('due_date', d).order('due_date').limit(6),
    ctx.sb.from('online_tests').select('id, title, duration_min').eq('status', 'live'), ctx.sb.from('online_classes').select('id, title, starts_at, join_url').eq('section_id', s.section_id ?? '').gte('starts_at', d).order('starts_at').limit(4),
  ]);
  return (
    <Page title={`Hi ${s.first_name}`} sub={`${s.section?.name ?? ''} · ${DAYS[weekday(d)]}, ${fdate(d)}`}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Today's timetable">{(tt ?? []).length === 0 ? <Empty title="No classes listed today" /> : <ul className="divide-y divide-line text-sm">{(tt as unknown as { period_no: number; room: string | null; subject: { name: string } | null }[]).map((e) => <li key={e.period_no} className="flex justify-between px-4 py-2"><span>{e.subject?.name ?? 'Free'}{e.room ? ` · ${e.room}` : ''}</span><span className="tabular-nums text-muted">{String((bells ?? []).find((b) => b.period_no === e.period_no)?.start_time ?? '').slice(0, 5)}</span></li>)}</ul>}</Card>
        <Card title="Due soon" actions={<Link className="link text-sm" href="/student/homework">All homework</Link>}>{(posts ?? []).length === 0 ? <Empty title="Nothing due" /> : <ul className="divide-y divide-line text-sm">{posts!.map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><span>{p.title}</span><span className="text-amber-700">{fdate(p.due_date)}</span></li>)}</ul>}</Card>
        <Card title="Tests and online classes">{(tests ?? []).length + (cls ?? []).length === 0 ? <Empty title="Nothing scheduled" /> : <ul className="divide-y divide-line text-sm">{(tests ?? []).map((t) => <li key={t.id} className="flex items-center justify-between px-4 py-2"><span>{t.title} <Badge tone="blue">live</Badge></span><Link className="btn btn-sm" href={`/student/tests/${t.id}`}>Start</Link></li>)}{(cls ?? []).map((c) => <li key={c.id} className="flex items-center justify-between px-4 py-2"><span>{c.title}</span>{c.join_url && <a className="link" href={c.join_url} target="_blank" rel="noreferrer">Join</a>}</li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
