import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { BOARDS } from '@/lib/pack';
import { acceptInvite, createSchool } from '../actions';
import { signOut } from '@/lib/actions';

export const metadata = { title: 'Set up' };
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
  if (profile?.org_id) redirect('/');
  return (
    <div className="space-y-8">
      {invite ? (
        <form action={acceptInvite} className="space-y-4">
          <h1 className="text-xl font-semibold">Join your school</h1>
          <p className="text-sm text-muted">You are signed in as {user.email}. Accept the invite to continue.</p>
          <input type="hidden" name="token" value={invite} />
          <button className="btn w-full">Accept invite</button>
        </form>
      ) : (
        <>
          <form action={createSchool} className="space-y-4">
            <div><h1 className="text-xl font-semibold">Set up your school</h1><p className="mt-1 text-sm text-muted">We install a ready pack for your board: grades, subjects, grading scale, fee heads, leave types, approvals and templates. You can change all of it later.</p></div>
            <label className="block"><span className="label">School or group name</span><input className="input" name="name" required /></label>
            <label className="block"><span className="label">First branch (campus) name</span><input className="input" name="branch" placeholder="Main campus" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Board</span><select className="input" name="board">{BOARDS.map((b) => <option key={b}>{b}</option>)}</select></label>
              <label className="block"><span className="label">City</span><input className="input" name="city" /></label>
            </div>
            <button className="btn w-full">Create school</button>
          </form>
          <form action={acceptInvite} className="space-y-3 border-t border-line pt-6">
            <h2 className="text-sm font-semibold">Have an invite code instead?</h2>
            <input className="input" name="token" placeholder="Paste the invite code" required />
            <button className="btn-ghost w-full">Join with invite</button>
          </form>
        </>
      )}
      <form action={signOut}><button className="text-sm text-muted underline">Sign out</button></form>
    </div>
  );
}
