import Link from 'next/link';
import { getCtx } from '@/lib/ctx';
import { entitiesOf, MODULE_TITLES } from '@/lib/nav';
import { MODULE_LINKS } from '@/lib/module-links';
import { Page } from '@/components/ui';

export const metadata = { title: 'All modules' };
export default async function Modules() {
  const ctx = await getCtx();
  return (
    <Page title="All modules" sub="One place per capability. Use Ctrl K to jump anywhere.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(MODULE_TITLES).map(([key, title]) => {
          const n = entitiesOf(key).filter((e) => ctx.can(e.cap)).length + (MODULE_LINKS[key] ?? []).filter((l) => !l.cap || ctx.can(l.cap)).length;
          return n ? <Link key={key} href={`/m/${key}`} className="card block p-4 hover:bg-paper"><div className="font-medium">{title}</div><p className="mt-1 text-sm text-muted">{n} screens</p></Link> : null;
        })}
      </div>
    </Page>
  );
}
