import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getCtx } from '@/lib/ctx';
import { Badge } from '@/components/ui';
import { PrintButton } from '@/components/client';
import { fullName, fdate, inr } from '@/lib/fmt';
import { requestReversal } from '../../fees/actions';

export const metadata = { title: 'Receipt' };
/** Printable receipt. Several ids (comma separated) print one receipt per child from the same payment. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ids = decodeURIComponent(id).split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const ctx = await getCtx();
  const { data } = await ctx.sb.from('receipts').select('*, student:students!receipts_student_id_fkey(first_name, last_name, admission_no, section:sections!students_section_id_fkey(name)), payments:receipt_payments(mode, amount, reference, cheque_no, cheque_status), allocations:receipt_allocations(amount, demand:fee_demands!receipt_allocations_demand_id_fkey(label, head:fee_heads!fee_demands_head_id_fkey(name)))').in('id', ids);
  if (!data?.length) notFound();
  const branch = (b: string | null) => ctx.branches.find((x) => x.id === b);
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between"><Link className="link text-sm" href={ctx.isStaff ? '/fees/counter' : '/parent/fees'}>Back</Link><PrintButton label="Print receipt" /></div>
      {await Promise.all(data.map(async (r) => {
        const qr = await QRCode.toString(`${r.receipt_no}|${r.total}|${r.date}`, { type: 'svg', margin: 0, width: 72 });
        const reversed = r.status === 'reversed';
        return (
          <div key={r.id} className="card relative mb-6 overflow-hidden p-6" style={{ breakAfter: 'page' }}>
            {reversed && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-bold text-red-200" style={{ transform: 'rotate(-20deg)' }}>CANCELLED</div>}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
              <div><div className="text-lg font-semibold">{ctx.org.name}</div><div className="text-sm text-muted">{branch(r.branch_id)?.name}{branch(r.branch_id)?.city ? `, ${branch(r.branch_id)?.city}` : ''}</div>{ctx.org.gst_no && <div className="text-xs text-muted">GSTIN {ctx.org.gst_no}</div>}</div>
              <div className="text-right text-sm"><div className="font-semibold">Fee receipt</div><div>{r.receipt_no}</div><div className="text-muted">{fdate(r.date)}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-2 py-3 text-sm"><div><span className="text-muted">Student: </span>{fullName(r.student)}</div><div><span className="text-muted">Class: </span>{r.student?.section?.name}</div><div><span className="text-muted">Admission no.: </span>{r.student?.admission_no}</div><div><span className="text-muted">Collected by: </span>{r.collected_by_name} ({r.channel})</div></div>
            <table className="tbl"><thead><tr><th>Fee</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{(r.allocations as { amount: number; demand: { label: string; head: { name: string } | null } | null }[]).map((a, i) => <tr key={i}><td>{a.demand?.head?.name}<span className="text-muted"> · {a.demand?.label}</span></td><td className="text-right tabular-nums">{inr(a.amount)}</td></tr>)}
                <tr><td className="font-semibold">Total received</td><td className="text-right font-semibold tabular-nums">{inr(r.total)}</td></tr></tbody></table>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="text-sm">{(r.payments as { mode: string; amount: number; reference: string | null; cheque_no: string | null; cheque_status: string | null }[]).map((p, i) => <div key={i}><span className="capitalize">{p.mode.replace('_', ' ')}</span>: {inr(p.amount)} {p.reference ?? p.cheque_no ?? ''} {p.cheque_status && <Badge>{p.cheque_status}</Badge>}</div>)}
                {reversed && <div className="mt-1 text-red-700">Reversed: {r.reversed_reason}</div>}
                {['cheque', 'dd'].some((m) => (r.payments as { mode: string }[]).some((p) => p.mode === m)) && <div className="mt-1 text-xs text-muted">Cheque payments are subject to realisation.</div>}</div>
              <div dangerouslySetInnerHTML={{ __html: qr }} aria-label="Receipt QR code" />
            </div>
            {ctx.can('fees', 'write') && !reversed && (
              <details className="no-print mt-4 border-t border-line pt-3 text-sm"><summary className="cursor-pointer text-red-700">Cancel this receipt</summary>
                <form action={requestReversal} className="mt-2 flex gap-2"><input type="hidden" name="id" value={r.id} /><input name="reason" required placeholder="Reason for cancellation" className="input" aria-label="Reason" /><button className="btn-danger">Request approval</button></form>
                <p className="mt-1 text-xs text-muted">Receipts are never edited or deleted. An approved cancellation posts a reversal and puts the amount back in dues.</p></details>)}
          </div>);
      }))}
    </div>
  );
}
