import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCtx } from '@/lib/ctx';
import { entitiesOf, MODULE_TITLES } from '@/lib/nav';
import { Page } from '@/components/ui';
import { MODULE_LINKS } from '@/lib/module-links';

export default async function ModuleHub({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!MODULE_TITLES[module]) notFound();
  const ctx = await getCtx();
  const ents = entitiesOf(module).filter((e) => ctx.can(e.cap));
  const links = (MODULE_LINKS[module] ?? []).filter((l) => !l.cap || ctx.can(l.cap));
  if (!ents.length && !links.length) notFound();
  return (
    <Page title={MODULE_TITLES[module]} sub="Everything for this job in one place.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => <Link key={l.href} href={l.href} className="card block border-brand/30 p-4 hover:bg-brand-soft"><div className="font-medium text-brand-dark">{l.label}</div><p className="mt-1 text-sm text-muted">{l.desc}</p></Link>)}
        {ents.map((e) => <Link key={e.table} href={`/x/${e.table}`} className="card block p-4 hover:bg-paper"><div className="font-medium">{e.title}</div><p className="mt-1 text-sm text-muted">{e.desc || `${e.fields.length} fields · list, add, edit, export`}</p></Link>)}
      </div>
    </Page>
  );
}
