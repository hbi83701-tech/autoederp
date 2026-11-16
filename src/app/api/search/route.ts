import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase/server';

/** Global search across students, staff and receipts, within the caller's permissions. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/[%,()]/g, ' ');
  if (q.length < 2) return NextResponse.json([]);
  const sb = await db();
  const like = `%${q}%`;
  const [st, sf, rc] = await Promise.all([
    sb.from('students').select('id, first_name, last_name, admission_no, status').or(`first_name.ilike.${like},last_name.ilike.${like},admission_no.ilike.${like}`).limit(6),
    sb.from('staff').select('id, first_name, last_name, designation').or(`first_name.ilike.${like},last_name.ilike.${like},emp_code.ilike.${like}`).limit(4),
    sb.from('receipts').select('id, receipt_no, total').ilike('receipt_no', like).limit(4),
  ]);
  return NextResponse.json([
    ...(st.data ?? []).map((s) => ({ label: `${s.first_name} ${s.last_name ?? ''}`.trim(), sub: `Student · ${s.admission_no ?? s.status}`, href: `/students/${s.id}` })),
    ...(sf.data ?? []).map((s) => ({ label: `${s.first_name} ${s.last_name ?? ''}`.trim(), sub: `Staff · ${s.designation ?? ''}`, href: `/hr/staff/${s.id}` })),
    ...(rc.data ?? []).map((r) => ({ label: r.receipt_no, sub: `Receipt · Rs ${Number(r.total).toLocaleString('en-IN')}`, href: `/receipt/${r.id}` })),
  ]);
}
