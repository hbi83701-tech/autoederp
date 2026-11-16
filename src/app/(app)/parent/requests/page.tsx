import Link from 'next/link';
import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fdate, ftime, today } from '@/lib/fmt';
import { ChildSwitcher } from '../switcher';
import { leaveRequest, gatePass, raiseTicket } from '../actions';

export const metadata = { title: 'Requests' };
/** Parent requests (PAP-05): leave, early pickup, concerns, certificates and corrections, with status. */
export default async function Requests() {
  const { ctx, children, child, t } = await family();
  if (!child) return <Page title={t('Requests')}><Card><Empty title="No child linked" /></Card></Page>;
  const [{ data: leaves }, { data: passes }, { data: secrets }, { data: tickets }, { data: persons }, { data: cats }, { data: docs }] = await Promise.all([
    ctx.sb.from('leave_requests').select('id, from_date, to_date, status, reason').eq('student_id', child.id).order('from_date', { ascending: false }).limit(10),
    ctx.sb.from('gate_passes').select('id, status, reason, collector_name, created_at, handed_over_at').eq('student_id', child.id).order('created_at', { ascending: false }).limit(10),
    ctx.sb.from('gate_pass_secrets').select('pass_id, otp').eq('student_id', child.id),
    ctx.sb.from('tickets').select('id, type, subject, status, sla_due, created_at').eq('raised_by', ctx.user.id).order('created_at', { ascending: false }).limit(20),
    ctx.sb.from('pickup_persons').select('id, name, relation').eq('student_id', child.id).eq('active', true), ctx.sb.from('masters').select('name').eq('type', 'concern_category').order('sort'),
    ctx.sb.from('issued_documents').select('id, title, number, issued_on').eq('student_id', child.id).order('issued_on', { ascending: false }),
  ]);
  const otp = new Map((secrets ?? []).map((s) => [s.pass_id, s.otp]));
  const d = today();
  const hid = <input type="hidden" name="student_id" value={child.id} />;
  return (
    <Page title={t('Requests')} sub={`For ${child.first_name}`} actions={<ChildSwitcher children={children} current={child.id} />}>
      {(passes ?? []).filter((p) => p.status === 'approved').map((p) => <div key={p.id} className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4"><div className="text-sm">Early pickup approved. Give this OTP to the person collecting {child.first_name}:</div><div className="mt-1 text-3xl font-semibold tracking-[0.3em]">{otp.get(p.id) ?? '······'}</div><div className="text-xs text-muted">The gate will hand over only after this OTP matches.</div></div>)}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Apply for leave"><form action={leaveRequest} className="space-y-3 p-4">{hid}<div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" name="from_date" min={d} required className="input" /></Field><Field label="To"><input type="date" name="to_date" min={d} className="input" /></Field></div><Field label="Reason"><input name="reason" required className="input" /></Field><button className="btn w-full">Send</button></form>
          <ul className="divide-y divide-line border-t border-line text-sm">{(leaves ?? []).map((l) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{fdate(l.from_date)}{l.to_date !== l.from_date ? ` – ${fdate(l.to_date)}` : ''}</span><Badge>{l.status}</Badge></li>)}</ul></Card>
        <Card title="Early pickup (gate pass)"><form action={gatePass} className="space-y-3 p-4">{hid}<Field label="Who will collect"><select name="pickup_person_id" className="input"><option value="">Someone else (enter below)</option>{(persons ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.relation})</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Name"><input name="collector_name" className="input" /></Field><Field label="Phone"><input name="collector_phone" className="input" inputMode="tel" /></Field></div><Field label="Pickup time"><input type="datetime-local" name="pickup_time" className="input" /></Field><Field label="Reason"><input name="reason" required className="input" /></Field><button className="btn w-full">Request pickup</button></form>
          <ul className="divide-y divide-line border-t border-line text-sm">{(passes ?? []).map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><span>{ftime(p.created_at)} · {p.reason}</span><Badge>{p.status}</Badge></li>)}</ul></Card>
        <Card title="Concern, certificate or correction"><form action={raiseTicket} className="space-y-3 p-4">{hid}
          <Field label="What do you need?"><select name="type" className="input"><option value="concern">Raise a concern</option><option value="certificate">Certificate (bonafide, fee certificate)</option><option value="tc">Transfer certificate</option><option value="profile_change">Correct a detail (name, date of birth)</option><option value="stop_change">Change bus stop</option></select></Field>
          <Field label="Category"><select name="category" className="input"><option value="">—</option>{(cats ?? []).map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>
          <Field label="Subject"><input name="subject" required className="input" /></Field><Field label="Details"><textarea name="body" rows={2} className="input" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Detail to correct"><select name="field" className="input"><option value="">—</option><option value="first_name">First name</option><option value="last_name">Last name</option><option value="dob">Date of birth</option><option value="mother_tongue">Mother tongue</option></select></Field><Field label="Correct value"><input name="value" className="input" /></Field></div>
          <button className="btn w-full">Send request</button></form></Card>
        <Card title="My requests" className="lg:col-span-2">{(tickets ?? []).length === 0 ? <Empty title="No requests yet" hint="Each request goes to the right person at school and shows the time by which they will respond." /> : <ul className="divide-y divide-line text-sm">{tickets!.map((k) => <li key={k.id} className="flex items-center justify-between gap-2 px-4 py-2.5"><Link className="link" href={`/helpdesk/${k.id}`}>{k.subject}</Link><span className="flex items-center gap-2"><span className="text-xs text-muted">respond by {ftime(k.sla_due)}</span><Badge>{k.status}</Badge></span></li>)}</ul>}</Card>
        <Card title="Certificates issued">{(docs ?? []).length === 0 ? <div className="p-4 text-sm text-muted">None yet.</div> : <ul className="divide-y divide-line text-sm">{docs!.map((x) => <li key={x.id} className="px-4 py-2"><Link className="link" href={`/documents/${x.id}`}>{x.title} {x.number}</Link></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
