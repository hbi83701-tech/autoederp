import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Badge, Meter } from '@/components/ui';

export const metadata = { title: 'Set-up checklist' };
export default async function Setup() {
  const ctx = await requireCap('admin');
  const c = async (t: string) => (await ctx.sb.from(t).select('id', { count: 'exact', head: true })).count ?? 0;
  const [sections, staff, students, plans, demands, tt, assign, users, routes, schemes] = await Promise.all(['sections', 'staff', 'students', 'fee_plans', 'fee_demands', 'timetable_entries', 'teacher_assignments', 'profiles', 'routes', 'assessment_schemes'].map(c));
  const steps: [string, string, boolean, string][] = [
    ['Review grades and sections', `${sections} sections from the board pack`, sections > 0, '/x/sections'], ['Add staff', `${staff} staff records`, staff > 0, '/hr'], ['Invite your team', `${users} users have access`, users > 1, '/admin/users'],
    ['Admit or import students', `${students} students`, students > 0, '/admin/import'], ['Set teaching assignments', `${assign} class-subject assignments`, assign > 0, '/x/teacher_assignments'], ['Build the timetable', `${tt} periods placed`, tt > 0, '/timetable'],
    ['Create fee plans', `${plans} plans`, plans > 0, '/fees/structure'], ['Raise fee demands', `${demands} instalments`, demands > 0, '/fees/structure'], ['Check the assessment scheme', `${schemes} schemes installed`, schemes > 0, '/x/assessment_schemes'], ['Set up transport (optional)', `${routes} routes`, routes > 0, '/transport'],
  ];
  const done = steps.filter((s) => s[2]).length;
  return (
    <Page title="Set-up checklist" sub="A typical branch goes live in about six weeks. This list tracks what the system can see.">
      <Card><div className="p-4"><div className="mb-2 flex justify-between text-sm"><span>{done} of {steps.length} steps done</span><Link className="link" href="/admin/demo">Or load demo data to explore</Link></div><Meter value={done} max={steps.length} /></div>
        <ul className="divide-y divide-line border-t border-line">{steps.map(([t, d, ok, h]) => <li key={t} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><div className="font-medium">{t}</div><div className="text-xs text-muted">{d}</div></div><span className="flex items-center gap-2">{ok ? <Badge tone="green">done</Badge> : <Badge tone="amber">to do</Badge>}<Link className="btn-ghost btn-sm" href={h}>Open</Link></span></li>)}</ul></Card>
    </Page>
  );
}
