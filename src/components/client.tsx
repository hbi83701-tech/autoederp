'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/** Toast for the ?ok= / ?err= message that server actions redirect with. */
export function Flash() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const ok = sp.get('ok'), err = sp.get('err');
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  useEffect(() => {
    if (!ok && !err) return;
    setMsg({ text: (err ?? ok)!, bad: !!err });
    const rest = new URLSearchParams(sp.toString());
    rest.delete('ok'); rest.delete('err');
    router.replace(path + (rest.size ? `?${rest}` : ''), { scroll: false });
    const t = setTimeout(() => setMsg(null), err ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [ok, err]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!msg) return null;
  return (
    <div role="status" className={`no-print fixed bottom-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${msg.bad ? 'bg-red-600' : 'bg-ink'}`}>
      {msg.text}
      <button className="ml-3 opacity-70" onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
    </div>
  );
}

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>{label}</button>;
}

/** Destructive and money actions ask first (PRD 18.2). */
export function ConfirmSubmit({ children, message, className = 'btn-danger', name, value }: { children: ReactNode; message: string; className?: string; name?: string; value?: string }) {
  return <button type="submit" name={name} value={value} className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}

export function AutoSubmitSelect({ name, value, options, className = 'input', label }: { name: string; value: string; options: { value: string; label: string }[]; className?: string; label: string }) {
  return (
    <select name={name} defaultValue={value} aria-label={label} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

type Hit = { label: string; sub?: string; href: string };
/** Global search and command palette: Ctrl / Cmd + K. */
export function CommandPalette({ pages }: { pages: Hit[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); else { setQ(''); setHits([]); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setHits(await r.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const pageHits = q.trim() ? pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : pages.slice(0, 8);
  const all = [...hits, ...pageHits];
  const pick = (h: Hit) => { setOpen(false); router.push(h.href); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="no-print flex min-w-0 flex-1 max-w-xs items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-left text-sm text-muted hover:bg-white">
        <span className="flex-1 truncate">Search students, staff, receipts…</span><kbd className="hidden rounded border border-line bg-white px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div className="mx-auto max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && all[0]) pick(all[0]); }}
              placeholder="Type a name, admission number, receipt number or page" className="w-full border-b border-line px-4 py-3 text-sm outline-none" aria-label="Search" />
            <ul className="max-h-80 overflow-y-auto py-1">
              {all.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matches. Try a different spelling.</li>}
              {all.map((h, i) => (
                <li key={h.href + i}>
                  <button type="button" onClick={() => pick(h)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-brand-soft">
                    <span className="truncate">{h.label}</span>{h.sub && <span className="shrink-0 text-xs text-muted">{h.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** Collapsible sidebar on phones. */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" className="btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
      {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-60 transform overflow-y-auto border-r border-line bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>{children}</aside>
    </>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
  return <Link href={href} className={`block rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-brand-soft font-semibold text-brand-dark' : 'text-ink hover:bg-paper'}`}>{children}</Link>;
}
