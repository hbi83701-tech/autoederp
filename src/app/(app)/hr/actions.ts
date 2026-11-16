'use server';
import { getCtx } from '@/lib/ctx';
import { go, str, numv, today } from '@/lib/fmt';
import { computePayslip, type Structure } from '@/lib/rules/payroll';
import { countWorking, addDays } from '@/lib/calendar';

const dayCount = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export async function applyLeave(fd: FormData) {
  const ctx = await getCtx();
  const staffId = str(fd, 'staff_id') ?? (ctx.profile.staff_id as string | null);
  const back = str(fd, 'back') ?? '/me';
  if (!staffId) go(back, 'Your login is not linked to a staff record. Ask your admin to link it.', 'err');
  const from = str(fd, 'from_date')!, to = str(fd, 'to_date') ?? from;
  if (to < from) go(back, 'The end date is before the start date.', 'err');
  const half = fd.get('half_day') === 'on';
  const days = half ? 0.5 : dayCount(from, to);
  const { data: lr, error } = await ctx.sb.from('leave_requests').insert({ person_type: 'staff', staff_id: staffId, leave_type_id: str(fd, 'leave_type_id'), from_date: from, to_date: to, half_day: half, days, reason: str(fd, 'reason') }).select('id').single();
  if (error) go(back, error.message, 'err');
  const { data: st } = await ctx.sb.from('staff').select('first_name, last_name').eq('id', staffId!).single();
  // Show the approver the impact: how many class periods are affected (journey "Staff leave and cover").
  const { count } = await ctx.sb.from('timetable_entries').select('id', { count: 'exact', head: true }).eq('staff_id', staffId!);
  const perDay = Math.round((count ?? 0) / 6);
  await ctx.sb.rpc('submit_approval', { p_type: 'leave', p_object: lr!.id, p_title: `Leave: ${st?.first_name} ${st?.last_name ?? ''} · ${from}${to !== from ? ` to ${to}` : ''}`, p_summary: str(fd, 'reason'), p_impact: `${days} day${days === 1 ? '' : 's'}. About ${Math.round(perDay * days)} class periods need cover; the planner will suggest substitutes on approval.` });
  go(back, 'Leave request sent for approval.');
}

export async function regularise(fd: FormData) {
  const ctx = await getCtx();
  const staffId = ctx.profile.staff_id as string | null;
  if (!staffId) go('/me', 'Your login is not linked to a staff record.', 'err');
  const { data, error } = await ctx.sb.from('attendance_regularisations').insert({ staff_id: staffId, date: str(fd, 'date'), requested_status: str(fd, 'requested_status') ?? 'P', reason: str(fd, 'reason') }).select('id').single();
  if (error) go('/me', error.message, 'err');
  await ctx.sb.rpc('submit_approval', { p_type: 'regularisation', p_object: data!.id, p_title: `Attendance regularisation · ${ctx.name} · ${str(fd, 'date')}`, p_summary: str(fd, 'reason') });
  go('/me', 'Regularisation request sent.');
}

/** Geo-tagged mobile check-in (ATT-07). The location is stored with the record for the geo-fence report. */
export async function checkIn(fd: FormData) {
  const ctx = await getCtx();
  const staffId = ctx.profile.staff_id as string | null;
  if (!staffId) go('/me', 'Your login is not linked to a staff record.', 'err');
  const d = today();
  const { data: ex } = await ctx.sb.from('attendance').select('id, check_in').eq('staff_id', staffId!).eq('date', d).eq('session', 'day').maybeSingle();
  const now = new Date().toISOString();
  if (ex) await ctx.sb.from('attendance').update({ check_out: now }).eq('id', ex.id);
  else await ctx.sb.from('attendance').insert({ person_type: 'staff', staff_id: staffId, date: d, session: 'day', status: 'P', source: 'mobile', check_in: now, lat: numv(fd, 'lat'), lng: numv(fd, 'lng') });
  go('/me', ex ? 'Checked out.' : 'Checked in. Have a good day.');
}

/** Monthly payroll run (HR-04): attendance and leave decide loss of pay; rules compute statutory deductions. */
export async function runPayroll(fd: FormData) {
  const ctx = await getCtx();
  const month = (str(fd, 'month') ?? today().slice(0, 7)) + '-01';
  const end = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10), -1);
  const branch = ctx.branchId ?? ctx.branches[0]?.id;
  const b = ctx.branches.find((x) => x.id === branch);
  const { data: existing } = await ctx.sb.from('payroll_runs').select('id, status').eq('month', month).eq('branch_id', branch ?? '').maybeSingle();
  if (existing && existing.status !== 'draft') go('/hr/payroll', 'This month is already locked. Corrections go into next month as arrears.', 'err');
  const [{ data: staff }, { data: structs }, { data: att }, { data: hol }, { data: loans }, { data: adj }, { data: lts }, { data: leaves }] = await Promise.all([
    ctx.sb.from('staff').select('id, joining_date').eq('status', 'active').eq('branch_id', branch ?? ''),
    ctx.sb.from('salary_structures').select('*').eq('active', true).order('effective_from', { ascending: false }),
    ctx.sb.from('attendance').select('staff_id, status, date').eq('person_type', 'staff').gte('date', month).lte('date', end).limit(50000),
    ctx.sb.from('calendar_events').select('start_date, end_date').eq('type', 'holiday'),
    ctx.sb.from('staff_loans').select('*').eq('status', 'active'), ctx.sb.from('payroll_adjustments').select('*').eq('month', month),
    ctx.sb.from('leave_types').select('id, paid'), ctx.sb.from('leave_requests').select('staff_id, leave_type_id, from_date, to_date, half_day').eq('person_type', 'staff').eq('status', 'approved').lte('from_date', end).gte('to_date', month),
  ]);
  const workingDays = countWorking(month, end, b?.working_days as string | undefined, hol ?? []);
  const unpaid = new Set((lts ?? []).filter((l) => !l.paid).map((l) => l.id));
  let run = existing?.id;
  if (!run) { const { data: r, error } = await ctx.sb.from('payroll_runs').insert({ month, branch_id: branch, working_days: workingDays }).select('id').single(); if (error) go('/hr/payroll', error.message, 'err'); run = r!.id; }
  await ctx.sb.from('payslips').delete().eq('run_id', run!);
  const slips = []; let tg = 0, td = 0, tn = 0, skipped = 0;
  for (const s of staff ?? []) {
    const st = (structs ?? []).find((x) => x.staff_id === s.id && x.effective_from <= end) as (Structure & { staff_id: string }) | undefined;
    if (!st) { skipped++; continue; }
    const mine = (att ?? []).filter((a) => a.staff_id === s.id);
    let lop = mine.filter((a) => a.status === 'A').length;
    for (const l of (leaves ?? []).filter((x) => x.staff_id === s.id && unpaid.has(x.leave_type_id))) lop += l.half_day ? 0.5 : dayCount(l.from_date < month ? month : l.from_date, l.to_date > end ? end : l.to_date);
    const a = (type: string) => (adj ?? []).filter((x) => x.staff_id === s.id && x.type === type).reduce((t, x) => t + Number(x.amount), 0);
    const emi = (loans ?? []).filter((l) => l.staff_id === s.id).reduce((t, l) => t + Math.min(Number(l.emi), Number(l.balance)), 0);
    const p = computePayslip({ basic: Number(st.basic), hra: Number(st.hra), da: Number(st.da), special_allowance: Number(st.special_allowance), other_allowance: Number(st.other_allowance), pf_applicable: st.pf_applicable, esi_applicable: st.esi_applicable, pt_applicable: st.pt_applicable, tds_monthly: Number(st.tds_monthly) },
      { workingDays, lopDays: lop, bonus: a('bonus'), arrears: a('arrears'), reimbursement: a('reimbursement'), otherDeduction: a('deduction'), loanEmi: emi, state: ctx.org.state ?? 'Telangana' });
    slips.push({ run_id: run, staff_id: s.id, month, working_days: workingDays, paid_days: p.paidDays, lop_days: p.lopDays, earnings: p.earnings, deductions: p.deductions, gross: p.gross, total_deductions: p.totalDeductions, net: p.net, employer_pf: p.employerPf, employer_esi: p.employerEsi });
    tg += p.gross; td += p.totalDeductions; tn += p.net;
  }
  if (slips.length) { const { error } = await ctx.sb.from('payslips').insert(slips); if (error) go('/hr/payroll', error.message, 'err'); }
  await ctx.sb.from('payroll_runs').update({ working_days: workingDays, total_gross: tg, total_deductions: td, total_net: tn }).eq('id', run!);
  go(`/hr/payroll?run=${run}`, `Payroll computed for ${slips.length} staff.${skipped ? ` ${skipped} skipped because they have no salary structure.` : ''} Review, then lock.`);
}

export async function lockPayroll(fd: FormData) {
  const ctx = await getCtx();
  const run = str(fd, 'run')!;
  const { data: r } = await ctx.sb.from('payroll_runs').select('*').eq('id', run).single();
  if (!r || r.status !== 'draft') go('/hr/payroll', 'This run is already locked.', 'err');
  const { error } = await ctx.sb.from('payroll_runs').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', run);
  if (error) go(`/hr/payroll?run=${run}`, error.message, 'err');
  // Recover loans, mark adjustments applied, post the salary voucher, tell staff.
  const [{ data: slips }, { data: loans }] = await Promise.all([ctx.sb.from('payslips').select('staff_id, deductions').eq('run_id', run), ctx.sb.from('staff_loans').select('*').eq('status', 'active')]);
  for (const s of slips ?? []) { const emi = Number((s.deductions as Record<string, number>)['Loan / advance recovery'] ?? 0); if (!emi) continue; let left = emi;
    for (const l of (loans ?? []).filter((x) => x.staff_id === s.staff_id)) { const take = Math.min(left, Number(l.balance)); if (take <= 0) continue; await ctx.sb.from('staff_loans').update({ balance: Number(l.balance) - take, status: Number(l.balance) - take <= 0 ? 'closed' : 'active' }).eq('id', l.id); left -= take; } }
  await ctx.sb.from('payroll_adjustments').update({ applied: true }).eq('month', r!.month);
  const { data: acc } = await ctx.sb.from('accounts').select('id, code').in('code', ['5000', '1010', '2100']);
  const A = (c: string) => acc?.find((a) => a.code === c)?.id;
  if (ctx.can('accounting', 'write') && A('5000') && A('1010') && A('2100')) {
    const { data: v } = await ctx.sb.from('vouchers').insert({ voucher_no: `PAY-${String(r!.month).slice(0, 7)}`, date: today(), type: 'journal', narration: `Salaries for ${String(r!.month).slice(0, 7)}`, ref_type: 'payroll_run', ref_id: run, branch_id: r!.branch_id }).select('id').single();
    if (v) await ctx.sb.from('voucher_lines').insert([{ voucher_id: v.id, account_id: A('5000'), debit: r!.total_gross, branch_id: r!.branch_id }, { voucher_id: v.id, account_id: A('1010'), credit: r!.total_net, branch_id: r!.branch_id }, { voucher_id: v.id, account_id: A('2100'), credit: r!.total_deductions, branch_id: r!.branch_id }]);
  }
  const { data: users } = await ctx.sb.from('profiles').select('id, staff_id').in('staff_id', (slips ?? []).map((s) => s.staff_id));
  if (users?.length) await ctx.sb.from('notifications').insert(users.map((u) => ({ org_id: ctx.org.id, user_id: u.id, title: `Payslip for ${String(r!.month).slice(0, 7)} is ready`, link: '/me', kind: 'payroll' })));
  go(`/hr/payroll?run=${run}`, 'Payroll locked. Payslips are in the staff app and the bank file is ready to download.');
}
