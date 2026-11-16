import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx, STAFF_ROLES, ROLE_LABEL } from '@/lib/ctx';
import { Page, Card, Badge, Field } from '@/components/ui';
import { ftime, fullName, go, str, numv } from '@/lib/fmt';

async function act(fd: FormData) {
  'use server';
  const ctx = await getCtx();
  const id = str(fd, 'id')!;
  const body = str(fd, 'body');
  if (body) await ctx.sb.from('ticket_comments').insert({ ticket_id: id, author_name: ctx.name, body, internal: fd.get('internal') === 'on' });
  const { data: t } = await ctx.sb.from('tickets').select('raised_by, subject, status').eq('id', id).single();
  if (ctx.isStaff) {
    const status = str(fd, 'status');
    const patch: Record<string, unknown> = {};
    if (status && status !== t?.status) { patch.status = status; if (status === 'resolved') { patch.resolved_at = new Date().toISOString(); patch.resolution = body ?? 'Resolved'; } }
    if (str(fd, 'owner_role')) patch.owner_role = str(fd, 'owner_role');
    if (Object.keys(patch).length) await ctx.sb.from('tickets').update(patch).eq('id', id);
    if (t?.raised_by && t.raised_by !== ctx.user.id && fd.get('internal') !== 'on' && (body || patch.status)) await ctx.sb.from('notifications').insert({ org_id: ctx.org.id, user_id: t.raised_by, title: `Update on: ${t.subject}`, body: body ?? `Status: ${patch.status}`, link: `/helpdesk/${id}`, kind: 'helpdesk' });
  } else if (numv(fd, 'rating')) await ctx.sb.from('tickets').update({ rating: numv(fd, 'rating'), rating_comment: body, status: 'closed' }).eq('id', id);
  go(`/helpdesk/${id}`, 'Saved.');
}

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { data: t } = await ctx.sb.from('tickets').select('*, student:students!tickets_student_id_fkey(id, first_name, last_name)').eq('id', id).maybeSingle();
  if (!t) notFound();
  const { data: comments } = await ctx.sb.from('ticket_comments').select('*').eq('ticket_id', id).order('at');
  const late = t.sla_due && new Date(t.sla_due) < new Date() && !['resolved', 'closed'].includes(t.status);
  return (
    <Page title={t.subject} sub={<>{t.type.replace('_', ' ')}{t.category ? ` · ${t.category}` : ''} · raised by {t.raised_by_name} on {ftime(t.created_at)} · <Link className="link" href={ctx.isStaff ? '/helpdesk' : '/parent/requests'}>Back</Link></>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Conversation">
          <div className="space-y-3 p-4">{t.body && <p className="rounded-lg bg-paper p-3 text-sm">{t.body}</p>}
            {(comments ?? []).map((c) => <div key={c.id} className={`rounded-lg p-3 text-sm ${c.internal ? 'border border-amber-200 bg-amber-50' : 'bg-paper'}`}><div className="text-xs text-muted">{c.author_name} · {ftime(c.at)}{c.internal ? ' · internal note' : ''}</div>{c.body}</div>)}</div>
          {!['closed'].includes(t.status) && <form action={act} className="space-y-3 border-t border-line p-4"><input type="hidden" name="id" value={id} />
            <textarea name="body" rows={3} className="input" placeholder={ctx.isStaff ? 'Reply to the requester, or add an internal note' : 'Add a message'} aria-label="Message" />
            {ctx.isStaff ? <div className="flex flex-wrap items-end gap-3"><Field label="Status"><select name="status" defaultValue={t.status} className="input">{['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field><Field label="Reassign to"><select name="owner_role" defaultValue={t.owner_role ?? ''} className="input">{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="internal" className="h-4 w-4" /> Internal note</label><button className="btn">Save</button></div>
              : t.status === 'resolved' ? <div className="flex items-end gap-3"><Field label="Rate the resolution"><select name="rating" className="input"><option value="5">5 · Very happy</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1 · Not resolved</option></select></Field><button className="btn">Submit rating</button></div> : <button className="btn">Send</button>}</form>}
        </Card>
        <Card title="Details"><dl className="space-y-2 p-4 text-sm">{[['Status', <Badge key="s">{t.status}</Badge>], ['Priority', <Badge key="p">{t.priority}</Badge>], ['Owner', String(t.owner_role ?? '').replace('_', ' ')], ['Respond by', <span key="d" className={late ? 'text-red-600' : ''}>{ftime(t.sla_due)}{late ? ' · past SLA' : ''}</span>], ['Student', t.student ? (ctx.isStaff ? <Link key="st" className="link" href={`/students/${t.student.id}`}>{fullName(t.student)}</Link> : fullName(t.student)) : '—'], ['Resolution', t.resolution ?? '—'], ['Rating', t.rating ? `${t.rating} / 5` : '—']].map(([k, v]) => <div key={String(k)} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl></Card>
      </div>
    </Page>
  );
}
