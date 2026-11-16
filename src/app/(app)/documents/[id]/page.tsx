import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getCtx } from '@/lib/ctx';
import { PrintButton, ConfirmSubmit } from '@/components/client';
import { go, str } from '@/lib/fmt';

async function revoke(fd: FormData) { 'use server'; const ctx = await getCtx(); const id = str(fd, 'id')!; const { error } = await ctx.sb.from('issued_documents').update({ status: 'revoked' }).eq('id', id); go(`/documents/${id}`, error ? error.message : 'Revoked. The QR code now shows it as revoked.', error ? 'err' : 'ok'); }

export const metadata = { title: 'Document' };
export default async function Doc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { data: d } = await ctx.sb.from('issued_documents').select('*').eq('id', id).maybeSingle();
  if (!d) notFound();
  const h = await headers();
  const url = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}/verify/${d.verify_code}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, width: 88 });
  const branch = ctx.branches.find((b) => b.id === d.branch_id);
  // Template bodies are written by school admins; scripts and event handlers are stripped before rendering.
  const safe = String(d.body ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between"><Link className="link text-sm" href={ctx.isStaff ? '/documents' : '/parent/requests'}>Back</Link><span className="flex gap-2">{ctx.can('documents', 'write') && d.status === 'issued' && <form action={revoke}><input type="hidden" name="id" value={id} /><ConfirmSubmit className="btn-ghost" message="Revoke this document?">Revoke</ConfirmSubmit></form>}<PrintButton /></span></div>
      <div className="card relative p-8">
        {d.status === 'revoked' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-bold text-red-200" style={{ transform: 'rotate(-20deg)' }}>REVOKED</div>}
        <div className="border-b border-line pb-3 text-center"><div className="text-xl font-semibold">{ctx.org.name}</div><div className="text-sm text-muted">{branch?.name}{branch?.city ? `, ${branch.city}` : ''}</div></div>
        <div className="flex justify-between py-2 text-xs text-muted"><span>No. {d.number}</span></div>
        <div className="prose-sm leading-7" dangerouslySetInnerHTML={{ __html: safe }} />
        <div className="mt-8 flex items-end justify-between"><div className="text-xs text-muted">Issued by {d.issued_by_name}<br />Scan to verify this document</div><div dangerouslySetInnerHTML={{ __html: qr }} aria-label="Verification QR code" /></div>
      </div>
    </div>
  );
}
