import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { ftime } from '@/lib/fmt';

export const metadata = { title: 'Notifications' };
async function readAll() { 'use server'; const ctx = await getCtx(); await ctx.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', ctx.user.id).is('read_at', null); revalidatePath('/', 'layout'); }

export default async function Inbox() {
  const ctx = await getCtx();
  const [{ data }, { data: circ }] = await Promise.all([
    ctx.sb.from('notifications').select('*').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(80),
    ctx.sb.from('message_recipients').select('id, title, body, requires_ack, read_at, ack_at, created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(20),
  ]);
  return (
    <Page title="Notifications" actions={<form action={readAll}><button className="btn-ghost">Mark all as read</button></form>}>
      {(circ ?? []).length > 0 && <Card title="Announcements and circulars" className="mb-4"><ul className="divide-y divide-line text-sm">{circ!.map((c) => <li key={c.id} className="px-4 py-2.5"><div className="font-medium">{c.title}{c.requires_ack && !c.ack_at ? <span className="ml-2 text-xs text-amber-700">needs acknowledgement</span> : null}</div><p className="text-muted">{c.body}</p></li>)}</ul></Card>}
      <Card>{(data ?? []).length === 0 ? <Empty title="You are all caught up" hint="Alerts about approvals, attendance, fees, buses and requests appear here." /> : <ul className="divide-y divide-line">{data!.map((n) => (
        <li key={n.id} className={`px-4 py-2.5 text-sm ${n.read_at ? '' : 'bg-brand-soft/50'}`}><div className="flex justify-between gap-3">{n.link ? <Link className="link font-medium" href={n.link}>{n.title}</Link> : <span className="font-medium">{n.title}</span>}<span className="shrink-0 text-xs text-muted">{ftime(n.created_at)}</span></div>{n.body && <p className="text-muted">{n.body}</p>}</li>))}</ul>}</Card>
    </Page>
  );
}
