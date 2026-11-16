import { redirect } from 'next/navigation';
import { getCtx } from './ctx';

/** Student portal context (SAP-01). Parents can open the same pages for their child. */
export async function me() {
  const ctx = await getCtx();
  if (ctx.isStaff) redirect('/');
  const { data } = await ctx.sb.from('students').select('id, first_name, last_name, section_id, section:sections!students_section_id_fkey(name)').in('status', ['active', 'admitted']).order('dob').limit(1);
  const s = (data ?? [])[0] as unknown as { id: string; first_name: string; last_name: string | null; section_id: string | null; section: { name: string } | null } | undefined;
  return { ctx, s: s ?? null };
}
