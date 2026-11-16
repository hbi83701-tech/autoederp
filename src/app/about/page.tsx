import Link from 'next/link';
import { PRODUCT } from '@/lib/nav';

export const metadata = { title: 'About' };
export default function About() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{PRODUCT.name}</h1>
      <p className="mt-1 text-muted">{PRODUCT.tagline}</p>
      <dl className="card mt-6 divide-y divide-line text-sm">
        {[['Product', `${PRODUCT.name} (School Operating System)`], ['Product owner', `${PRODUCT.owner}, ${PRODUCT.ownerTitle}`], ['Built by', PRODUCT.company], ['Version', '1.0']].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-muted">One configurable platform to run every part of a school or school group: students, academics, fees, people, operations, safety and communication.</p>
      <p className="mt-6"><Link href="/" className="link">Go to the app</Link></p>
    </div>
  );
}
