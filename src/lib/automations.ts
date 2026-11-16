import type { Ctx } from './ctx';
import { today } from './fmt';
import { addDays, workingDay } from './calendar';
import { reminderStep, balance, type Demand } from './rules/fees';

type Result = { recipe: string; detail: string };
/**
 * Time-based recipes (Appendix C). They run when a leader opens the automations page or presses "Run now"; each one
 * is idempotent for the day, so pressing twice never sends two reminders (WF-05).
 */
export async function runRecipes(ctx: Ctx, only?: string): Promise<Result[]> {
  const sb = ctx.sb, d = today(), out: Result[] = [];
  const { data: autos } = await sb.from('automations').select('*').eq('enabled', true);
  const on = (key: string) => (autos ?? []).some((a) => a.recipe_key === key) && (!only || only === key);
  const test = (key: string) => (autos ?? []).find((a) => a.recipe_key === key)?.test_mode === true;
  const notify = async (users: string[], title: string, body: string, link: string, key: string) => {
    const uniq = [...new Set(users.filter(Boolean))]; if (!uniq.length || test(key)) return uniq.length;
    const { data: sent } = await sb.from('notifications').select('user_id').eq('title', title).gte('created_at', d + 'T00:00:00+05:30').in('user_id', uniq);
    const skip = new Set((sent ?? []).map((s) => s.user_id)); const rows = uniq.filter((u) => !skip.has(u)).map((u) => ({ org_id: ctx.org.id, user_id: u, title, body, link, kind: 'automation' }));
    if (rows.length) await sb.from('notifications').insert(rows); return rows.length;
  };
  const usersOf = async (roles: string[]) => ((await sb.from('profiles').select('id').in('role', roles).eq('active', true)).data ?? []).map((p) => p.id);
  const wd = await workingDay(ctx, d);

  if (on('attendance_not_marked') && wd.working) {
    const [{ data: secs }, { data: subs }] = await Promise.all([sb.from('sections').select('id, name, class_teacher_id').eq('year_id', ctx.year?.id ?? ''), sb.from('attendance_submissions').select('section_id').eq('date', d)]);
    const marked = new Set((subs ?? []).map((s) => s.section_id)); const missing = (secs ?? []).filter((s) => !marked.has(s.id));
    const { data: profs } = await sb.from('profiles').select('id, staff_id').in('staff_id', missing.map((m) => m.class_teacher_id).filter(Boolean) as string[]);
    let n = 0; for (const m of missing) n += await notify((profs ?? []).filter((p) => p.staff_id === m.class_teacher_id).map((p) => p.id), `Attendance not marked: ${m.name}`, 'Please mark attendance now.', `/attendance/roll/${m.id}`, 'attendance_not_marked');
    if (missing.length) await notify(await usersOf(['coordinator']), `${missing.length} sections have not marked attendance`, missing.slice(0, 8).map((m) => m.name).join(', '), '/attendance', 'attendance_not_marked');
    out.push({ recipe: 'Attendance not marked', detail: `${missing.length} sections unmarked, ${n} teachers nudged` });
  }
  if (on('fee_reminder_ladder')) {
    const { data: dem } = await sb.from('fee_demands').select('id, student_id, amount, concession, fine, paid, due_date, label, student:students!fee_demands_student_id_fkey(first_name, household_id, status)').in('status', ['due', 'partial']).gte('due_date', addDays(d, -15)).lte('due_date', addDays(d, 7)).limit(20000);
    const D = (dem ?? []) as unknown as (Demand & { student_id: string; label: string; student: { first_name: string; household_id: string; status: string } | null })[];
    const hits = D.filter((x) => x.student?.status === 'active' && reminderStep(x.due_date, d) && balance(x) > 0);
    const { data: gs } = await sb.from('guardians').select('household_id, user_id').in('household_id', [...new Set(hits.map((h) => h.student?.household_id).filter(Boolean))] as string[]).not('user_id', 'is', null);
    let n = 0, calls = 0;
    for (const h of hits) { const step = reminderStep(h.due_date, d)!;
      if (step === 'call_15') { if (!test('fee_reminder_ladder')) { const { data: ex } = await sb.from('fee_followups').select('id').eq('student_id', h.student_id).eq('type', 'note').eq('note', `Call task: ${h.label} is 15 days overdue`).limit(1); if (!ex?.length) await sb.from('fee_followups').insert({ student_id: h.student_id, type: 'note', note: `Call task: ${h.label} is 15 days overdue`, by_name: 'Automation' }); } calls++; continue; }
      n += await notify((gs ?? []).filter((g) => g.household_id === h.student?.household_id).map((g) => g.user_id), `Fee ${step.startsWith('before') ? 'due soon' : 'overdue'}: ${h.student?.first_name}`, `Rs ${Math.round(balance(h)).toLocaleString('en-IN')} for ${h.label}, due ${h.due_date}.`, '/parent/fees', 'fee_reminder_ladder'); }
    out.push({ recipe: 'Fee reminder ladder', detail: `${n} reminders, ${calls} call tasks. Reminders never restrict a child's attendance, classes or exams.` });
  }
  if (on('document_expiry')) {
    const soon = addDays(d, 30); const [{ data: v }, { data: st }, { data: docs }] = await Promise.all([sb.from('vehicles').select('reg_no, registration_expiry, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry').eq('active', true), sb.from('staff').select('first_name, last_name, licence_expiry').eq('status', 'active').not('licence_expiry', 'is', null).lte('licence_expiry', soon), sb.from('stored_documents').select('doc_type, expiry_date').not('expiry_date', 'is', null).lte('expiry_date', soon)]);
    const items: string[] = []; for (const x of v ?? []) for (const k of ['registration_expiry', 'fitness_expiry', 'insurance_expiry', 'permit_expiry', 'puc_expiry'] as const) if (x[k] && x[k]! <= soon) items.push(`${x.reg_no} ${k.replace('_expiry', '')} (${x[k]})`);
    for (const s of st ?? []) items.push(`${s.first_name} ${s.last_name ?? ''} licence (${s.licence_expiry})`); for (const x of docs ?? []) items.push(`${x.doc_type} (${x.expiry_date})`);
    if (items.length) await notify(await usersOf(['transport', 'hr', 'principal']), `${items.length} documents expire within 30 days`, items.slice(0, 6).join('; '), '/transport', 'document_expiry');
    out.push({ recipe: 'Document expiry', detail: `${items.length} documents expiring` });
  }
  if (on('marks_deadline')) {
    const { data: a } = await sb.from('assessments').select('id, name, staff_id, entry_deadline').eq('status', 'open').lte('entry_deadline', addDays(d, 2)).not('staff_id', 'is', null);
    const { data: profs } = await sb.from('profiles').select('id, staff_id').in('staff_id', (a ?? []).map((x) => x.staff_id));
    let n = 0; for (const x of a ?? []) n += await notify((profs ?? []).filter((p) => p.staff_id === x.staff_id).map((p) => p.id), `Marks due: ${x.name}`, `Entry deadline ${x.entry_deadline}.`, `/assessments/${x.id}`, 'marks_deadline');
    out.push({ recipe: 'Marks deadline', detail: `${(a ?? []).length} assessments due, ${n} reminders` });
  }
  if (on('homework_posting_check') && wd.working) {
    const { data: posts } = await sb.from('posts').select('section_id').gte('created_at', d + 'T00:00:00+05:30'); const { data: secs } = await sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '');
    const posted = new Set((posts ?? []).map((p) => p.section_id)); const quiet = (secs ?? []).filter((s) => !posted.has(s.id));
    if (quiet.length) await notify(await usersOf(['coordinator']), `${quiet.length} sections have no post today`, quiet.slice(0, 8).map((s) => s.name).join(', '), '/homework?tab=compliance', 'homework_posting_check');
    out.push({ recipe: 'Homework posting check', detail: `${quiet.length} sections without a post today` });
  }
  if (on('birthday_wishes')) {
    const md = d.slice(5); const { data: st } = await sb.from('students').select('first_name, household_id, dob').eq('status', 'active').not('dob', 'is', null).limit(20000); const b = (st ?? []).filter((s) => String(s.dob).slice(5) === md);
    const { data: gs } = await sb.from('guardians').select('household_id, user_id').in('household_id', b.map((x) => x.household_id).filter(Boolean) as string[]).not('user_id', 'is', null);
    let n = 0; for (const s of b) n += await notify((gs ?? []).filter((g) => g.household_id === s.household_id).map((g) => g.user_id), `Happy birthday, ${s.first_name}!`, `Warm wishes from everyone at ${ctx.org.name}.`, '/parent', 'birthday_wishes');
    out.push({ recipe: 'Birthday wishes', detail: `${b.length} birthdays, ${n} greetings` });
  }
  if (on('year_rollover_reminders') && d.slice(5, 7) === '03') { await notify(await usersOf(['group_admin', 'system_admin', 'principal']), 'Time to plan the year rollover', 'Checklist: promotion, fee plans, routes and timetable.', '/admin/rollover', 'year_rollover_reminders'); out.push({ recipe: 'Year rollover reminders', detail: 'Checklist sent to leadership' }); }
  // Service-level breaches (WF-06)
  const { data: late } = await sb.from('tickets').select('id, subject, owner_role').in('status', ['open', 'in_progress']).lt('sla_due', new Date().toISOString()).limit(200);
  if ((late ?? []).length && !only) { await notify(await usersOf(['principal']), `${late!.length} requests are past their SLA`, late!.slice(0, 5).map((t) => t.subject).join('; '), '/helpdesk', 'sla'); out.push({ recipe: 'SLA breach alert', detail: `${late!.length} requests escalated to the principal` }); }
  for (const r of out) { const a = (autos ?? []).find((x) => x.name === r.recipe); await sb.from('automation_runs').insert({ automation_id: a?.id ?? null, status: a?.test_mode ? 'test' : 'ok', detail: r.detail }); if (a) await sb.from('automations').update({ last_run_at: new Date().toISOString() }).eq('id', a.id); }
  return out;
}
