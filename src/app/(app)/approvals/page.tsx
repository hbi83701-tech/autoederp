import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Tabs } from '@/components/ui';
import { ftime, inr, go, str } from '@/lib/fmt';

export const metadata = { title: 'Approvals' };
async function decide(fd: FormData) {
  'use server';
  const ctx = await getCtx();
  const ids = fd.getAll('id').map(String);
  const decision = str(fd, 'decision') ?? 'approve';
  let done = 0; let last = '';
  for (const id of ids) { const { error } = await ctx.sb.rpc('decide_approval', { p_id: id, p_decision: decision, p_comment: str(fd, 'comment') }); if (error) last = error.message; else done++; }
  go('/approvals', last || `${done} ${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'sent back for information'}.`, last ? 'err' : 'ok');
}

type A = { id: string; object_type: string; title: string; summary: string | null; impact: string | null; amount: number | null; steps: string[]; current_step: number; status: string; requested_by_name: string; created_at: string; sla_due: string | null };
const SAFE = ['leave', 'gate_pass', 'post', 'gallery', 'lesson_plan', 'regularisation'];

/** One approvals inbox (WF-02): context, impact, approve / reject / ask, and bulk approve for safe types. */
export default async function Approvals({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'inbox' } = await searchParams;
  const ctx = await getCtx();
  const { data: inbox } = await ctx.sb.rpc('my_approvals');
  const { data: other } = tab === 'mine' ? await ctx.sb.from('approvals').select('*').eq('requested_by', ctx.user.id).order('created_at', { ascending: false }).limit(60)
    : tab === 'history' ? await ctx.sb.from('approvals').select('*').neq('status', 'pending').order('decided_at', { ascending: false }).limit(80) : { data: [] };
  const list = (tab === 'inbox' ? inbox ?? [] : other ?? []) as A[];
  const safe = list.filter((a) => SAFE.includes(a.object_type));
  return (
    <Page title="Approvals" sub="Every request that needs a decision, in one place.">
      <Tabs current={tab === 'inbox' ? '/approvals' : `/approvals?tab=${tab}`} tabs={[{ href: '/approvals', label: 'Waiting for me', count: (inbox ?? []).length }, { href: '/approvals?tab=mine', label: 'My requests' }, ...(ctx.isStaff ? [{ href: '/approvals?tab=history', label: 'History' }] : [])]} />
      {tab === 'inbox' && safe.length > 1 && <form action={decide} className="mb-3">{safe.map((a) => <input key={a.id} type="hidden" name="id" value={a.id} />)}<input type="hidden" name="decision" value="approve" /><button className="btn-ghost">Approve all {safe.length} routine requests (leave, gate pass, posts)</button></form>}
      {list.length === 0 ? <Card><Empty title={tab === 'inbox' ? 'Nothing is waiting for you' : 'Nothing here yet'} hint="Leave, concessions, refunds, gate passes, circulars, purchase requests and corrections all arrive here." /></Card> : (
        <div className="space-y-3">{list.map((a) => (
          <Card key={a.id}><div className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="font-medium">{a.title}</div><div className="text-xs text-muted">{a.object_type.replace(/_/g, ' ')} · requested by {a.requested_by_name} · {ftime(a.created_at)}{a.amount ? ` · ${inr(a.amount)}` : ''}</div></div>
              <div className="flex items-center gap-2"><Badge>{a.status}</Badge>{a.status === 'pending' && <span className="text-xs text-muted">Step {a.current_step + 1} of {a.steps.length}: {String(a.steps[a.current_step]).replace(/_/g, ' ')}</span>}{a.status === 'pending' && a.sla_due && new Date(a.sla_due) < new Date() && <Badge tone="red">overdue</Badge>}</div>
            </div>
            {a.summary && <p className="mt-2 text-sm">{a.summary}</p>}
            {a.impact && <p className="mt-1 rounded-lg bg-paper px-3 py-2 text-sm"><span className="font-medium">Impact: </span>{a.impact}</p>}
            {tab === 'inbox' && <form action={decide} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={a.id} /><input name="comment" className="input max-w-sm" placeholder="Comment (optional)" aria-label="Comment" />
              <button name="decision" value="approve" className="btn">Approve</button><button name="decision" value="reject" className="btn-danger">Reject</button><button name="decision" value="info" className="btn-ghost">Ask for information</button></form>}
          </div></Card>))}</div>)}
    </Page>
  );
}
