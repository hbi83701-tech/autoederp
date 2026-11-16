import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field, Tabs } from '@/components/ui';
import { go, str, numv, today, fdate, ftime, fullName } from '@/lib/fmt';
import { workingDay, weekday } from '@/lib/calendar';

export const metadata = { title: 'Homework and diary' };
/** One "post to class" composer (HW-01) with optional coordinator approval (HW-02) and submissions (HW-03). */
async function post(fd: FormData) {
  'use server';
  const ctx = await requireCap('homework', 'write');
  const sections = fd.getAll('section_id').map(String).filter(Boolean);
  if (!sections.length) go('/homework', 'Choose at least one section.', 'err');
  const needsApproval = ((ctx.org.settings ?? {}) as { homework_approval?: boolean }).homework_approval === true && ['class_teacher', 'subject_teacher'].includes(ctx.role);
  const { data: secs } = await ctx.sb.from('sections').select('id, branch_id, name').in('id', sections);
  const rows = (secs ?? []).map((s) => ({ type: str(fd, 'type') ?? 'homework', section_id: s.id, branch_id: s.branch_id, subject_id: str(fd, 'subject_id'), title: str(fd, 'title'), body: str(fd, 'body'), due_date: str(fd, 'due_date'), allow_submission: fd.get('allow_submission') === 'on', max_marks: numv(fd, 'max_marks'), attachment_path: str(fd, 'attachment_path'), status: needsApproval ? 'pending' : 'published', posted_by_name: ctx.name }));
  const { data: ins, error } = await ctx.sb.from('posts').insert(rows).select('id, section_id, title');
  if (error) go('/homework', error.message, 'err');
  if (needsApproval) for (const p of ins ?? []) await ctx.sb.rpc('submit_approval', { p_type: 'post', p_object: p.id, p_title: `Post: ${p.title}`, p_summary: str(fd, 'body') });
  else {
    // Parents see it in the app straight away, in one daily digest per child.
    const { data: studs } = await ctx.sb.from('students').select('household_id').in('section_id', sections).eq('status', 'active');
    const { data: gs } = await ctx.sb.from('guardians').select('user_id').in('household_id', [...new Set((studs ?? []).map((s) => s.household_id).filter(Boolean))]).not('user_id', 'is', null);
    const users = [...new Set((gs ?? []).map((g) => g.user_id))];
    if (users.length) await ctx.sb.from('notifications').insert(users.map((u) => ({ org_id: ctx.org.id, user_id: u, title: `New ${str(fd, 'type') ?? 'homework'}: ${str(fd, 'title')}`, body: str(fd, 'due_date') ? `Due ${str(fd, 'due_date')}` : null, link: '/parent', kind: 'homework' })));
  }
  go('/homework', needsApproval ? 'Sent to the coordinator for approval.' : `Posted to ${rows.length} section${rows.length > 1 ? 's' : ''}. Parents and students can see it now.`);
}
async function grade(fd: FormData) {
  'use server';
  const ctx = await requireCap('homework', 'write');
  await ctx.sb.from('post_submissions').update({ marks: numv(fd, 'marks'), feedback: str(fd, 'feedback') }).eq('id', str(fd, 'id')!);
  go(`/homework?open=${str(fd, 'post')}`, 'Saved.');
}

export default async function Homework({ searchParams }: { searchParams: Promise<{ section?: string; tab?: string; open?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCap('homework');
  const tab = sp.tab ?? 'posts';
  const d = today();
  let sq = ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name');
  if (ctx.branchId) sq = sq.eq('branch_id', ctx.branchId);
  const mine = ['class_teacher', 'subject_teacher'].includes(ctx.role);
  let pq = ctx.sb.from('posts').select('id, type, title, body, due_date, status, posted_by_name, created_at, allow_submission, section:sections!posts_section_id_fkey(name), subject:subjects!posts_subject_id_fkey(name)').order('created_at', { ascending: false }).limit(60);
  if (mine) pq = pq.eq('created_by', ctx.user.id);
  if (sp.section) pq = pq.eq('section_id', sp.section);
  const [{ data: sections }, { data: subjects }, { data: posts }, { data: ta }] = await Promise.all([sq, ctx.sb.from('subjects').select('id, name').order('name'), pq,
    mine && ctx.profile.staff_id ? ctx.sb.from('teacher_assignments').select('section_id').eq('staff_id', ctx.profile.staff_id) : Promise.resolve({ data: [] })]);
  const own = new Set((ta ?? []).map((t) => t.section_id));
  const secs = [...(sections ?? [])].sort((a, b) => Number(own.has(b.id)) - Number(own.has(a.id)));
  const can = ctx.can('homework', 'write');
  const P = (posts ?? []) as unknown as { id: string; type: string; title: string; body: string; due_date: string | null; status: string; posted_by_name: string; created_at: string; allow_submission: boolean; section: { name: string } | null; subject: { name: string } | null }[];
  return (
    <Page title="Homework and diary" sub="One composer for homework, class notes, circulars to a class and resources.">
      <Tabs current={tab === 'posts' ? '/homework' : `/homework?tab=${tab}`} tabs={[{ href: '/homework', label: 'Posts' }, { href: '/homework?tab=compliance', label: 'Posting compliance' }]} />
      {tab === 'compliance' ? <Compliance /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {can && <Card title="Post to class"><form action={post} className="space-y-3 p-4">
            <Field label="Type"><select name="type" className="input">{['homework', 'classwork', 'note', 'circular', 'resource', 'diary'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Sections" help="Your own classes are listed first. Hold Ctrl to pick several."><select name="section_id" multiple required size={Math.min(6, Math.max(3, secs.length))} className="input" defaultValue={sp.section ? [sp.section] : []}>{secs.map((s) => <option key={s.id} value={s.id}>{s.name}{own.has(s.id) ? ' · mine' : ''}</option>)}</select></Field>
            <Field label="Subject"><select name="subject_id" className="input"><option value="">—</option>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Title"><input name="title" className="input" required /></Field>
            <Field label="Details"><textarea name="body" className="input" rows={4} /></Field>
            <Field label="Link to attachment (optional)"><input name="attachment_path" className="input" placeholder="https://…" /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Due date"><input type="date" name="due_date" className="input" min={d} /></Field><Field label="Max marks"><input type="number" name="max_marks" className="input" /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_submission" className="h-4 w-4" /> Students submit online</label>
            <button className="btn w-full">Post</button></form></Card>}
          <div className={`space-y-3 ${can ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {P.length === 0 ? <Card><Empty title="Nothing posted yet" hint="Posts appear in the parent and student apps as soon as they are published." /></Card> : P.map((p) => (
              <Card key={p.id}><div className="p-4"><div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone="teal">{p.type}</Badge><span className="font-medium">{p.title}</span><Badge>{p.status}</Badge></div>
                <div className="mt-0.5 text-xs text-muted">{p.section?.name} · {p.subject?.name ?? 'General'} · {p.posted_by_name} · {ftime(p.created_at)}{p.due_date ? ` · due ${fdate(p.due_date)}` : ''}</div>
                {p.body && <p className="mt-2 whitespace-pre-wrap text-sm">{p.body}</p>}
                {p.allow_submission && <Link className="link mt-2 inline-block text-sm" href={`/homework?open=${p.id}`}>View submissions</Link>}
                {sp.open === p.id && <Submissions postId={p.id} />}</div></Card>))}
          </div>
        </div>)}
    </Page>
  );

  async function Submissions({ postId }: { postId: string }) {
    const { data } = await ctx.sb.from('post_submissions').select('id, body, file_path, submitted_at, late, marks, feedback, student:students!post_submissions_student_id_fkey(first_name, last_name)').eq('post_id', postId);
    const rows = (data ?? []) as unknown as { id: string; body: string; file_path: string | null; submitted_at: string; late: boolean; marks: number | null; feedback: string | null; student: { first_name: string; last_name: string } | null }[];
    return rows.length === 0 ? <p className="mt-2 text-sm text-muted">No submissions yet.</p> : <ul className="mt-2 divide-y divide-line border-t border-line text-sm">{rows.map((s) => <li key={s.id} className="py-2"><div className="font-medium">{fullName(s.student)} {s.late && <Badge tone="amber">late</Badge>}</div><p className="text-muted">{s.body}</p>
      {can && <form action={grade} className="mt-1 flex gap-2"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="post" value={postId} /><input name="marks" type="number" defaultValue={s.marks ?? ''} placeholder="Marks" className="input !w-24 !py-1" aria-label="Marks" /><input name="feedback" defaultValue={s.feedback ?? ''} placeholder="Feedback" className="input !py-1" aria-label="Feedback" /><button className="btn-ghost btn-sm">Save</button></form>}</li>)}</ul>;
  }

  /** Posting compliance (HW-05): which teachers posted for which sections today. Replaces manual checking. */
  async function Compliance() {
    const wd = await workingDay(ctx, d);
    const [{ data: tt }, { data: todays }] = await Promise.all([
      ctx.sb.from('timetable_entries').select('section_id, staff_id, section:sections!timetable_entries_section_id_fkey(name), staff:staff!timetable_entries_staff_id_fkey(first_name, last_name, user_id)').eq('day', weekday(d)).not('staff_id', 'is', null).limit(3000),
      ctx.sb.from('posts').select('section_id, created_by').gte('created_at', d + 'T00:00:00+05:30'),
    ]);
    const posted = new Set((todays ?? []).map((p) => `${p.section_id}:${p.created_by}`));
    const seen = new Map<string, { section: string; teacher: string; ok: boolean }>();
    for (const t of (tt ?? []) as unknown as { section_id: string; staff_id: string; section: { name: string } | null; staff: { first_name: string; last_name: string; user_id: string | null } | null }[])
      seen.set(`${t.section_id}:${t.staff_id}`, { section: t.section?.name ?? '', teacher: fullName(t.staff), ok: posted.has(`${t.section_id}:${t.staff?.user_id}`) });
    const rows = [...seen.values()].sort((a, b) => Number(a.ok) - Number(b.ok) || a.section.localeCompare(b.section));
    if (!wd.working) return <Card><Empty title="No posts are expected today" hint={`${wd.reason}. Holidays, weekends and exam days are never counted as misses.`} /></Card>;
    return <Card title={`${rows.filter((r) => r.ok).length} of ${rows.length} teacher-section pairs have posted today`}>{rows.length === 0 ? <Empty title="No timetable for today" hint="Posting expectations come from the timetable." /> : <table className="tbl"><thead><tr><th>Section</th><th>Teacher</th><th>Today</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.section}</td><td>{r.teacher}</td><td>{r.ok ? <Badge tone="green">posted</Badge> : <Badge tone="amber">not yet</Badge>}</td></tr>)}</tbody></table>}</Card>;
  }
}
