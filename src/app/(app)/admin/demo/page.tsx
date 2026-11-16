import { requireCap } from '@/lib/ctx';
import { Page, Card } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { go, errMsg } from '@/lib/fmt';
import { seedDemo } from '@/lib/demo';

export const metadata = { title: 'Demo data' };
export const maxDuration = 300;
async function load() {
  'use server';
  const ctx = await requireCap('admin', 'write');
  if (ctx.role !== 'group_admin') go('/admin/demo', 'Only the group admin can load demo data.', 'err');
  let r; try { r = await seedDemo(ctx); } catch (e) { go('/admin/demo', errMsg(e), 'err'); }
  go('/', `Demo school loaded: ${r!.students} students in ${r!.sections} sections, ${r!.staff} staff, ${r!.receipts} families with payments and ${r!.days} days of attendance.`);
}
export default async function Demo() {
  const ctx = await requireCap('admin');
  const { count } = await ctx.sb.from('students').select('id', { count: 'exact', head: true });
  return (
    <Page title="Demo data" sub="Fill an empty school with fictional families so you can try every screen before real data goes in.">
      <Card><div className="space-y-3 p-5 text-sm">
        <p>This creates about 96 students in 6 sections with families, 13 staff with salary structures, a generated timetable, fee plans and demands with payments already collected, two weeks of attendance, assessments with marks, homework, two bus routes, library books, store and canteen items, helpdesk requests, admission enquiries and growth records.</p>
        <p className="text-muted">All names and phone numbers are made up. It only works while the school has no students, and takes about a minute.</p>
        {(count ?? 0) > 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">This school already has {count} students, so demo data cannot be loaded.</p> : <form action={load}><ConfirmSubmit className="btn" message="Load demo data into this school?">Load demo data</ConfirmSubmit></form>}
      </div></Card>
    </Page>
  );
}
