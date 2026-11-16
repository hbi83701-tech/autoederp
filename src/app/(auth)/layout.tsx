import { Suspense } from 'react';
import Link from 'next/link';
import { Flash } from '@/components/client';
import { PRODUCT } from '@/lib/nav';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">{PRODUCT.name}</div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">One screen every morning.<br />Every part of the school.</h1>
          <p className="mt-4 max-w-md text-white/80">Students, academics, fees, people, operations, safety and communication on one configurable platform, for a single school or a whole group.</p>
        </div>
        <p className="text-sm text-white/70">Product owner: {PRODUCT.owner}, {PRODUCT.ownerTitle} · <Link href="/about" className="underline">About</Link></p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <Suspense><Flash /></Suspense>
    </div>
  );
}
