import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fdate, fullName, go, str, numv } from '@/lib/fmt';

export const metadata = { title: 'PTM slots' };
async function makeSlots(fd: FormData) { 'use server'; const ctx = await requireCap('events', 'write'); const staff = fd.getAll('staff_id').map(String); const date = str(fd, 'date')!, len = numv(fd, 'minutes') ?? 10; const [sh, sm] = (str(fd, 'from') ?? '09:00').split(':').map(Number), [eh, em] = (str(fd, 'to') ?? '12:00').split(':').map(Number); const rows = []; const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; for (const s of staff) for (let m = sh * 60 + sm; m + len <= eh * 60 + em; m += len) rows.push({ staff_id: s, date, start_time: f(m), end_time: f(m + len), mode: str(fd, 'mode') ?? 'in_person', branch_id: ctx.branchId }); if (!rows.length) go('/ptm', 'Choose teachers and a time range.', 'err'); const { error } = await ctx.sb.from('ptm_slots').insert(rows); go('/ptm', error ? error.message : `${rows.length} slots opened for booking in the parent app.`, error ? 'err' : 'ok'); }
async function note(fd: FormData) { 'use server'; const ctx = await requireCap('events', 'write'); await ctx.sb.from('ptm_slots').update({ notes: str(fd, 'notes'), status: 'done' }).eq('id', str(fd, 'id')!); go('/ptm', 'Notes saved.'); }

export default async function Ptm() {
  const ctx = await requireCap('events');
  const [{ data: slots }, { data: staff }] = await Promise.all([ctx.sb.from('ptm_slots').select('id, date, start_time, mode, status, notes, staff:staff!ptm_slots_staff_id_fkey(first_name, last_name), student:students!ptm_slots_student_id_fkey(first_name, last_name)').order('date', { ascending: false }).order('start_time').limit(300), ctx.sb.from('staff').select('id, first_name, last_name').eq('status', 'active').eq('staff_type', 'teaching').order('first_name')]);
  const S = (slots ?? []) as unknown as { id: string; date: string; start_time: string; mode: string; status: string; notes: string | null; staff: { first_name: string; last_name: string } | null; student: { first_name: string; last_name: string } | null }[];
  const can = ctx.can('events', 'write');
  return (
    <Page title="Parent-teacher meetings" sub="Open slots per teacher. Parents book in the app; notes are kept with the meeting.">
      <div className="grid gap-4 lg:grid-cols-3">
        {can && <Card title="Open slots"><form action={makeSlots} className="space-y-3 p-4"><Field label="Teachers" help="Hold Ctrl to choose several."><select name="staff_id" multiple required size={6} className="input">{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></Field><Field label="Date"><input type="date" name="date" required className="input" /></Field><div className="grid grid-cols-3 gap-2"><Field label="From"><input type="time" name="from" defaultValue="09:00" className="input" /></Field><Field label="To"><input type="time" name="to" defaultValue="12:00" className="input" /></Field><Field label="Minutes"><input type="number" name="minutes" defaultValue={10} className="input" /></Field></div><Field label="Mode"><select name="mode" className="input"><option value="in_person">In person</option><option value="video">Video</option></select></Field><button className="btn w-full">Create slots</button></form></Card>}
        <Card title={`Slots · ${S.filter((s) => s.status === 'booked').length} booked, ${S.filter((s) => s.status === 'open').length} open`} className={can ? 'lg:col-span-2' : 'lg:col-span-3'}>{S.length === 0 ? <Empty title="No PTM slots yet" /> : <table className="tbl"><thead><tr><th>When</th><th>Teacher</th><th>Family</th><th>Status</th><th>Notes</th></tr></thead><tbody>{S.map((s) => <tr key={s.id}><td>{fdate(s.date)} {String(s.start_time).slice(0, 5)}</td><td>{fullName(s.staff)}</td><td>{fullName(s.student)}</td><td><Badge>{s.status}</Badge></td><td>{s.status === 'booked' && can ? <form action={note} className="flex gap-1"><input type="hidden" name="id" value={s.id} /><input name="notes" className="input !py-1 text-xs" placeholder="Meeting notes" aria-label="Notes" /><button className="btn-ghost btn-sm">Save</button></form> : s.notes}</td></tr>)}</tbody></table>}</Card>
      </div>
    </Page>
  );
}
