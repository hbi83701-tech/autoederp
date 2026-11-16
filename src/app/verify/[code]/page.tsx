import { createClient } from '@supabase/supabase-js';
import { fdate } from '@/lib/fmt';
import { PRODUCT } from '@/lib/nav';

export const metadata = { title: 'Verify a document' };
/** Public page behind the QR code on certificates and report cards. */
export default async function Verify({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.rpc('verify_document', { p_code: code });
  const d = data as { type: string; title: string; number: string; status: string; issued_on: string; school: string; student: string } | null;
  const good = d && (d.status === 'issued' || d.status === 'published');
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className={`card p-6 text-center ${good ? 'border-emerald-300' : 'border-red-300'}`}>
        <div className={`text-lg font-semibold ${good ? 'text-emerald-700' : 'text-red-700'}`}>{good ? 'Genuine document' : d ? 'This document has been revoked' : 'No document matches this code'}</div>
        {d && (
          <dl className="mt-4 space-y-1.5 text-left text-sm">
            {[['School', d.school], ['Document', `${String(d.type).replace(/_/g, ' ')}${d.title ? ` · ${d.title}` : ''}`], ['Number', d.number], ['Issued to', d.student], ['Issued on', fdate(d.issued_on)]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Verified by {PRODUCT.name}</p>
    </div>
  );
}
