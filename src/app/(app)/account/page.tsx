import { getCtx, ROLE_LABEL } from '@/lib/ctx';
import { Page, Card, Field } from '@/components/ui';
import { go, str } from '@/lib/fmt';
import { PRODUCT } from '@/lib/nav';
import { signOut } from '@/lib/actions';

export const metadata = { title: 'My account' };
async function save(fd: FormData) { 'use server'; const ctx = await getCtx(); const { error } = await ctx.sb.rpc('update_my_profile', { p_name: str(fd, 'name'), p_phone: str(fd, 'phone'), p_language: str(fd, 'language') }); go('/account', error ? error.message : 'Saved.', error ? 'err' : 'ok'); }
async function password(fd: FormData) { 'use server'; const ctx = await getCtx(); const p = str(fd, 'password') ?? ''; if (p.length < 8) go('/account', 'Use at least 8 characters.', 'err'); const { error } = await ctx.sb.auth.updateUser({ password: p }); go('/account', error ? error.message : 'Password changed.', error ? 'err' : 'ok'); }
async function ack(fd: FormData) { 'use server'; const ctx = await getCtx(); await ctx.sb.from('policy_acks').insert({ policy_id: str(fd, 'id') }); go('/account', 'Acknowledged.'); }

export default async function Account() {
  const ctx = await getCtx();
  const [{ data: policies }, { data: acks }] = await Promise.all([
    ctx.sb.from('policies').select('id, title, body, version, audience').eq('published', true).in('audience', ctx.isStaff ? ['staff', 'all'] : ['parents', 'all']),
    ctx.sb.from('policy_acks').select('policy_id').eq('user_id', ctx.user.id),
  ]);
  const done = new Set((acks ?? []).map((a) => a.policy_id));
  return (
    <Page title="My account" sub={`${ROLE_LABEL[ctx.role] ?? ctx.role} · ${ctx.org.name}`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile"><form action={save} className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Name"><input name="name" className="input" defaultValue={ctx.profile.full_name ?? ''} /></Field><Field label="Phone"><input name="phone" className="input" defaultValue={ctx.profile.phone ?? ''} /></Field>
          <Field label="Language"><select name="language" className="input" defaultValue={ctx.profile.language}><option value="en">English</option><option value="hi">हिन्दी</option><option value="te">తెలుగు</option></select></Field>
          <Field label="Email"><input className="input" value={ctx.user.email ?? ''} disabled readOnly /></Field><button className="btn sm:w-32">Save</button></form></Card>
        <Card title="Change password"><form action={password} className="space-y-3 p-4"><Field label="New password"><input type="password" name="password" className="input" minLength={8} required autoComplete="new-password" /></Field><button className="btn-ghost">Change password</button></form></Card>
        <Card title="Policies and handbook" className="lg:col-span-2">{(policies ?? []).length === 0 ? <div className="p-4 text-sm text-muted">No policies published.</div> : <ul className="divide-y divide-line text-sm">{policies!.map((p) => <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-3"><div><div className="font-medium">{p.title} <span className="font-normal text-muted">v{p.version}</span></div><p className="text-muted">{p.body}</p></div>{done.has(p.id) ? <span className="text-xs text-emerald-700">Acknowledged</span> : <form action={ack}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm">I have read this</button></form>}</li>)}</ul>}</Card>
      </div>
      <form action={signOut} className="mt-6"><button className="btn-ghost">Sign out</button></form>
      <p className="mt-6 text-xs text-muted">{PRODUCT.name} · Product owner: {PRODUCT.owner}, {PRODUCT.ownerTitle}</p>
    </Page>
  );
}
