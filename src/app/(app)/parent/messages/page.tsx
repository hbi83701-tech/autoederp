import Link from 'next/link';
import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { ftime } from '@/lib/fmt';
import { startConversation, parentReply, ackMessage } from '../actions';

export const metadata = { title: 'Messages' };
export default async function PMessages({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  const { ctx, child, t } = await family();
  const [{ data: circ }, { data: convs }, { data: thread }, { data: forms }] = await Promise.all([
    ctx.sb.from('message_recipients').select('id, title, body, requires_ack, read_at, ack_at, created_at').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(30),
    ctx.sb.from('conversations').select('id, subject, status, with_role, last_message_at').eq('parent_user', ctx.user.id).order('last_message_at', { ascending: false }),
    sp.open ? ctx.sb.from('conversation_messages').select('id, sender, sender_name, body, at').eq('conversation_id', sp.open).order('at') : Promise.resolve({ data: [] }),
    ctx.sb.from('forms').select('id, title, closes_on').eq('status', 'published').in('audience', ['parents', 'all']),
  ]);
  return (
    <Page title={t('Messages')} sub="Circulars from the school and your conversations with teachers and the office.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Circulars and announcements" className="lg:col-span-2">{(circ ?? []).length === 0 ? <Empty title="No circulars yet" /> : <ul className="divide-y divide-line">{circ!.map((c) => <li key={c.id} className={`px-4 py-3 text-sm ${c.read_at ? '' : 'bg-brand-soft/40'}`}><div className="flex justify-between gap-2"><span className="font-medium">{c.title}</span><span className="shrink-0 text-xs text-muted">{ftime(c.created_at)}</span></div><p className="whitespace-pre-wrap text-muted">{c.body}</p>
          {!c.ack_at && <form action={ackMessage} className="mt-1"><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm">{c.requires_ack ? 'Acknowledge' : 'Mark as read'}</button></form>}</li>)}</ul>}</Card>
        <div className="space-y-4">
          {(forms ?? []).length > 0 && <Card title="Forms and surveys"><ul className="divide-y divide-line text-sm">{forms!.map((f) => <li key={f.id} className="px-4 py-2.5"><Link className="link" href={`/forms/${f.id}`}>{f.title}</Link></li>)}</ul></Card>}
          <Card title="Message the school"><form action={startConversation} className="space-y-3 p-4"><input type="hidden" name="student_id" value={child?.id ?? ''} /><Field label="To"><select name="with_role" className="input"><option value="class_teacher">Class teacher</option><option value="office">School office</option><option value="accounts">Accounts</option><option value="transport">Transport</option></select></Field><Field label="Subject"><input name="subject" required className="input" /></Field><Field label="Message"><textarea name="body" rows={3} required className="input" /></Field><button className="btn w-full">Send</button><p className="text-xs text-muted">Teachers reply during school hours.</p></form></Card>
          <Card title="My conversations">{(convs ?? []).length === 0 ? <div className="p-4 text-sm text-muted">None yet.</div> : <ul className="divide-y divide-line text-sm">{convs!.map((c) => <li key={c.id}><Link href={`/parent/messages?open=${c.id}`} className={`flex justify-between px-4 py-2.5 hover:bg-paper ${sp.open === c.id ? 'bg-brand-soft' : ''}`}><span>{c.subject}</span><Badge>{c.status}</Badge></Link></li>)}</ul>}</Card>
        </div>
        {sp.open && <Card title="Conversation" className="lg:col-span-3"><ul className="space-y-2 p-4">{(thread ?? []).map((m) => <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.sender === ctx.user.id ? 'ml-auto bg-brand-soft' : 'bg-paper'}`}><div className="text-xs text-muted">{m.sender_name} · {ftime(m.at)}</div>{m.body}</li>)}</ul><form action={parentReply} className="flex gap-2 border-t border-line p-4"><input type="hidden" name="conversation" value={sp.open} /><input name="body" required className="input" placeholder="Write a reply" aria-label="Reply" /><button className="btn">Send</button></form></Card>}
      </div>
    </Page>
  );
}
