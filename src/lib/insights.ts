import type { Ctx } from './ctx';
import { today, pct } from './fmt';
import { addDays } from './calendar';
import { balance, type Demand } from './rules/fees';

export type Insight = { title: string; detail: string; href: string; tone: 'warn' | 'bad' | 'info' };
/** Insight cards (RPT-08): rule-based, each with a link to the records behind it. */
export async function insightCards(ctx: Ctx): Promise<Insight[]> {
  const d = today(), w1 = addDays(d, -7), w2 = addDays(d, -14), m1 = addDays(d, -30), m2 = addDays(d, -60);
  const sb = ctx.sb; const out: Insight[] = [];
  const [att, rec, asm, posts, con, dues, sections] = await Promise.all([
    sb.from('attendance').select('date, status, section_id').eq('person_type', 'student').eq('session', 'day').gte('date', w2).limit(100000),
    ctx.can('fees') ? sb.from('receipts').select('date, total').eq('status', 'valid').gte('date', m2).limit(50000) : Promise.resolve({ data: [] }),
    ctx.can('marks') ? sb.from('assessments').select('id, name, entry_deadline, staff:staff!assessments_staff_id_fkey(first_name, last_name)').eq('status', 'open').lt('entry_deadline', d).limit(500) : Promise.resolve({ data: [] }),
    sb.from('posts').select('section_id').gte('created_at', w1 + 'T00:00:00').limit(20000),
    ctx.can('concessions') ? sb.from('concessions').select('amount, approved_at').eq('status', 'approved').gte('approved_at', m2).limit(5000) : Promise.resolve({ data: [] }),
    ctx.can('fees') ? sb.from('fee_demands').select('amount, concession, fine, paid, due_date').in('status', ['due', 'partial']).lt('due_date', addDays(d, -60)).limit(20000) : Promise.resolve({ data: [] }),
    sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? ''),
  ]);
  const rate = (rows: { status: string }[]) => (rows.length ? pct(rows.filter((r) => !['A', 'LV'].includes(r.status)).length, rows.length) : null);
  const A = att.data ?? []; const now = rate(A.filter((a) => a.date >= w1)), before = rate(A.filter((a) => a.date < w1));
  if (now !== null && before !== null && before - now >= 3) out.push({ title: `Attendance dipped to ${now}%`, detail: `It was ${before}% the week before.`, href: '/reports/attendance?group=section', tone: 'warn' });
  for (const s of sections.data ?? []) { const r = rate(A.filter((a) => a.section_id === s.id && a.date >= w1)); if (r !== null && r < 80) out.push({ title: `${s.name}: attendance ${r}% this week`, detail: 'Below 80%. Check for illness or a pattern.', href: `/reports/attendance?section=${s.id}&group=student`, tone: 'warn' }); }
  const R = rec.data ?? []; const c1 = R.filter((r) => r.date >= m1).reduce((t, r) => t + Number(r.total), 0), c2 = R.filter((r) => r.date < m1).reduce((t, r) => t + Number(r.total), 0);
  if (c2 > 0 && c1 < c2 * 0.7) out.push({ title: 'Collections slowed', detail: `Rs ${Math.round(c1).toLocaleString('en-IN')} in the last 30 days against Rs ${Math.round(c2).toLocaleString('en-IN')} in the 30 before.`, href: '/reports/fees?group=date', tone: 'warn' });
  const old = (dues.data ?? []) as Demand[]; if (old.length) out.push({ title: `${old.length} instalments are more than 60 days overdue`, detail: `Rs ${Math.round(old.reduce((t, x) => t + balance(x), 0)).toLocaleString('en-IN')} outstanding.`, href: '/fees/dues?bucket=90%2B', tone: 'bad' });
  const late = (asm.data ?? []) as unknown as { staff: { first_name: string; last_name: string } | null }[];
  if (late.length) { const names = [...new Set(late.map((l) => l.staff ? `${l.staff.first_name} ${l.staff.last_name ?? ''}`.trim() : 'unassigned'))]; out.push({ title: `${late.length} assessments are past the marks deadline`, detail: `Teachers: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' and others' : ''}.`, href: '/assessments?tab=board', tone: 'warn' }); }
  const posted = new Set((posts.data ?? []).map((p) => p.section_id)); const quiet = (sections.data ?? []).filter((s) => !posted.has(s.id));
  if (quiet.length && (sections.data ?? []).length) out.push({ title: `${quiet.length} sections had no homework or diary post this week`, detail: quiet.slice(0, 6).map((s) => s.name).join(', '), href: '/homework?tab=compliance', tone: 'info' });
  const C = con.data ?? []; const k1 = C.filter((c) => (c.approved_at ?? '') >= m1).reduce((t, c) => t + Number(c.amount), 0), k2 = C.filter((c) => (c.approved_at ?? '') < m1).reduce((t, c) => t + Number(c.amount), 0);
  if (k1 > k2 * 1.5 && k1 > 0) out.push({ title: 'Concessions are growing unusually fast', detail: `Rs ${Math.round(k1).toLocaleString('en-IN')} approved in the last 30 days against Rs ${Math.round(k2).toLocaleString('en-IN')} before.`, href: '/reports/concessions', tone: 'warn' });
  return out;
}
