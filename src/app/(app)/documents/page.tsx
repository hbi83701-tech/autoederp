import Link from 'next/link';
import { randomBytes } from 'node:crypto';
import { requireCap, type Ctx } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { fdate, fullName, go, str, today, inr } from '@/lib/fmt';

export const metadata = { title: 'Certificates' };

/** Clearance checklist before a TC or no-dues certificate: fees, library, store, transport, hostel (DOC-02). */
async function clearance(ctx: Ctx, id: string) {
  const [f, l, o, t, h] = await Promise.all([
    ctx.sb.from('fee_demands').select('amount, concession, fine, paid').eq('student_id', id).in('status', ['due', 'partial']).lte('due_date', today()),
    ctx.sb.from('loans').select('id').eq('student_id', id).is('returned_on', null), ctx.sb.from('store_orders').select('id').eq('student_id', id).in('status', ['ordered', 'ready']),
    ctx.sb.from('student_transport').select('id').eq('student_id', id).eq('active', true), ctx.sb.from('hostel_allocations').select('id').eq('student_id', id).eq('active', true),
  ]);
  const due = (f.data ?? []).reduce((x, d) => x + Number(d.amount) - Number(d.concession) + Number(d.fine) - Number(d.paid), 0);
  return [{ item: 'Fees', ok: due <= 0, note: due > 0 ? `${inr(due)} overdue` : 'No dues' }, { item: 'Library', ok: !(l.data ?? []).length, note: `${(l.data ?? []).length} books out` }, { item: 'Store', ok: !(o.data ?? []).length, note: `${(o.data ?? []).length} open orders` },
    { item: 'Transport', ok: true, note: (t.data ?? []).length ? 'Ends when the student leaves' : 'Not on transport' }, { item: 'Hostel', ok: true, note: (h.data ?? []).length ? 'Ends when the student leaves' : 'Not in hostel' }];
}

async function issue(fd: FormData) {
  'use server';
  const ctx = await requireCap('documents', 'write');
  const studentId = str(fd, 'student_id'), tplId = str(fd, 'template_id');
  if (!studentId || !tplId) go('/documents', 'Choose a student and a template.', 'err');
  const [{ data: tpl }, { data: s }] = await Promise.all([ctx.sb.from('doc_templates').select('*').eq('id', tplId!).single(),
    ctx.sb.from('students').select('*, section:sections!students_section_id_fkey(name), household:households!students_household_id_fkey(id)').eq('id', studentId!).single()]);
  if (!tpl || !s) go('/documents', 'Not found.', 'err');
  if (['tc', 'no_dues'].includes(tpl!.type)) { const c = await clearance(ctx, studentId!); const block = c.filter((x) => !x.ok); if (block.length) go(`/documents?student=${studentId}`, `Clearance pending: ${block.map((b) => `${b.item} (${b.note})`).join(', ')}.`, 'err'); }
  const [{ data: g }, { data: sens }, { data: paid }] = await Promise.all([ctx.sb.from('guardians').select('name').eq('household_id', s!.household?.id ?? '').order('is_primary', { ascending: false }).limit(1),
    ctx.can('sensitive') ? ctx.sb.from('student_sensitive').select('blood_group').eq('student_id', studentId!).maybeSingle() : Promise.resolve({ data: null }),
    ctx.sb.from('receipt_allocations').select('amount, demand:fee_demands!receipt_allocations_demand_id_fkey(year_id, head:fee_heads!fee_demands_head_id_fkey(tax_certificate)), receipt:receipts!receipt_allocations_receipt_id_fkey(status)').eq('student_id', studentId!)]);
  const tuition = ((paid ?? []) as unknown as { amount: number; demand: { year_id: string; head: { tax_certificate: boolean } | null } | null; receipt: { status: string } | null }[]).filter((p) => p.receipt?.status === 'valid' && p.demand?.head?.tax_certificate && p.demand.year_id === ctx.year?.id).reduce((t, p) => t + Number(p.amount), 0);
  const fields: Record<string, string> = { student_name: fullName(s), admission_no: s!.admission_no ?? '', class: s!.section?.name ?? '', dob: fdate(s!.dob), joined_on: fdate(s!.joined_on), left_on: fdate(s!.left_on ?? today()), parent_name: g?.[0]?.name ?? '', year: ctx.year?.name ?? '', date: fdate(today()), school: ctx.org.name, apaar_id: s!.apaar_id ?? '', blood_group: (sens as { blood_group?: string } | null)?.blood_group ?? '', reason: str(fd, 'reason') ?? '', tuition_paid: inr(tuition) };
  const body = String(tpl!.body ?? '').replace(/\{\{(\w+)\}\}/g, (_, k) => fields[k] ?? '');
  const { data: number } = await ctx.sb.rpc('next_no', { p_key: `doc_${tpl!.type}`, p_prefix: `${tpl!.type.toUpperCase().slice(0, 3)}/${ctx.year?.name ?? ''}/`, p_scope: '' });
  const { data: doc, error } = await ctx.sb.from('issued_documents').insert({ type: tpl!.type, number, title: tpl!.name, student_id: studentId, branch_id: s!.branch_id, data: fields, body, verify_code: randomBytes(9).toString('hex'), issued_by_name: ctx.name }).select('id').single();
  if (error) go('/documents', error.message, 'err');
  if (tpl!.type === 'tc' && s!.status === 'withdrawn') await ctx.sb.rpc('change_student_status', { p_student: studentId, p_to: 'alumni', p_reason: `TC ${number} issued` });
  go(`/documents/${doc!.id}`, `${tpl!.name} ${number} issued.`);
}

async function requestTc(fd: FormData) {
  'use server';
  const ctx = await requireCap('documents', 'write');
  const id = str(fd, 'student_id')!;
  const { data: s } = await ctx.sb.from('students').select('first_name, last_name').eq('id', id).single();
  const c = await clearance(ctx, id);
  const { error } = await ctx.sb.rpc('submit_approval', { p_type: 'tc', p_object: id, p_title: `Transfer certificate: ${s?.first_name} ${s?.last_name ?? ''}`, p_summary: str(fd, 'reason'), p_student: id, p_impact: `Student moves to withdrawn. Clearance: ${c.map((x) => `${x.item} ${x.ok ? 'clear' : 'PENDING (' + x.note + ')'}`).join(', ')}.` });
  go(`/documents?student=${id}`, error ? error.message : 'TC sent to the principal for approval. Once approved and dues are clear, issue the TC here.', error ? 'err' : 'ok');
}

export default async function Documents({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('documents');
  const [{ data: tpls }, { data: studs }, { data: issued }, { data: apaar }] = await Promise.all([
    ctx.sb.from('doc_templates').select('id, name, type').eq('active', true).order('name'), ctx.sb.from('students').select('id, first_name, last_name, admission_no').in('status', ['active', 'withdrawn', 'alumni']).order('first_name').limit(3000),
    ctx.sb.from('issued_documents').select('id, type, number, title, status, issued_on, student:students!issued_documents_student_id_fkey(first_name, last_name)').order('created_at', { ascending: false }).limit(50),
    ctx.sb.from('students').select('apaar_id').eq('status', 'active').limit(20000),
  ]);
  const check = sp.student ? await clearance(ctx, sp.student) : null;
  const can = ctx.can('documents', 'write');
  const withId = (apaar ?? []).filter((a) => a.apaar_id).length;
  return (
    <Page title="Certificates and ID cards" sub="Every document carries a QR code that anyone can scan to verify it." actions={<><Link className="btn-ghost" href="/x/doc_templates">Templates</Link><Link className="btn-ghost" href="/x/stored_documents">Document library</Link></>}>
      <div className="grid gap-4 lg:grid-cols-3">
        {can && <div className="space-y-4"><Card title="Issue a document"><form action={issue} className="space-y-3 p-4">
          <Field label="Student"><select name="student_id" className="input" defaultValue={sp.student ?? ''} required><option value="">Choose</option>{(studs ?? []).map((s) => <option key={s.id} value={s.id}>{fullName(s)} · {s.admission_no}</option>)}</select></Field>
          <Field label="Template"><select name="template_id" className="input" required>{(tpls ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Reason or details (if the template uses it)"><input name="reason" className="input" /></Field><button className="btn w-full">Generate</button></form></Card>
          {sp.student && check && <Card title="Clearance for TC / no dues"><ul className="divide-y divide-line text-sm">{check.map((c) => <li key={c.item} className="flex justify-between px-4 py-2"><span>{c.item}</span><span>{c.ok ? <Badge tone="green">clear</Badge> : <Badge tone="red">pending</Badge>} <span className="text-xs text-muted">{c.note}</span></span></li>)}</ul>
            <form action={requestTc} className="space-y-2 border-t border-line p-4"><input type="hidden" name="student_id" value={sp.student} /><input name="reason" className="input" placeholder="Reason for leaving" required aria-label="Reason" /><button className="btn-ghost w-full">Request TC approval from principal</button></form></Card>}
          <Card title="APAAR ID collection"><div className="p-4 text-sm">{withId} of {(apaar ?? []).length} active students have an APAAR ID. <Link className="link" href="/reports/statutory">Export the missing list</Link></div></Card></div>}
        <Card title="Recently issued" className={can ? 'lg:col-span-2' : 'lg:col-span-3'}>{(issued ?? []).length === 0 ? <Empty title="Nothing issued yet" hint="Bonafide, study, conduct, no-dues, fee and transfer certificates, achievement certificates and ID cards." /> : <table className="tbl"><thead><tr><th>Number</th><th>Document</th><th>Student</th><th>Issued</th><th>Status</th></tr></thead>
          <tbody>{(issued as unknown as { id: string; number: string; title: string; status: string; issued_on: string; student: { first_name: string; last_name: string } | null }[]).map((d) => <tr key={d.id}><td><Link className="link font-medium" href={`/documents/${d.id}`}>{d.number}</Link></td><td>{d.title}</td><td>{fullName(d.student)}</td><td>{fdate(d.issued_on)}</td><td><Badge>{d.status}</Badge></td></tr>)}</tbody></table>}</Card>
      </div>
    </Page>
  );
}
