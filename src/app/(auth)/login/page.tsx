import Link from 'next/link';
import { signIn } from '../actions';
import { PRODUCT } from '@/lib/nav';

export const metadata = { title: 'Sign in' };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <form action={signIn} className="space-y-4">
      <div><h1 className="text-xl font-semibold">Sign in to {PRODUCT.name}</h1><p className="mt-1 text-sm text-muted">Staff, parents and students use the same sign-in.</p></div>
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block"><span className="label">Email</span><input className="input" type="email" name="email" required autoComplete="email" /></label>
      <label className="block"><span className="label">Password</span><input className="input" type="password" name="password" required autoComplete="current-password" /></label>
      <button className="btn w-full">Sign in</button>
      <p className="text-sm text-muted">New school or have an invite? <Link className="link" href="/signup">Create an account</Link></p>
    </form>
  );
}
