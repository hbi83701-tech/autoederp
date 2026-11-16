import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getCtx } from '@/lib/ctx';
import { Badge } from '@/components/ui';
import { PrintButton } from '@/components/client';
import { fdate } from '@/lib/fmt';
import type { Snapshot } from '@/lib/reportcards';
import { saveRemark } from '../actions';

export const metadata = { title: 'Report card' };
export default async function ReportCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const { data: c } = await ctx.sb.from('report_cards').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const s = c.snapshot as Snapshot;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const qr = c.verify_code ? await QRCode.toString(`${origin}/verify/${c.verify_code}`, { type: 'svg', margin: 0, width: 84 }) : null;
  if (!ctx.isStaff && c.status === 'published') await ctx.sb.rpc('log_view', { p_entity: 'report_cards', p_id: id, p_note: 'Opened by family' });
  const maxParts = Math.max(0, ...s.subjects.map((x) => x.parts.length));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between"><Link className="link text-sm" href={ctx.isStaff ? `/report-cards?section=${c.section_id}&term=${encodeURIComponent(c.term)}` : '/parent/academics'}>Back</Link><span className="flex items-center gap-2"><Badge>{c.status}</Badge><PrintButton /></span></div>
      <div className="card p-6">
        <div className="border-b border-line pb-3 text-center"><div className="text-xl font-semibold">{ctx.org.name}</div><div className="text-sm text-muted">Report card · {s.term} · {s.year}</div></div>
        <div className="grid grid-cols-2 gap-2 py-3 text-sm sm:grid-cols-4"><div><span className="text-muted">Name: </span><b>{s.student.name}</b></div><div><span className="text-muted">Class: </span>{s.section}</div><div><span className="text-muted">Roll no.: </span>{s.student.roll_no}</div><div><span className="text-muted">Admission no.: </span>{s.student.admission_no}</div></div>
        <table className="tbl"><thead><tr><th>Subject</th>{Array.from({ length: maxParts }, (_, i) => <th key={i} className="text-right">{s.subjects.find((x) => x.parts[i])?.parts[i]?.name ?? ''}</th>)}<th className="text-right">%</th><th>Grade</th></tr></thead>
          <tbody>{s.subjects.map((x) => <tr key={x.name}><td className="font-medium">{x.name}</td>{Array.from({ length: maxParts }, (_, i) => <td key={i} className="text-right tabular-nums">{x.parts[i] ? `${x.parts[i].marks}/${x.parts[i].max}` : ''}</td>)}<td className="text-right tabular-nums">{x.percent ?? (x.absent ? 'AB' : '—')}</td><td>{x.grade}</td></tr>)}
            <tr><td className="font-semibold" colSpan={maxParts + 1}>Overall</td><td className="text-right font-semibold tabular-nums">{s.overall ?? '—'}</td><td className="font-semibold">{s.overall_grade}</td></tr></tbody></table>
        {s.skills.length > 0 && <div className="mt-4"><div className="text-sm font-semibold">Skills and competencies</div><table className="tbl mt-1"><tbody>{s.skills.map((k, i) => <tr key={i}><td>{k.area}</td><td>{k.indicator}</td><td>{k.level}</td></tr>)}</tbody></table></div>}
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><span className="text-muted">Attendance: </span>{s.attendance.total ? `${s.attendance.present} of ${s.attendance.total} days (${s.attendance.percent}%)` : 'Not recorded'}</div>{s.rank && <div><span className="text-muted">Position in class: </span>{s.rank} of {s.class_size}</div>}</div>
        <div className="mt-4 space-y-3 text-sm">
          <div><div className="text-xs font-semibold text-muted">Class teacher&apos;s remark</div><p>{c.class_teacher_remark ?? '—'}</p></div>
          <div><div className="text-xs font-semibold text-muted">Principal&apos;s remark</div>{ctx.isStaff && ['principal', 'group_admin'].includes(ctx.role) && c.status !== 'published' ? <form action={saveRemark} className="no-print flex gap-2"><input type="hidden" name="id" value={id} /><input name="principal_remark" defaultValue={c.principal_remark ?? ''} className="input" aria-label="Principal's remark" /><button className="btn-ghost">Save</button></form> : <p>{c.principal_remark ?? '—'}</p>}</div>
        </div>
        <div className="mt-6 flex items-end justify-between text-xs text-muted">
          <div>Grading scale: {[...s.bands].sort((a, b) => b.min - a.min).map((b) => `${b.grade} ≥ ${b.min}`).join(' · ')}{c.published_at && <div>Published {fdate(c.published_at)} · digitally signed off by the Principal</div>}</div>
          {qr ? <div className="text-center"><div dangerouslySetInnerHTML={{ __html: qr }} aria-label="Verification QR code" /><div>Scan to verify</div></div> : <div>Not published. Preview only.</div>}
        </div>
      </div>
    </div>
  );
}
