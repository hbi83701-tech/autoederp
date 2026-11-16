import { NextResponse } from 'next/server';
import { getCtx } from '@/lib/ctx';

const x = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Tally Prime voucher import file (ACC-04). Import in Tally via Import Data > Vouchers. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx.can('accounting')) return new NextResponse('Not allowed', { status: 403 });
  const { data } = await ctx.sb.from('vouchers').select('voucher_no, date, type, narration, lines:voucher_lines(debit, credit, account:accounts!voucher_lines_account_id_fkey(name))').order('date').limit(5000);
  const type: Record<string, string> = { receipt: 'Receipt', payment: 'Payment', journal: 'Journal', contra: 'Contra' };
  const body = (data ?? []).map((v) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type[v.type] ?? 'Journal'}" ACTION="Create"><DATE>${String(v.date).replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${type[v.type] ?? 'Journal'}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(v.voucher_no)}</VOUCHERNUMBER><NARRATION>${x(v.narration)}</NARRATION>${(v.lines as unknown as { debit: number; credit: number; account: { name: string } | null }[]).map((l) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(l.account?.name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${Number(l.debit) > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${Number(l.debit) > 0 ? -Number(l.debit) : Number(l.credit)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('')}</VOUCHER></TALLYMESSAGE>`).join('');
  const xml = `<?xml version="1.0"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  await ctx.sb.from('export_log').insert({ report: 'Tally voucher export', row_count: (data ?? []).length, actor_name: ctx.name });
  return new NextResponse(xml, { headers: { 'content-type': 'application/xml', 'content-disposition': 'attachment; filename="tally-vouchers.xml"' } });
}
