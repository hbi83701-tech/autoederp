'use server';
import { getCtx, type Ctx } from '@/lib/ctx';
import { go, str } from '@/lib/fmt';

/** Expand an audience into app users. Parents come from the guardians of matching active students. */
async function audienceUsers(ctx: Ctx, a: { scope: string; section_id?: string | null; route_id?: string | null; role?: string | null }) {
  const users = new Map<string, string | null>();
  if (['all', 'parents', 'section', 'route'].includes(a.scope)) {
    let ids: string[] | null = null;
    if (a.scope === 'route' && a.route_id) { const { data } = await ctx.sb.from('student_transport').select('student_id').eq('route_id', a.route_id).eq('active', true); ids = (data ?? []).map((d) => d.student_id); }
    let q = ctx.sb.from('students').select('id, household_id').eq('status', 'active').limit(20000);
    if (a.scope === 'section' && a.section_id) q = q.eq('section_id', a.section_id);
    if (ids) q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    const { data: studs } = await q;
    const hh = [...new Set((studs ?? []).map((s) => s.household_id).filter(Boolean))] as string[];
    for (let i = 0; i < hh.length; i += 300) {
      const { data: gs } = await ctx.sb.from('guardians').select('user_id, household_id').in('household_id', hh.slice(i, i + 300)).not('user_id', 'is', null);
      for (const g of gs ?? []) users.set(g.user_id, (studs ?? []).find((s) => s.household_id === g.household_id)?.id ?? null);
    }
  }
  if (['all', 'staff', 'role'].includes(a.scope)) {
    let q = ctx.sb.from('profiles').select('id, role').eq('active', true).not('role', 'in', '(parent,student,pending)');
    if (a.scope === 'role' && a.role) q = q.eq('role', a.role);
    const { data } = await q;
    for (const p of data ?? []) users.set(p.id, null);
  }
  return users;
}

async function deliver(ctx: Ctx, id: string) {
  const { data: m } = await ctx.sb.from('messages').select('*').eq('id', id).single();
  if (!m) return 0;
  const users = await audienceUsers(ctx, m.audience as { scope: string });
  const rows = [...users].map(([user_id, student_id]) => ({ message_id: id, user_id, student_id, title: m.title, body: m.body, requires_ack: m.requires_ack }));
  for (let i = 0; i < rows.length; i += 500) await ctx.sb.from('message_recipients').insert(rows.slice(i, i + 500));
  for (let i = 0; i < rows.length; i += 500) await ctx.sb.from('notifications').insert(rows.slice(i, i + 500).map((r) => ({ org_id: ctx.org.id, user_id: r.user_id, title: m.title, body: String(m.body).slice(0, 160), link: '/inbox', kind: m.kind })));
  // Other channels are queued for the connected providers; app push is always tried first (COM-05).
  const channels = String(m.channels ?? 'app').split(',').filter((c) => c && c !== 'app');
  if (channels.length) await ctx.sb.from('outbox').insert(channels.map((c) => ({ channel: c, event_key: m.kind, body: `${m.title}: ${String(m.body).slice(0, 300)}`, to_address: `${rows.length} recipients`, status: 'queued' })));
  await ctx.sb.from('messages').update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: rows.length, sent_by_name: ctx.name }).eq('id', id);
  return rows.length;
}

export async function compose(fd: FormData) {
  const ctx = await getCtx();
  const scope = str(fd, 'scope') ?? 'section';
  const kind = str(fd, 'kind') ?? 'announcement';
  // Global safeguards (WF-05): quiet hours for parent messages, approval for mass messages.
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  const quiet = ((ctx.org.settings ?? {}) as { quiet_hours?: { from: number; to: number } }).quiet_hours ?? { from: 21, to: 7 };
  if (kind !== 'alert' && scope !== 'staff' && scope !== 'role' && (hour >= quiet.from || hour < quiet.to)) go('/messages', `Quiet hours are ${quiet.from}:00 to ${quiet.to}:00. Only alerts can go to parents now; save this for the morning.`, 'err');
  const label = scope === 'section' ? `Section` : scope === 'route' ? 'Bus route' : scope === 'role' ? `Staff role: ${str(fd, 'role')}` : scope === 'all' ? 'Whole school' : scope === 'parents' ? 'All parents' : 'All staff';
  const channels = ['app', ...fd.getAll('channels').map(String)].join(',');
  const mass = ['all', 'parents'].includes(scope) && !['principal', 'group_admin'].includes(ctx.role);
  const { data: m, error } = await ctx.sb.from('messages').insert({ kind, title: str(fd, 'title'), body: str(fd, 'body'), audience: { scope, section_id: str(fd, 'section_id'), route_id: str(fd, 'route_id'), role: str(fd, 'role') }, audience_label: label, channels, requires_ack: fd.get('requires_ack') === 'on', status: mass ? 'pending' : 'draft', branch_id: ctx.branchId }).select('id').single();
  if (error) go('/messages', error.message, 'err');
  if (mass) { await ctx.sb.rpc('submit_approval', { p_type: 'message', p_object: m!.id, p_title: `Circular: ${str(fd, 'title')}`, p_summary: str(fd, 'body'), p_impact: `Goes to ${label.toLowerCase()} by ${channels}.` }); go('/messages', 'School-wide messages need the principal’s approval. Sent for approval.'); }
  const n = await deliver(ctx, m!.id);
  go('/messages', `Sent to ${n} people in the app${channels !== 'app' ? `; ${channels.replace('app,', '')} queued for the provider` : ''}.`);
}

/** Send messages that were approved in the inbox. */
export async function sendApproved(fd: FormData) {
  const ctx = await getCtx();
  const n = await deliver(ctx, str(fd, 'id')!);
  go('/messages', `Sent to ${n} people.`);
}

export async function reply(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'conversation')!;
  const { data: c } = await ctx.sb.from('conversations').select('parent_user, subject').eq('id', id).single();
  await ctx.sb.from('conversation_messages').insert({ conversation_id: id, sender_name: ctx.name, body: str(fd, 'body') });
  await ctx.sb.from('conversations').update({ last_message_at: new Date().toISOString(), status: fd.get('close') === 'on' ? 'closed' : 'open' }).eq('id', id);
  if (c?.parent_user) await ctx.sb.from('notifications').insert({ org_id: ctx.org.id, user_id: c.parent_user, title: `Reply: ${c.subject}`, body: String(str(fd, 'body')).slice(0, 140), link: '/parent/messages', kind: 'message' });
  go(`/messages?tab=inbox&open=${id}`, 'Reply sent.');
}

export async function emergency(fd: FormData) {
  const ctx = await getCtx();
  const { data: b, error } = await ctx.sb.from('emergency_broadcasts').insert({ type: str(fd, 'type'), message: str(fd, 'message'), is_drill: fd.get('is_drill') === 'on', sent_by_name: ctx.name }).select('id').single();
  if (error) go('/messages?tab=emergency', error.message, 'err');
  const users = await audienceUsers(ctx, { scope: 'all' });
  const rows = [...users.keys()].map((user_id) => ({ org_id: ctx.org.id, user_id, title: `${fd.get('is_drill') === 'on' ? 'DRILL: ' : ''}${String(str(fd, 'type')).toUpperCase()}`, body: str(fd, 'message'), link: `/inbox?ack=${b!.id}`, kind: 'alert' }));
  for (let i = 0; i < rows.length; i += 500) await ctx.sb.from('notifications').insert(rows.slice(i, i + 500));
  go('/messages?tab=emergency', `Broadcast sent to ${rows.length} staff and parents. Acknowledgements are tracked below.`);
}
