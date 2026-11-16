import { requireCap } from '@/lib/ctx';
import { Page, Card, Field } from '@/components/ui';
import { go, str, numv } from '@/lib/fmt';
import { MODULE_TITLES } from '@/lib/nav';

export const metadata = { title: 'Organisation and settings' };
const SWITCHES: [string, string][] = [['transport', 'Transport'], ['library', 'Library'], ['store', 'Store and canteen'], ['hostel', 'Hostel']];
const TERMS = ['Grade', 'Section', 'Branch', 'Term', 'House'];
async function save(fd: FormData) {
  'use server';
  const ctx = await requireCap('admin', 'write');
  const settings = { ...(ctx.org.settings as object), late_fee: { type: str(fd, 'fine_type') ?? 'none', amount: numv(fd, 'fine_amount') ?? 0, grace_days: numv(fd, 'grace_days') ?? 0, cap: numv(fd, 'fine_cap') ?? undefined }, quiet_hours: { from: numv(fd, 'quiet_from') ?? 21, to: numv(fd, 'quiet_to') ?? 7 }, homework_approval: fd.get('homework_approval') === 'on', library_fine_per_day: numv(fd, 'library_fine') ?? 2, attendance_edit_days: numv(fd, 'attendance_edit_days') ?? 0 };
  const modules = Object.fromEntries(SWITCHES.map(([k]) => [k, fd.get(`mod_${k}`) === 'on']));
  const terminology = Object.fromEntries(TERMS.map((t) => [t, str(fd, `term_${t}`)]).filter(([, v]) => v));
  const { error } = await ctx.sb.from('organisations').update({ name: str(fd, 'name'), legal_name: str(fd, 'legal_name'), pan: str(fd, 'pan'), gst_no: str(fd, 'gst_no'), city: str(fd, 'city'), state: str(fd, 'state'), settings, modules, terminology }).eq('id', ctx.org.id);
  go('/admin/settings', error ? error.message : 'Settings saved.', error ? 'err' : 'ok');
}

export default async function Settings() {
  const ctx = await requireCap('admin');
  const o = ctx.org, s = (o.settings ?? {}) as { late_fee?: { type: string; amount: number; grace_days: number; cap?: number }; quiet_hours?: { from: number; to: number }; homework_approval?: boolean; library_fine_per_day?: number; attendance_edit_days?: number };
  const term = (o.terminology ?? {}) as Record<string, string>;
  void MODULE_TITLES;
  return (
    <Page title="Organisation and settings" sub="Differences between schools are settings, never custom code.">
      <form action={save} className="space-y-4"><fieldset disabled={!ctx.can('admin', 'write')} className="space-y-4">
        <Card title="Legal entity"><div className="grid gap-4 p-4 sm:grid-cols-3"><Field label="School or group name"><input name="name" required defaultValue={o.name} className="input" /></Field><Field label="Legal name (trust / society)"><input name="legal_name" defaultValue={o.legal_name ?? ''} className="input" /></Field><Field label="PAN"><input name="pan" defaultValue={o.pan ?? ''} className="input" /></Field><Field label="GSTIN"><input name="gst_no" defaultValue={o.gst_no ?? ''} className="input" /></Field><Field label="City"><input name="city" defaultValue={o.city ?? ''} className="input" /></Field><Field label="State (sets Professional Tax slabs)"><select name="state" defaultValue={o.state ?? 'Telangana'} className="input">{['Telangana', 'Andhra Pradesh', 'Karnataka', 'Maharashtra', 'Tamil Nadu'].map((x) => <option key={x}>{x}</option>)}</select></Field></div></Card>
        <Card title="Modules"><div className="flex flex-wrap gap-6 p-4 text-sm">{SWITCHES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`mod_${k}`} defaultChecked={(o.modules as Record<string, boolean>)?.[k] !== false} className="h-4 w-4" />{l}</label>)}</div><p className="border-t border-line px-4 py-2 text-xs text-muted">Switch off what a small school does not use so people see a simpler product.</p></Card>
        <Card title="Fee rules"><div className="grid gap-4 p-4 sm:grid-cols-4"><Field label="Late fee"><select name="fine_type" defaultValue={s.late_fee?.type ?? 'none'} className="input"><option value="none">None</option><option value="flat">Flat amount</option><option value="per_day">Per day</option></select></Field><Field label="Amount (Rs)"><input name="fine_amount" type="number" defaultValue={s.late_fee?.amount ?? ''} className="input" /></Field><Field label="Grace days"><input name="grace_days" type="number" defaultValue={s.late_fee?.grace_days ?? 0} className="input" /></Field><Field label="Maximum per instalment"><input name="fine_cap" type="number" defaultValue={s.late_fee?.cap ?? ''} className="input" /></Field><Field label="Library fine per day (Rs)"><input name="library_fine" type="number" defaultValue={s.library_fine_per_day ?? 2} className="input" /></Field></div></Card>
        <Card title="Communication and classroom"><div className="grid gap-4 p-4 sm:grid-cols-4"><Field label="Quiet hours start (24h)"><input name="quiet_from" type="number" min={0} max={23} defaultValue={s.quiet_hours?.from ?? 21} className="input" /></Field><Field label="Quiet hours end"><input name="quiet_to" type="number" min={0} max={23} defaultValue={s.quiet_hours?.to ?? 7} className="input" /></Field><label className="flex items-center gap-2 pt-5 text-sm sm:col-span-2"><input type="checkbox" name="homework_approval" defaultChecked={!!s.homework_approval} className="h-4 w-4" /> Coordinator approves homework before parents see it</label></div></Card>
        <Card title="Terminology"><div className="grid gap-4 p-4 sm:grid-cols-5">{TERMS.map((t) => <Field key={t} label={`Call "${t}"`}><input name={`term_${t}`} defaultValue={term[t] ?? ''} placeholder={t} className="input" /></Field>)}</div><p className="border-t border-line px-4 py-2 text-xs text-muted">For example Grade / Class / Stage / Year, Section / Division, Branch / Campus.</p></Card>
      </fieldset>{ctx.can('admin', 'write') && <button className="btn">Save settings</button>}</form>
    </Page>
  );
}
