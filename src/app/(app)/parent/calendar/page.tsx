import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { fdate, today } from '@/lib/fmt';
import { ChildSwitcher } from '../switcher';
import { bookPtm, registerEvent } from '../actions';

export const metadata = { title: 'Calendar' };
export default async function Cal() {
  const { ctx, children, child, t } = await family();
  const d = today();
  const [{ data: cal }, { data: events }, { data: regs }, { data: slots }, { data: staff }, { data: albums }] = await Promise.all([
    ctx.sb.from('calendar_events').select('id, title, type, start_date, end_date').gte('start_date', d).order('start_date').limit(30),
    ctx.sb.from('events').select('id, title, type, date, venue, fee, consent_required, registration_open').gte('date', d).eq('registration_open', true).order('date'),
    child ? ctx.sb.from('event_registrations').select('event_id, status').eq('student_id', child.id) : Promise.resolve({ data: [] }),
    ctx.sb.from('ptm_slots').select('id, staff_id, date, start_time, mode, status, student_id').gte('date', d).order('date').order('start_time').limit(200),
    ctx.sb.rpc('staff_directory'), ctx.sb.from('gallery_albums').select('id, title').order('created_at', { ascending: false }).limit(12),
  ]);
  const names = new Map(((staff ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const mine = (slots ?? []).filter((s) => child && s.student_id === child.id), open = (slots ?? []).filter((s) => s.status === 'open');
  const reg = new Map((regs ?? []).map((r) => [r.event_id, r.status]));
  return (
    <Page title={t('Calendar')} sub="Holidays, exams, events and parent-teacher meetings." actions={child ? <ChildSwitcher children={children} current={child.id} /> : undefined}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Coming up">{(cal ?? []).length === 0 ? <Empty title="Nothing on the calendar" /> : <ul className="divide-y divide-line text-sm">{cal!.map((c) => <li key={c.id} className="flex justify-between gap-2 px-4 py-2"><span>{c.title}</span><span className="shrink-0 text-muted">{fdate(c.start_date)} <Badge tone={c.type === 'holiday' ? 'green' : c.type === 'exam' ? 'amber' : 'blue'}>{c.type}</Badge></span></li>)}</ul>}</Card>
        <Card title="Parent-teacher meetings">{mine.length > 0 && <ul className="divide-y divide-line text-sm">{mine.map((s) => <li key={s.id} className="px-4 py-2.5"><Badge tone="green">booked</Badge> {fdate(s.date)} at {String(s.start_time).slice(0, 5)} with {names.get(s.staff_id)} ({s.mode.replace('_', ' ')})</li>)}</ul>}
          {open.length === 0 ? <Empty title="No open slots" hint="Slots appear when the school schedules a PTM." /> : <ul className="divide-y divide-line border-t border-line text-sm">{open.slice(0, 12).map((s) => <li key={s.id} className="flex items-center justify-between px-4 py-2"><span>{fdate(s.date)} · {String(s.start_time).slice(0, 5)} · {names.get(s.staff_id)}</span>{child && <form action={bookPtm}><input type="hidden" name="slot" value={s.id} /><input type="hidden" name="student_id" value={child.id} /><button className="btn-ghost btn-sm">Book</button></form>}</li>)}</ul>}</Card>
        <Card title="Events and trips">{(events ?? []).length === 0 ? <Empty title="No events open for registration" /> : <ul className="divide-y divide-line text-sm">{events!.map((e) => <li key={e.id} className="px-4 py-2.5"><div className="font-medium">{e.title}</div><div className="text-xs text-muted">{fdate(e.date)} · {e.venue}{Number(e.fee) ? ` · Rs ${e.fee}` : ''}</div>
          {reg.has(e.id) ? <Badge tone="green">{reg.get(e.id)}</Badge> : child && <form action={registerEvent} className="mt-1 flex items-center gap-2"><input type="hidden" name="event" value={e.id} /><input type="hidden" name="student_id" value={child.id} />{e.consent_required && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="consent" required className="h-4 w-4" />I give consent</label>}<button className="btn-ghost btn-sm">Register {child.first_name}</button></form>}</li>)}</ul>}</Card>
        <Card title="Photo gallery" className="lg:col-span-3">{(albums ?? []).length === 0 ? <Empty title="No albums published" hint="Albums appear after the school approves them. Children without photo consent are left out." /> : <ul className="grid gap-px bg-line sm:grid-cols-3">{albums!.map((a) => <li key={a.id} className="bg-white px-4 py-3 text-sm">{a.title}</li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
