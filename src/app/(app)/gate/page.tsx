import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field, Tabs } from '@/components/ui';
import { ftime, fullName, go, str, today } from '@/lib/fmt';

export const metadata = { title: 'Gate' };
async function checkInVisitor(fd: FormData) { 'use server'; const ctx = await requireCap('gate', 'write'); const { data: badge } = await ctx.sb.rpc('next_no', { p_key: 'visitor_badge', p_prefix: 'V', p_scope: today() }); const { error } = await ctx.sb.from('visitors').insert({ name: str(fd, 'name'), phone: str(fd, 'phone'), type: str(fd, 'type') ?? 'visitor', purpose: str(fd, 'purpose'), host_name: str(fd, 'host_name'), id_type: str(fd, 'id_type'), id_number_last4: str(fd, 'id_number_last4'), vehicle_no: str(fd, 'vehicle_no'), material_details: str(fd, 'material_details'), badge_no: badge, branch_id: ctx.branchId }); go('/gate', error ? error.message : `Checked in. Badge ${badge}.`, error ? 'err' : 'ok'); }
async function checkOut(fd: FormData) { 'use server'; const ctx = await requireCap('gate', 'write'); await ctx.sb.from('visitors').update({ status: 'out', out_at: new Date().toISOString() }).eq('id', str(fd, 'id')!); go('/gate', 'Checked out.'); }
async function verify(fd: FormData) { 'use server'; const ctx = await requireCap('gate', 'write'); const { data, error } = await ctx.sb.rpc('verify_gate_pass', { p_pass: str(fd, 'id'), p_otp: str(fd, 'otp') ?? '' }); if (error) go('/gate?tab=passes', error.message, 'err'); go('/gate?tab=passes', data === 'ok' ? 'OTP matched. Student handed over and the parent has been told.' : 'The OTP does not match. Do not hand over the student. The office has been alerted.', data === 'ok' ? 'ok' : 'err'); }
async function staffPass(fd: FormData) { 'use server'; const ctx = await requireCap('gate', 'write'); const sid = str(fd, 'student_id'); const { data: s } = await ctx.sb.from('students').select('first_name, last_name, branch_id').eq('id', sid!).single(); const { data: g, error } = await ctx.sb.from('gate_passes').insert({ student_id: sid, reason: str(fd, 'reason'), collector_name: str(fd, 'collector_name'), collector_phone: str(fd, 'collector_phone'), branch_id: s?.branch_id }).select('id').single(); if (error) go('/gate?tab=passes', error.message, 'err'); await ctx.sb.rpc('submit_approval', { p_type: 'gate_pass', p_object: g!.id, p_title: `Early pickup: ${s?.first_name} ${s?.last_name ?? ''}`, p_summary: `${str(fd, 'reason') ?? ''} · collector ${str(fd, 'collector_name') ?? ''}`, p_student: sid }); go('/gate?tab=passes', 'Gate pass requested. It needs the class teacher’s approval.'); }

/** Gate app (SAF-01..04): large buttons for one-hand use on a tablet or phone. */
export default async function Gate({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'visitors';
  const ctx = await requireCap('gate');
  const can = ctx.can('gate', 'write');
  const d = today();
  return (
    <Page title="Gate and visitors" sub="Visitor check-in, student gate passes and pickup verification.">
      <Tabs current={tab === 'visitors' ? '/gate' : `/gate?tab=${tab}`} tabs={[{ href: '/gate', label: 'Visitors' }, { href: '/gate?tab=passes', label: 'Student gate passes' }, { href: '/gate?tab=pickup', label: 'Authorised pickup' }, { href: '/x/incidents', label: 'Incident register' }]} />
      {tab === 'visitors' && <Visitors />}{tab === 'passes' && <Passes />}{tab === 'pickup' && <Pickup />}
    </Page>
  );
  async function Visitors() {
    const { data } = await ctx.sb.from('visitors').select('*').gte('in_at', d + 'T00:00:00+05:30').order('in_at', { ascending: false }).limit(200);
    const inside = (data ?? []).filter((v) => v.status === 'in');
    return <div className="grid gap-4 lg:grid-cols-3">
      {can && <Card title="Check in"><form action={checkInVisitor} className="space-y-3 p-4">
        <Field label="Name"><input name="name" className="input !py-3 text-base" required /></Field><Field label="Phone"><input name="phone" inputMode="tel" className="input !py-3 text-base" /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Type"><select name="type" className="input">{['visitor', 'parent', 'vendor', 'material'].map((t) => <option key={t}>{t}</option>)}</select></Field><Field label="ID shown"><select name="id_type" className="input"><option value="">—</option>{['Aadhaar', 'Driving licence', 'Voter ID', 'Company ID'].map((t) => <option key={t}>{t}</option>)}</select></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="ID last 4 digits"><input name="id_number_last4" maxLength={4} className="input" /></Field><Field label="Vehicle no."><input name="vehicle_no" className="input" /></Field></div>
        <Field label="Purpose"><input name="purpose" className="input" required /></Field><Field label="Meeting whom"><input name="host_name" className="input" /></Field><Field label="Material carried (for material passes)"><input name="material_details" className="input" /></Field>
        <button className="btn w-full !py-3 text-base">Check in and print badge</button></form></Card>}
      <Card title={`Inside now (${inside.length}) · ${(data ?? []).length} today`} className="lg:col-span-2">{(data ?? []).length === 0 ? <Empty title="No visitors today" /> : <table className="tbl"><thead><tr><th>Badge</th><th>Visitor</th><th>Purpose</th><th>In</th><th>Out</th><th></th></tr></thead><tbody>{data!.map((v) => <tr key={v.id}><td>{v.badge_no}</td><td className="font-medium">{v.name}<div className="text-xs font-normal text-muted">{v.type} · {v.phone}</div></td><td>{v.purpose}<div className="text-xs text-muted">{v.host_name}</div></td><td>{ftime(v.in_at)}</td><td>{ftime(v.out_at)}</td><td>{v.status === 'in' && can ? <form action={checkOut}><input type="hidden" name="id" value={v.id} /><button className="btn-ghost btn-sm">Check out</button></form> : <Badge>{v.status}</Badge>}</td></tr>)}</tbody></table>}</Card>
    </div>;
  }
  async function Passes() {
    const { data } = await ctx.sb.from('gate_passes').select('id, type, reason, collector_name, collector_phone, status, pickup_time, handed_over_at, verified_by_name, created_at, student:students!gate_passes_student_id_fkey(id, first_name, last_name, photo_url, section:sections!students_section_id_fkey(name)), person:pickup_persons!gate_passes_pickup_person_id_fkey(name, relation, photo_url)').gte('created_at', d + 'T00:00:00+05:30').order('created_at', { ascending: false });
    const P = (data ?? []) as unknown as { id: string; reason: string; collector_name: string; collector_phone: string; status: string; handed_over_at: string | null; verified_by_name: string | null; student: { id: string; first_name: string; last_name: string; section: { name: string } | null } | null; person: { name: string; relation: string; photo_url: string | null } | null }[];
    const { data: studs } = can ? await ctx.sb.from('students').select('id, first_name, last_name').eq('status', 'active').order('first_name').limit(2000) : { data: [] };
    return <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">{P.length === 0 ? <Card><Empty title="No gate passes today" hint="Parents request early pickup in the app. After approval the collector gives the OTP here." /></Card> : P.map((p) => <Card key={p.id}><div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="text-base font-semibold">{fullName(p.student)} <span className="text-sm font-normal text-muted">· {p.student?.section?.name}</span></div><div className="text-sm">Collector: <b>{p.person?.name ?? p.collector_name ?? 'Not named'}</b>{p.person?.relation ? ` (${p.person.relation})` : ''} {p.collector_phone}</div><div className="text-xs text-muted">{p.reason}</div>{p.person ? <Badge tone="green">registered pickup person</Badge> : <Badge tone="amber">not on the registered list: check ID</Badge>}</div>
        {p.status === 'approved' && can ? <form action={verify} className="flex items-center gap-2"><input type="hidden" name="id" value={p.id} /><input name="otp" inputMode="numeric" maxLength={6} required placeholder="OTP" className="input !w-32 !py-3 text-center text-lg tracking-widest" aria-label="OTP from collector" /><button className="btn !py-3">Verify and hand over</button></form>
          : <div className="text-right"><Badge>{p.status}</Badge>{p.handed_over_at && <div className="text-xs text-muted">{ftime(p.handed_over_at)} · {p.verified_by_name}</div>}</div>}</div></Card>)}</div>
      {can && <Card title="Request for a student"><form action={staffPass} className="space-y-3 p-4"><Field label="Student"><select name="student_id" className="input" required><option value="">Choose</option>{(studs ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></Field><Field label="Reason"><input name="reason" className="input" required /></Field><Field label="Collector name"><input name="collector_name" className="input" /></Field><Field label="Collector phone"><input name="collector_phone" className="input" /></Field><button className="btn-ghost w-full">Request (class teacher approves)</button></form></Card>}
    </div>;
  }
  async function Pickup() {
    const term = (sp.q ?? '').replace(/[%,()]/g, ' ').trim();
    const { data } = term ? await ctx.sb.from('students').select('id, first_name, last_name, section:sections!students_section_id_fkey(name), persons:pickup_persons(name, relation, phone, active)').or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_no.ilike.%${term}%`).eq('status', 'active').limit(10) : { data: null };
    return <><form className="mb-3 flex gap-2"><input type="hidden" name="tab" value="pickup" /><input name="q" defaultValue={sp.q ?? ''} placeholder="Student name or admission number" className="input max-w-md !py-3 text-base" aria-label="Find student" /><button className="btn">Find</button><Link className="btn-ghost" href="/x/pickup_persons">Manage list</Link></form>
      {!data ? <Card><Empty title="Look up who may collect a student" hint="If the person at the gate is not on the list, do not hand over the student; call the office." /></Card> : <div className="space-y-3">{(data as unknown as { id: string; first_name: string; last_name: string; section: { name: string } | null; persons: { name: string; relation: string; phone: string; active: boolean }[] }[]).map((s) => <Card key={s.id} title={`${fullName(s)} · ${s.section?.name ?? ''}`}>{s.persons.filter((p) => p.active).length === 0 ? <div className="p-4 text-sm text-red-700">No registered pickup persons. Only a parent with an approved gate pass may collect.</div> : <ul className="divide-y divide-line text-sm">{s.persons.filter((p) => p.active).map((p, i) => <li key={i} className="flex justify-between px-4 py-2.5"><span className="font-medium">{p.name}</span><span className="text-muted">{p.relation} · {p.phone}</span></li>)}</ul>}</Card>)}</div>}</>;
  }
}
