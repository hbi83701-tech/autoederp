import Link from 'next/link';
import { signUp } from '../actions';

export const metadata = { title: 'Create account' };
export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <form action={signUp} className="space-y-4">
      <div><h1 className="text-xl font-semibold">{invite ? 'Accept your invite' : 'Create your account'}</h1>
        <p className="mt-1 text-sm text-muted">{invite ? 'Create a password to join your school.' : 'Next you will set up your school in about two minutes.'}</p></div>
      <input type="hidden" name="invite" value={invite ?? ''} />
      <label className="block"><span className="label">Your name</span><input className="input" name="full_name" required /></label>
      <label className="block"><span className="label">Email</span><input className="input" type="email" name="email" required autoComplete="email" /></label>
      <label className="block"><span className="label">Password</span><input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" /><span className="mt-1 block text-xs text-muted">At least 8 characters.</span></label>
      <button className="btn w-full">Create account</button>
      <p className="text-sm text-muted">Already have an account? <Link className="link" href={invite ? `/login?next=${encodeURIComponent(`/onboarding?invite=${invite}`)}` : '/login'}>Sign in</Link></p>
    </form>
  );
}
