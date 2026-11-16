'use server';
import { getCtx } from '@/lib/ctx';
import { go, str, numv, today, inr } from '@/lib/fmt';
import { balance, billable, lateFine, type Demand, type FineRule } from '@/lib/rules/fees';

export async function collectFee(fd: FormData) {
  const ctx = await getCtx();
  const student = str(fd, 'student')!;
  const allocations = [...fd.entries()].filter(([k, v]) => k.startsWith('a_') && Number(v) > 0).map(([k, v]) => ({ demand_id: k.slice(2), amount: Number(v) }));
  const total = allocations.reduce((t, a) => t + a.amount, 0);
  const payments = [1, 2, 3].map((n) => ({ mode: str(fd, `mode${n}`), amount: numv(fd, `amount${n}`), reference: str(fd, `ref${n}`), cheque_no: str(fd, `cheque_no${n}`), cheque_bank: str(fd, `cheque_bank${n}`), cheque_date: str(fd, `cheque_date${n}`) })).filter((p) => p.mode && (p.amount ?? 0) > 0);
  // A single mode with no amount typed means "the whole bill in this mode".
  if (payments.length === 0 && str(fd, 'mode1')) payments.push({ mode: str(fd, 'mode1'), amount: total, reference: str(fd, 'ref1'), cheque_no: str(fd, 'cheque_no1'), cheque_bank: str(fd, 'cheque_bank1'), cheque_date: str(fd, 'cheque_date1') });
  const { data, error } = await ctx.sb.rpc('collect_fee', { p: { allocations, payments, date: str(fd, 'date') ?? today(), note: str(fd, 'note'), idempotency_key: str(fd, 'key') } });
  if (error) go(`/fees/counter?student=${student}`, error.message, 'err');
  const ids = (data as { receipt_ids: string[]; duplicate: boolean }).receipt_ids;
  go(`/receipt/${ids.join(',')}`, (data as { duplicate: boolean }).duplicate ? 'This payment was already saved. Showing the existing receipt.' : `Receipt issued for ${inr(total)}.`);
}

export async function savePlan(fd: FormData) {
  const ctx = await getCtx();
  const { data, error } = await ctx.sb.from('fee_plans').insert({ name: str(fd, 'name'), programme_id: str(fd, 'programme_id'), category: str(fd, 'category'), year_id: ctx.year?.id, branch_id: ctx.branchId ?? ctx.branches[0]?.id }).select('id').single();
  go(error ? '/fees/structure' : `/fees/structure?plan=${data!.id}`, error ? error.message : 'Plan created. Add its instalments.', error ? 'err' : 'ok');
}
export async function savePlanItem(fd: FormData) {
  const ctx = await getCtx();
  const plan = str(fd, 'plan_id')!;
  const { error } = await ctx.sb.from('fee_plan_items').insert({ plan_id: plan, head_id: str(fd, 'head_id'), instalment: str(fd, 'instalment'), amount: numv(fd, 'amount'), due_date: str(fd, 'due_date') });
  go(`/fees/structure?plan=${plan}`, error ? error.message : 'Instalment added.', error ? 'err' : 'ok');
}
export async function deletePlanItem(fd: FormData) {
  const ctx = await getCtx();
  const plan = str(fd, 'plan_id')!;
  const { count } = await ctx.sb.from('fee_demands').select('id', { count: 'exact', head: true }).eq('plan_item_id', str(fd, 'id')!);
  if (count) go(`/fees/structure?plan=${plan}`, 'Demands were already raised from this instalment, so it cannot be removed.', 'err');
  await ctx.sb.from('fee_plan_items').delete().eq('id', str(fd, 'id')!);
  go(`/fees/structure?plan=${plan}`, 'Removed.');
}

/** Raise demands from a plan for every active student it applies to, or one student. Re-running never duplicates (FEE-02). */
export async function generateDemands(fd: FormData) {
  const ctx = await getCtx();
  const planId = str(fd, 'plan_id')!, only = str(fd, 'student_id');
  const { data: plan } = await ctx.sb.from('fee_plans').select('*').eq('id', planId).single();
  const { data: items } = await ctx.sb.from('fee_plan_items').select('*').eq('plan_id', planId);
  if (!plan || !items?.length) go(`/fees/structure?plan=${planId}`, 'Add instalments to the plan first.', 'err');
  let q = ctx.sb.from('students').select('id, branch_id, joined_on, programme_id').eq('status', 'active');
  if (only) q = q.eq('id', only);
  else { if (plan!.programme_id) q = q.eq('programme_id', plan!.programme_id); if (plan!.branch_id) q = q.eq('branch_id', plan!.branch_id); }
  const { data: students } = await q.limit(10000);
  const ids = (students ?? []).map((s) => s.id);
  if (!ids.length) go(`/fees/structure?plan=${planId}`, 'No active students match this plan.', 'err');
  const { data: existing } = await ctx.sb.from('fee_demands').select('student_id, plan_item_id').in('plan_item_id', items!.map((i) => i.id)).in('student_id', ids);
  const have = new Set((existing ?? []).map((e) => `${e.student_id}:${e.plan_item_id}`));
  const rows = (students ?? []).flatMap((s) => items!.filter((i) => !have.has(`${s.id}:${i.id}`) && billable(i.due_date, s.joined_on)).map((i) => ({
    student_id: s.id, branch_id: s.branch_id, year_id: plan!.year_id, head_id: i.head_id, plan_item_id: i.id, label: `${plan!.name} · ${i.instalment}`, amount: i.amount, due_date: i.due_date })));
  for (let i = 0; i < rows.length; i += 500) { const { error } = await ctx.sb.from('fee_demands').insert(rows.slice(i, i + 500)); if (error) go(`/fees/structure?plan=${planId}`, error.message, 'err'); }
  // Approved concessions apply to the new demands as well.
  go(only ? `/students/${only}?tab=fees` : `/fees/structure?plan=${planId}`, `${rows.length} fee demands raised for ${ids.length} students. Students who left or joined later are skipped by rule.`);
}

export async function addDemand(fd: FormData) {
  const ctx = await getCtx();
  const student = str(fd, 'student_id')!;
  const { data: s } = await ctx.sb.from('students').select('branch_id').eq('id', student).single();
  const { error } = await ctx.sb.from('fee_demands').insert({ student_id: student, branch_id: s?.branch_id, year_id: ctx.year?.id, head_id: str(fd, 'head_id'), label: str(fd, 'label'), amount: numv(fd, 'amount'), due_date: str(fd, 'due_date') ?? today() });
  go(`/fees/counter?student=${student}`, error ? error.message : 'Fee added.', error ? 'err' : 'ok');
}

export async function applyLateFees() {
  const ctx = await getCtx();
  const rule = ((ctx.org.settings ?? {}) as { late_fee?: FineRule }).late_fee ?? { type: 'none' };
  if (rule.type === 'none') go('/fees/dues', 'No late-fee rule is set. Set one in Admin console → Fee settings.', 'err');
  const d = today();
  const { data } = await ctx.sb.from('fee_demands').select('id, amount, concession, fine, paid, due_date').in('status', ['due', 'partial']).lt('due_date', d).limit(10000);
  let n = 0;
  for (const dem of (data ?? []) as Demand[]) {
    const fine = lateFine(dem, d, rule);
    if (fine !== Number(dem.fine)) { await ctx.sb.from('fee_demands').update({ fine }).eq('id', dem.id); n++; }
  }
  go('/fees/dues', `Late fees updated on ${n} instalments.`);
}

export async function logFollowup(fd: FormData) {
  const ctx = await getCtx();
  const student = str(fd, 'student_id')!;
  const type = str(fd, 'type') ?? 'call';
  await ctx.sb.from('fee_followups').insert({ student_id: student, type, note: str(fd, 'note'), promise_date: str(fd, 'promise_date'), promise_amount: numv(fd, 'promise_amount'), by_name: ctx.name });
  if (type === 'message') {
    const { data: s } = await ctx.sb.from('students').select('first_name, household_id').eq('id', student).single();
    const { data: gs } = await ctx.sb.from('guardians').select('user_id, phone, whatsapp_opt_in').eq('household_id', s?.household_id ?? '');
    const amount = str(fd, 'amount');
    const notes = (gs ?? []).filter((g) => g.user_id).map((g) => ({ org_id: ctx.org.id, user_id: g.user_id, title: `Fee reminder for ${s?.first_name}`, body: `Rs ${amount} is pending. You can pay in the app.`, link: '/parent/fees', kind: 'fees' }));
    if (notes.length) await ctx.sb.from('notifications').insert(notes);
    const out = (gs ?? []).filter((g) => g.phone && g.whatsapp_opt_in).map((g) => ({ channel: 'whatsapp', to_address: g.phone, event_key: 'fee_due', student_id: student, body: `Fee reminder: Rs ${amount} is pending for ${s?.first_name}.`, dedupe_key: `fee:${student}:${today()}:${g.phone}` }));
    if (out.length) await ctx.sb.from('outbox').upsert(out, { onConflict: 'dedupe_key', ignoreDuplicates: true }); // never two reminders for the same trigger
  }
  go('/fees/dues', type === 'message' ? 'Reminder sent.' : 'Follow-up logged.');
}

export async function requestReversal(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'id')!;
  const { data: r } = await ctx.sb.from('receipts').select('receipt_no, total, student_id').eq('id', id).single();
  const { error } = await ctx.sb.rpc('submit_approval', { p_type: 'receipt_reversal', p_object: id, p_title: `Cancel receipt ${r?.receipt_no}`, p_summary: str(fd, 'reason'), p_amount: r?.total, p_payload: { reason: str(fd, 'reason') }, p_student: r?.student_id, p_impact: `Rs ${Number(r?.total).toLocaleString('en-IN')} goes back to dues and a reversal voucher is posted.` });
  go(`/receipt/${id}`, error ? error.message : 'Cancellation sent for approval. The receipt stays valid until it is approved.', error ? 'err' : 'ok');
}

export async function chequeAction(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'id')!, action = str(fd, 'action');
  if (action === 'bounced') {
    const { error } = await ctx.sb.rpc('bounce_cheque', { p_payment: id, p_fine: numv(fd, 'fine') ?? 0 });
    go('/fees/cheques', error ? error.message : 'Cheque marked bounced. The receipt was reversed and the family notified.', error ? 'err' : 'ok');
  }
  const { error } = await ctx.sb.from('receipt_payments').update({ cheque_status: action, deposit_batch: action === 'deposited' ? `DEP-${today()}` : undefined }).eq('id', id);
  go('/fees/cheques', error ? error.message : 'Updated.', error ? 'err' : 'ok');
}

/** Bank statement lines pasted as CSV: date, description, amount, reference. Matches by reference and amount (FEE-08). */
export async function importBankLines(fd: FormData) {
  const ctx = await getCtx();
  const batch = `B-${Date.now()}`;
  const lines = (str(fd, 'csv') ?? '').split('\n').map((l) => l.split(',').map((c) => c.trim())).filter((c) => c.length >= 3 && !isNaN(Number(c[2])) && /^\d{4}-\d{2}-\d{2}$/.test(c[0]));
  if (!lines.length) go('/fees/reconciliation', 'No valid lines found. Use: 2026-06-10, description, 15000, reference', 'err');
  const { data: ins, error } = await ctx.sb.from('bank_lines').insert(lines.map((c) => ({ date: c[0], description: c[1], amount: Number(c[2]), reference: c[3] ?? null, import_batch: batch }))).select('id, amount, reference');
  if (error) go('/fees/reconciliation', error.message, 'err');
  const { data: pays } = await ctx.sb.from('receipt_payments').select('id, amount, reference, cheque_no, gateway_payment_id').is('bank_line_id', null).neq('mode', 'cash').limit(5000);
  let matched = 0;
  for (const l of ins ?? []) {
    if (!l.reference) continue;
    const hit = (pays ?? []).find((p) => Number(p.amount) === Number(l.amount) && [p.reference, p.cheque_no, p.gateway_payment_id].includes(l.reference));
    if (hit) { await ctx.sb.from('bank_lines').update({ status: 'matched', matched_payment_id: hit.id }).eq('id', l.id); await ctx.sb.from('receipt_payments').update({ bank_line_id: l.id }).eq('id', hit.id); hit.reference = null; hit.cheque_no = null; matched++; }
  }
  go('/fees/reconciliation', `${ins?.length} lines imported, ${matched} matched automatically.`);
}
export async function matchBankLine(fd: FormData) {
  const ctx = await getCtx();
  const line = str(fd, 'line')!, action = str(fd, 'action');
  if (action === 'ignore') await ctx.sb.from('bank_lines').update({ status: 'ignored' }).eq('id', line);
  else { const pay = str(fd, 'payment'); if (pay) { await ctx.sb.from('bank_lines').update({ status: 'matched', matched_payment_id: pay }).eq('id', line); await ctx.sb.from('receipt_payments').update({ bank_line_id: line }).eq('id', pay); } }
  go('/fees/reconciliation', 'Updated.');
}
void balance;
