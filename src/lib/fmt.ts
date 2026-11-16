import { redirect } from 'next/navigation';

/** Indian number format: 1,25,000 */
export const inr = (n: number | string | null | undefined) => 'Rs ' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const num = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('en-IN');
/** Lakh / crore short form for dashboards. */
export function inrShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `Rs ${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `Rs ${(n / 1e5).toFixed(2)} L`;
  return inr(n);
}
export const fdate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
export const ftime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
/** Today's date in India as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const fullName = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) => (p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : '');
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Redirect with a one-line message shown as a toast. */
export function go(path: string, msg?: string, kind: 'ok' | 'err' = 'ok'): never {
  if (!msg) redirect(path);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
}
export const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));
export const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' && v.trim() !== '' ? v.trim() : null; };
export const numv = (fd: FormData, k: string) => { const v = str(fd, k); return v === null || isNaN(Number(v)) ? null : Number(v); };
export const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};
