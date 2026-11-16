import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { ftime, go, str } from '@/lib/fmt';
import { RECIPES } from '@/lib/pack';
import { runRecipes } from '@/lib/automations';

export const metadata = { title: 'Automations' };
async function toggle(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); const field = str(fd, 'field') === 'test_mode' ? 'test_mode' : 'enabled'; await ctx.sb.from('automations').update({ [field]: fd.get('value') === 'true' }).eq('id', str(fd, 'id')!); go('/admin/automations', 'Updated.'); }
async function install(fd: FormData) { 'use server'; const ctx = await requireCap('admin', 'write'); const r = RECIPES.find((x) => x.recipe_key === str(fd, 'key')); if (!r) go('/admin/automations', 'Unknown recipe.', 'err'); const { error } = await ctx.sb.from('automations').insert({ ...r!, conditions: (r as { conditions?: object }).conditions ?? {} }); go('/admin/automations', error ? error.message : `${r!.name} installed.`, error ? 'err' : 'ok'); }
async function runNow() { 'use server'; const ctx = await requireCap('admin', 'write'); const res = await runRecipes(ctx); go('/admin/automations', res.length ? res.map((r) => `${r.recipe}: ${r.detail}`).join(' | ').slice(0, 600) : 'Nothing was due.'); }

export default async function Automations() {
  const ctx = await requireCap('admin');
  const [{ data: autos }, { data: runs }] = await Promise.all([ctx.sb.from('automations').select('*').order('name'), ctx.sb.from('automation_runs').select('id, at, status, detail, automation:automations!automation_runs_automation_id_fkey(name)').order('at', { ascending: false }).limit(25)]);
  const have = new Set((autos ?? []).map((a) => a.recipe_key));
  const can = ctx.can('admin', 'write');
  const live = ['attendance_not_marked', 'fee_reminder_ladder', 'document_expiry', 'marks_deadline', 'homework_posting_check', 'birthday_wishes', 'year_rollover_reminders'];
  const eventDriven: Record<string, string> = { absentee_notice: 'runs when a roll call is submitted', cheque_bounced: 'runs when a cheque is marked bounced', concession_approval: 'runs when a concession is requested', leave_and_cover: 'runs when leave is approved', report_card_publish: 'runs at principal sign-off', gate_pass: 'runs when a pickup is requested', bus_delay: 'runs when a driver reports a delay', withdrawal_clearance: 'runs when a TC is requested' };
  return (
    <Page title="Automations and recipes" sub="Triggers, conditions and actions, with a test mode, a run log and a pause switch." actions={<>{can && <form action={runNow}><button className="btn">Run time-based recipes now</button></form>}<Link className="btn-ghost" href="/x/approval_rules">Approval rules</Link></>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Installed" className="lg:col-span-2">{(autos ?? []).length === 0 ? <Empty title="No automations installed" /> : <table className="tbl"><thead><tr><th>Recipe</th><th>Trigger</th><th>How it runs</th><th>Last run</th><th></th></tr></thead><tbody>{autos!.map((a) => <tr key={a.id}><td className="font-medium">{a.name}{a.test_mode && <> <Badge tone="amber">test mode</Badge></>}</td><td className="text-xs">{a.trigger}</td><td className="text-xs text-muted">{eventDriven[a.recipe_key] ?? (live.includes(a.recipe_key) ? 'time-based' : 'manual')}</td><td className="text-xs">{ftime(a.last_run_at)}</td>
          <td className="whitespace-nowrap text-right">{can && <><form action={toggle} className="inline"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="field" value="test_mode" /><button name="value" value={String(!a.test_mode)} className="btn-ghost btn-sm">{a.test_mode ? 'Go live' : 'Test mode'}</button></form> <form action={toggle} className="inline"><input type="hidden" name="id" value={a.id} /><button name="value" value={String(!a.enabled)} className={a.enabled ? 'btn-ghost btn-sm' : 'btn btn-sm'}>{a.enabled ? 'Pause' : 'Resume'}</button></form></>}</td></tr>)}</tbody></table>}</Card>
        <Card title="Recipe library">{<ul className="divide-y divide-line text-sm">{RECIPES.map((r) => <li key={r.recipe_key} className="flex items-center justify-between gap-2 px-4 py-2"><span>{r.name}</span>{have.has(r.recipe_key) ? <Badge tone="green">installed</Badge> : can && <form action={install}><input type="hidden" name="key" value={r.recipe_key} /><button className="btn-ghost btn-sm">Install</button></form>}</li>)}</ul>}</Card>
        <Card title="Run log" className="lg:col-span-3">{(runs ?? []).length === 0 ? <Empty title="No runs yet" hint="Time-based recipes run when you press the button above. See the note below about scheduling." /> : <ul className="divide-y divide-line text-sm">{(runs as unknown as { id: string; at: string; status: string; detail: string; automation: { name: string } | null }[]).map((r) => <li key={r.id} className="flex justify-between gap-3 px-4 py-2"><span><b>{r.automation?.name ?? 'System'}</b> · {r.detail}</span><span className="shrink-0 text-xs text-muted">{ftime(r.at)} <Badge>{r.status}</Badge></span></li>)}</ul>}</Card>
      </div>
      <p className="mt-3 text-xs text-muted">Global safeguards: quiet hours for parent messages, one message per trigger per day, and no rule may restrict a child&apos;s attendance, classes or exams over fees.</p>
    </Page>
  );
}
