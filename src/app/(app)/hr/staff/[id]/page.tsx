import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { fullName, fdate, inr, pct, go, str } from '@/lib/fmt';
import { leaveBalance } from '@/lib/rules/payroll';

async function toggleChecklist(fd: FormData) {
  'use server';
  const ctx = await requireCap('staff', 'write');
  const id = str(fd, 'staff')!, key = str(fd, 'key')!;
  const { data: c } = await ctx.sb.from('onboarding_checklists').select('id, items').eq('staff_id', id).maybeSingle();
  const items = { ...((c?.items ?? {}) as Record<string, boolean>) }; items[key] = !items[key];
  const completed = Object.values(items).every(Boolean);
  if (c) await ctx.sb.from('onboarding_checklists').update({ items, completed }).eq('id', c.id); else await ctx.sb.from('onboarding_checklists').insert({ staff_id: id, items: { [key]: true } });
  go(`/hr/staff/${id}`, 'Checklist updated.');
}

/** Staff 360 (HR-01): profile, assignments, attendance, leave, payroll, appraisals, training and feedback on one page. */
export default async function Staff360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCap('staff');
  const sb = ctx.sb;
  const { data: s } = await sb.from('staff').select('*, manager:staff!staff_reporting_to_fkey(first_name, last_name)').eq('id', id).maybeSingle();
  if (!s) notFound();
  const pay = ctx.can('payroll');
  const [ta, att, lv, bal, lt, sal, slips, app, tr, fb, ob, docs, obs] = await Promise.all([
    sb.from('teacher_assignments').select('id, periods_per_week, section:sections!teacher_assignments_section_id_fkey(name), subject:subjects!teacher_assignments_subject_id_fkey(name)').eq('staff_id', id),
    sb.from('attendance').select('status').eq('staff_id', id).gte('date', ctx.year?.start_date ?? '2000-01-01'),
    sb.from('leave_requests').select('id, from_date, to_date, days, status, leave_type_id, reason').eq('staff_id', id).order('from_date', { ascending: false }).limit(20),
    sb.from('leave_balances').select('leave_type_id, allotted, carried').eq('staff_id', id).eq('year_id', ctx.year?.id ?? ''),
    sb.from('leave_types').select('id, name, annual_quota').eq('applies_to', 'staff'),
    pay ? sb.from('salary_structures').select('*').eq('staff_id', id).eq('active', true).order('effective_from', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    pay ? sb.from('payslips').select('id, month, net').eq('staff_id', id).order('month', { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
    sb.from('appraisals').select('id, cycle, rating, status').eq('staff_id', id), sb.from('training_attendance').select('id, training:trainings!training_attendance_training_id_fkey(title, hours)').eq('staff_id', id),
    sb.from('staff_feedback').select('id, type, note, date').eq('staff_id', id).order('date', { ascending: false }).limit(6),
    sb.from('onboarding_checklists').select('items, completed').eq('staff_id', id).maybeSingle(),
    ctx.can('documents') ? sb.from('stored_documents').select('id, doc_type, expiry_date, verified').eq('staff_id', id) : Promise.resolve({ data: [] }),
    ctx.can('learning') ? sb.from('classroom_observations').select('id, date, score').eq('staff_id', id).order('date', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const a = att.data ?? []; const present = a.filter((x) => !['A', 'LV'].includes(x.status)).length;
  const used = (t: string) => (lv.data ?? []).filter((l) => l.leave_type_id === t && l.status === 'approved').reduce((x, l) => x + Number(l.days), 0);
  const items = (ob.data?.items ?? { profile: false, documents: false, bank_details: false, payroll: false, subjects_and_sections: false, timetable: false, devices: false, app_login: false, handbook_acknowledged: false }) as Record<string, boolean>;
  const can = ctx.can('staff', 'write');
  const base = `/hr/staff/${id}`;
  const TA = (ta.data ?? []) as unknown as { id: string; periods_per_week: number; section: { name: string } | null; subject: { name: string } | null }[];
  const hours = ((tr.data ?? []) as unknown as { training: { hours: number } | null }[]).reduce((t, x) => t + Number(x.training?.hours ?? 0), 0);
  return (
    <Page title={fullName(s)} sub={<>{s.designation ?? 'Staff'} · {s.department ?? ''} · <Badge>{s.status}</Badge>{s.manager ? ` · reports to ${fullName(s.manager)}` : ''}</>}
      actions={<>{can && <Link className="btn-ghost" href={`/x/staff/${id}?back=${base}`}>Edit profile</Link>}{can && !s.user_id && <Link className="btn" href={`/admin/users?invite_staff=${id}&email=${encodeURIComponent(s.email ?? '')}&name=${encodeURIComponent(fullName(s))}`}>Invite to the app</Link>}</>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Attendance this year" value={a.length ? `${pct(present, a.length)}%` : '—'} hint={`${a.length - present} days away`} />
        <Stat label="Teaching load" value={`${TA.reduce((t, x) => t + x.periods_per_week, 0)} / week`} hint={`${TA.length} class-subject assignments`} />
        <Stat label="Training hours" value={hours} /><Stat label="Joined" value={fdate(s.joining_date)} hint={s.emp_code ?? ''} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Onboarding checklist">{<ul className="divide-y divide-line text-sm">{Object.entries(items).map(([k, v]) => <li key={k} className="flex items-center justify-between px-4 py-2"><span className={v ? 'text-muted line-through' : ''}>{k.replace(/_/g, ' ')}</span>{can ? <form action={toggleChecklist}><input type="hidden" name="staff" value={id} /><input type="hidden" name="key" value={k} /><button className="btn-ghost btn-sm">{v ? 'Undo' : 'Done'}</button></form> : v ? <Badge tone="green">done</Badge> : null}</li>)}</ul>}</Card>
        <Card title="Classes and subjects" actions={ctx.can('timetable', 'write') ? <Link className="link text-sm" href={`/x/teacher_assignments/new?staff_id=${id}&back=${base}`}>Add</Link> : undefined}>{TA.length === 0 ? <Empty title="No teaching assignments" /> : <ul className="divide-y divide-line text-sm">{TA.map((t) => <li key={t.id} className="flex justify-between px-4 py-2"><span>{t.section?.name} · {t.subject?.name}</span><span className="text-muted">{t.periods_per_week}/wk</span></li>)}</ul>}</Card>
        <Card title="Leave balances" actions={ctx.can('leave', 'write') ? <Link className="link text-sm" href={`/hr/leave?staff=${id}`}>Apply for them</Link> : undefined}><ul className="divide-y divide-line text-sm">{(lt.data ?? []).filter((t) => Number(t.annual_quota) > 0).map((t) => { const b = (bal.data ?? []).find((x) => x.leave_type_id === t.id); return <li key={t.id} className="flex justify-between px-4 py-2"><span>{t.name}</span><span>{leaveBalance(Number(b?.allotted ?? t.annual_quota), Number(b?.carried ?? 0), used(t.id))} left <span className="text-muted">of {Number(b?.allotted ?? t.annual_quota) + Number(b?.carried ?? 0)}</span></span></li>; })}</ul></Card>
        {pay && <Card title="Salary" actions={ctx.can('payroll', 'write') ? <Link className="link text-sm" href={sal.data ? `/x/salary_structures/${sal.data.id}?back=${base}` : `/x/salary_structures/new?staff_id=${id}&back=${base}`}>{sal.data ? 'Edit' : 'Set structure'}</Link> : undefined}>
          {!sal.data ? <Empty title="No salary structure" hint="Set one so this person is included in the payroll run." /> : <dl className="grid grid-cols-2 gap-2 p-4 text-sm">{[['Basic', sal.data.basic], ['HRA', sal.data.hra], ['DA', sal.data.da], ['Special', sal.data.special_allowance], ['Other', sal.data.other_allowance]].map(([k, v]) => <div key={String(k)}><dt className="text-xs text-muted">{k}</dt><dd>{inr(v as number)}</dd></div>)}<div><dt className="text-xs text-muted">Statutory</dt><dd>{[sal.data.pf_applicable && 'PF', sal.data.esi_applicable && 'ESI', sal.data.pt_applicable && 'PT'].filter(Boolean).join(', ')}</dd></div></dl>}
          {(slips.data ?? []).length > 0 && <ul className="divide-y divide-line border-t border-line text-sm">{slips.data!.map((p) => <li key={p.id} className="flex justify-between px-4 py-2"><Link className="link" href={`/payslip/${p.id}`}>{String(p.month).slice(0, 7)}</Link><span>{inr(p.net)}</span></li>)}</ul>}
          {ctx.can('payroll', 'write') && <div className="border-t border-line px-4 py-2 text-xs"><Link className="link" href={`/x/staff_sensitive/new?staff_id=${id}&back=${base}`}>Bank and statutory IDs</Link> · <Link className="link" href={`/x/payroll_adjustments/new?staff_id=${id}&back=${base}`}>Add bonus / arrears</Link> · <Link className="link" href={`/x/staff_loans/new?staff_id=${id}&back=${base}`}>Loan / advance</Link></div>}</Card>}
        <Card title="Performance and development" actions={can ? <Link className="link text-sm" href={`/x/appraisals/new?staff_id=${id}&back=${base}`}>New appraisal</Link> : undefined}><ul className="divide-y divide-line text-sm">
          {(app.data ?? []).map((x) => <li key={x.id} className="flex justify-between px-4 py-2"><Link className="link" href={`/x/appraisals/${x.id}?back=${base}`}>{x.cycle}</Link><span>{x.rating ?? '—'} <Badge>{x.status}</Badge></span></li>)}
          {(obs.data ?? []).map((o) => <li key={o.id} className="flex justify-between px-4 py-2"><span>Classroom observation · {fdate(o.date)}</span><span>{o.score ?? '—'}</span></li>)}
          {(app.data ?? []).length + (obs.data ?? []).length === 0 && <li className="px-4 py-3 text-muted">No appraisals or observations yet.</li>}</ul></Card>
        <Card title="Documents and feedback" actions={can ? <Link className="link text-sm" href={`/x/staff_feedback/new?staff_id=${id}&back=${base}`}>Add feedback</Link> : undefined}><ul className="divide-y divide-line text-sm">
          {(docs.data ?? []).map((d) => <li key={d.id} className="flex justify-between px-4 py-2"><span>{d.doc_type}</span><span className="text-muted">{d.expiry_date ? `expires ${fdate(d.expiry_date)}` : d.verified ? 'verified' : 'not verified'}</span></li>)}
          {(fb.data ?? []).map((f) => <li key={f.id} className="px-4 py-2"><Badge tone={f.type === 'praise' ? 'green' : f.type === 'complaint' ? 'red' : 'blue'}>{f.type}</Badge> {f.note}</li>)}
          {(docs.data ?? []).length + (fb.data ?? []).length === 0 && <li className="px-4 py-3 text-muted">Nothing recorded.</li>}</ul>
          {can && <div className="border-t border-line px-4 py-2 text-xs"><Link className="link" href={`/x/stored_documents/new?owner_type=staff&staff_id=${id}&back=${base}`}>Add a document</Link> · <Link className="link" href={`/x/staff_exits/new?staff_id=${id}&back=${base}`}>Start exit</Link></div>}</Card>
      </div>
    </Page>
  );
}
