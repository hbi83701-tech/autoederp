import Link from 'next/link';
import type { ReactNode } from 'react';

export function Page({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-sky-50 text-sky-700', grey: 'bg-slate-100 text-slate-600', teal: 'bg-brand-soft text-brand-dark',
};
const STATUS_TONE: Record<string, string> = {
  active: 'green', approved: 'green', paid: 'green', published: 'green', valid: 'green', resolved: 'green', closed: 'grey', done: 'green', cleared: 'green', P: 'green', present: 'green', completed: 'green', handed_over: 'green', sent: 'green', issued: 'green', booked: 'blue', signed: 'teal', locked: 'teal', confirmed: 'green', matched: 'green', delivered: 'green', online: 'green', clear: 'green', in: 'green',
  pending: 'amber', requested: 'amber', due: 'amber', partial: 'amber', draft: 'grey', open: 'amber', in_progress: 'blue', waiting: 'amber', proposed: 'amber', L: 'amber', HD: 'amber', LV: 'blue', reviewed: 'blue', submitted: 'blue', scheduled: 'blue', running: 'blue', live: 'blue', trial: 'amber', received: 'amber', deposited: 'blue', unmatched: 'amber', queued: 'amber', on_notice: 'amber', admitted: 'blue', applicant: 'grey', info: 'blue',
  rejected: 'red', cancelled: 'grey', reversed: 'red', bounced: 'red', A: 'red', absent: 'red', overdue: 'red', suspended: 'red', withdrawn: 'grey', failed: 'red', revoked: 'red', critical: 'red', high: 'amber', flagged: 'red', denied: 'red', offline: 'grey', error: 'red', exited: 'grey', alumni: 'grey', waived: 'grey',
};
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? 'grey';
  return <span className={`badge ${TONES[t] ?? TONES.grey}`}>{typeof children === 'string' ? children.replace(/_/g, ' ') : children}</span>;
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'warn'; href?: string }) {
  const body = (
    <div className="card h-full p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="no-print flex items-center gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

/** Empty states explain the screen and offer the first action (PRD 18.2). */
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.href === current ? 'border-brand font-semibold text-brand' : 'border-transparent text-muted hover:text-ink'}`}>
          {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 text-xs text-brand-dark">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Field({ label, children, help, span = 1 }: { label: string; children: ReactNode; help?: string; span?: 1 | 2 | 3 }) {
  return (
    <label className={`block ${span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  );
}

export function Meter({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'red' | 'amber' }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${w}%`}>
      <div className={`h-full rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand'}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Horizontal bars with direct value labels; one series, one hue. */
export function BarList({ rows, format = (n) => String(n) }: { rows: { label: string; value: number; href?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2 p-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(90px,30%)_1fr_auto] items-center gap-3 text-sm">
          {r.href ? <Link href={r.href} className="link truncate">{r.label}</Link> : <span className="truncate">{r.label}</span>}
          <Meter value={r.value} max={max} />
          <span className="tabular-nums text-muted">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
