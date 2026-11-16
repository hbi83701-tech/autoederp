import Link from 'next/link';
import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { today, fdate, inr, ftime, fullName } from '@/lib/fmt';
import { weekday } from '@/lib/calendar';
import { balance, type Demand } from '@/lib/rules/fees';
import { ChildSwitcher } from './switcher';

export const metadata = { title: 'Today' };
/** Parent app home (PAP-02): attendance, homework, timetable, bus, messages, dues and next actions for the chosen child. */
export default async function ParentHome() {
  const { ctx, children, child, t } = await family();
  if (!child) return <Page title={t('Today')}><Card><Empty title="No children are linked to your login yet" hint="Ask the school office to link you as a guardian. If you have just been invited, try signing out and in again." /></Card></Page>;
  const d = today();
  const sb = ctx.sb;
  const [att, posts, tt, dues, trips, passes, unread, bells, staff] = await Promise.all([
    sb.from('attendance').select('status').eq('student_id', child.id).eq('date', d).eq('session', 'day').maybeSingle(),
    sb.from('posts').select('id, type, title, body, due_date, created_at, subject:subjects!posts_subject_id_fkey(name)').or(`section_id.eq.${child.section_id},student_id.eq.${child.id}`).order('created_at', { ascending: false }).limit(6),
    sb.from('timetable_entries').select('period_no, subject:subjects!timetable_entries_subject_id_fkey(name)').eq('section_id', child.section_id ?? '').eq('day', weekday(d)).order('period_no'),
    sb.from('fee_demands').select('id, amount, concession, fine, paid, due_date').in('student_id', children.map((c) => c.id)).in('status', ['due', 'partial']),
    sb.from('trips').select('id, status, direction, delay_minutes, route:routes!trips_route_id_fkey(name)').eq('date', d).eq('status', 'running').limit(1),
    sb.from('gate_passes').select('id, status').eq('student_id', child.id).in('status', ['requested', 'approved']),
    sb.from('message_recipients').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id).is('read_at', null),
    sb.from('bell_periods').select('period_no, start_time').eq('is_break', false), sb.rpc('staff_directory'),
  ]);
  const D = (dues.data ?? []) as Demand[];
  const due = D.reduce((x, y) => x + balance(y), 0), overdue = D.filter((x) => x.due_date < d).reduce((x, y) => x + balance(y), 0);
  const teacher = ((staff.data ?? []) as { id: string; name: string }[]).find((s) => s.id === child.section?.class_teacher_id);
  const trip = (trips.data ?? [])[0] as unknown as { status: string; direction: string; delay_minutes: number; route: { name: string } | null } | undefined;
  const P = (posts.data ?? []) as unknown as { id: string; type: string; title: string; body: string; due_date: string | null; created_at: string; subject: { name: string } | null }[];
  const actions = [overdue > 0 && { href: '/parent/fees', label: `Pay overdue fees of ${inr(overdue)}` }, (passes.data ?? []).some((p) => p.status === 'approved') && { href: '/parent/requests', label: 'Your pickup is approved: see the OTP' }, (unread.count ?? 0) > 0 && { href: '/parent/messages', label: `${unread.count} unread circular${unread.count === 1 ? '' : 's'}` }].filter(Boolean) as { href: string; label: string }[];
  return (
    <Page title={fullName(child)} sub={`${child.section?.name ?? ''}${teacher ? ` · Class teacher: ${teacher.name}` : ''} · ${fdate(d)}`} actions={<ChildSwitcher children={children} current={child.id} />}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Attendance')} value={att.data ? (att.data.status === 'A' ? t('Absent') : att.data.status === 'LV' ? 'On leave' : att.data.status === 'L' ? 'Late' : t('Present')) : t('Not marked yet')} tone={att.data?.status === 'A' ? 'bad' : att.data ? 'good' : undefined} />
        <Stat label={t('Fees due')} value={inr(due)} hint={overdue > 0 ? `${inr(overdue)} overdue` : children.length > 1 ? 'for all children' : ''} tone={overdue > 0 ? 'bad' : undefined} href="/parent/fees" />
        <Stat label={t('Bus')} value={trip ? (trip.delay_minutes ? `${trip.delay_minutes} min late` : 'On the way') : 'No trip now'} hint={trip?.route?.name} href="/parent/bus" />
        <Stat label={t('Messages')} value={unread.count ?? 0} hint="unread" href="/parent/messages" />
      </div>
      {actions.length > 0 && <Card title={t('Next actions')} className="mt-4"><ul className="divide-y divide-line text-sm">{actions.map((a) => <li key={a.href}><Link href={a.href} className="link block px-4 py-2.5">{a.label}</Link></li>)}</ul></Card>}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t('Homework')} className="lg:col-span-2">{P.length === 0 ? <Empty title="Nothing posted yet" hint="Homework, class notes and circulars for the class appear here." /> : <ul className="divide-y divide-line">{P.map((p) => <li key={p.id} className="px-4 py-2.5 text-sm"><div className="flex flex-wrap items-center gap-2"><Badge tone="teal">{p.type}</Badge><span className="font-medium">{p.title}</span>{p.due_date && <span className={`text-xs ${p.due_date < d ? 'text-muted' : 'text-amber-700'}`}>due {fdate(p.due_date)}</span>}</div><div className="text-xs text-muted">{p.subject?.name ?? 'General'} · {ftime(p.created_at)}</div>{p.body && <p className="mt-1 whitespace-pre-wrap">{p.body}</p>}</li>)}</ul>}</Card>
        <Card title={t('Timetable')}>{(tt.data ?? []).length === 0 ? <Empty title="No classes listed for today" /> : <ul className="divide-y divide-line text-sm">{(tt.data as unknown as { period_no: number; subject: { name: string } | null }[]).map((e) => <li key={e.period_no} className="flex justify-between px-4 py-2"><span>{e.subject?.name ?? 'Free'}</span><span className="tabular-nums text-muted">{String((bells.data ?? []).find((b) => b.period_no === e.period_no)?.start_time ?? `P${e.period_no}`).slice(0, 5)}</span></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
