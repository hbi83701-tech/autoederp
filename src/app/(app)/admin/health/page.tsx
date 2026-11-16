import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Badge } from '@/components/ui';
import { go, today } from '@/lib/fmt';

export const metadata = { title: 'Data health' };
/** Integrity checks (DM-06, ADO-04): counts, balances, orphan records and impossible values. */
async function run() {
  'use server';
  const ctx = await requireCap('admin');
  const sb = ctx.sb, d = today();
  const [st, gu, staff, dem, secs, att, rec] = await Promise.all([
    sb.from('students').select('id, first_name, dob, section_id, household_id, admission_no, status, photo_url, apaar_id').limit(20000), sb.from('guardians').select('household_id, phone, email').limit(40000),
    sb.from('staff').select('id, phone, email, user_id, status').limit(5000), sb.from('fee_demands').select('id, amount, concession, fine, paid, status').limit(60000),
    sb.from('sections').select('id, name, capacity, class_teacher_id').eq('year_id', ctx.year?.id ?? ''), sb.from('attendance').select('id', { count: 'exact', head: true }).gt('date', d), sb.from('receipts').select('id, total, allocations:receipt_allocations(amount)').limit(20000),
  ]);
  const S = st.data ?? [], active = S.filter((s) => s.status === 'active');
  const hh = new Set((gu.data ?? []).map((g) => g.household_id));
  const badPhone = (p: string | null) => !!p && !/^(\+91)?[6-9]\d{9}$/.test(p.replace(/[\s-]/g, ''));
  const badEmail = (e: string | null) => !!e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const dupAdm = active.map((s) => s.admission_no).filter((a, i, arr) => a && arr.indexOf(a) !== i).length;
  const perSec = new Map<string, number>(); for (const s of active) if (s.section_id) perSec.set(s.section_id, (perSec.get(s.section_id) ?? 0) + 1);
  const f = (check: string, count: number, severity: string, fix: string, href: string) => ({ check, count, severity, fix, href });
  const findings = [
    f('Active students without a section', active.filter((s) => !s.section_id).length, 'high', 'Allocate from Students → Bulk actions', '/students'),
    f('Active students with no guardian on record', active.filter((s) => !s.household_id || !hh.has(s.household_id)).length, 'high', 'Add a guardian on the Student 360 page', '/students'),
    f('Students without a date of birth', active.filter((s) => !s.dob).length, 'medium', 'Collect with a parent form', '/forms'),
    f('Students with an impossible date of birth', active.filter((s) => s.dob && (s.dob > d || s.dob < '1990-01-01')).length, 'high', 'Correct the date', '/students'),
    f('Duplicate admission numbers', dupAdm, 'high', 'Renumber the duplicates', '/students'),
    f('Students without a photo', active.filter((s) => !s.photo_url).length, 'low', 'Upload ID photos', '/students'),
    f('Students without an APAAR ID', active.filter((s) => !s.apaar_id).length, 'low', 'See the APAAR export', '/reports/statutory?group=apaar'),
    f('Guardian phone numbers that look invalid', (gu.data ?? []).filter((g) => badPhone(g.phone)).length, 'medium', 'Messages to these numbers will fail', '/x/guardians'),
    f('Guardian emails that look invalid', (gu.data ?? []).filter((g) => badEmail(g.email)).length, 'medium', 'Correct the address', '/x/guardians'),
    f('Sections over capacity (count above 100% of strength)', (secs.data ?? []).filter((s) => s.capacity && (perSec.get(s.id) ?? 0) > s.capacity).length, 'medium', 'Rebalance or raise the capacity', '/students/bulk'),
    f('Sections without a class teacher', (secs.data ?? []).filter((s) => !s.class_teacher_id).length, 'medium', 'Assign one', '/x/sections'),
    f('Fee demands where paid is more than billed', (dem.data ?? []).filter((x) => Number(x.paid) > Number(x.amount) - Number(x.concession) + Number(x.fine) + 0.5).length, 'high', 'Review and refund', '/fees'),
    f('Fee demands marked paid with a balance left', (dem.data ?? []).filter((x) => x.status === 'paid' && Number(x.amount) - Number(x.concession) + Number(x.fine) - Number(x.paid) > 0.5).length, 'high', 'Report to support', '/fees'),
    f('Receipts whose lines do not add up to the total', (rec.data ?? []).filter((r) => Math.abs(Number(r.total) - (r.allocations as { amount: number }[]).reduce((t, a) => t + Number(a.amount), 0)) > 0.5).length, 'high', 'Report to support', '/fees/receipts'),
    f('Attendance recorded for future dates', att.count ?? 0, 'high', 'Report to support', '/attendance'),
    f('Active staff without an app login', (staff.data ?? []).filter((s) => s.status === 'active' && !s.user_id).length, 'low', 'Invite them', '/admin/users'),
  ];
  await sb.from('data_health_reports').insert({ findings });
  go('/admin/health', `Checked ${findings.length} rules. ${findings.filter((x) => x.count > 0).length} need attention.`);
}

export default async function Health() {
  const ctx = await requireCap('admin');
  const { data } = await ctx.sb.from('data_health_reports').select('*').order('at', { ascending: false }).limit(1).maybeSingle();
  const F = ((data?.findings ?? []) as { check: string; count: number; severity: string; fix: string; href: string }[]).sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  return (
    <Page title="Data-health report" sub={data ? `Last checked ${new Date(data.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'Validation rules stop bad data before it reaches a dashboard.'} actions={<form action={run}><button className="btn">Run checks now</button></form>}>
      <Card>{F.length === 0 ? <div className="p-6 text-center text-sm text-muted">Run the checks to see missing mandatory fields, invalid contacts, orphan records and impossible values.</div> : <table className="tbl"><thead><tr><th>Check</th><th className="text-right">Found</th><th>Severity</th><th>What to do</th></tr></thead><tbody>{F.map((f) => <tr key={f.check}><td>{f.check}</td><td className="text-right tabular-nums">{f.count}</td><td>{f.count === 0 ? <Badge tone="green">clean</Badge> : <Badge tone={f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'amber' : 'grey'}>{f.severity}</Badge>}</td><td>{f.count > 0 && <Link className="link" href={f.href}>{f.fix}</Link>}</td></tr>)}</tbody></table>}</Card>
    </Page>
  );
}
