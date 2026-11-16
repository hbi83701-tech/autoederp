import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Field } from '@/components/ui';
import { go, str } from '@/lib/fmt';

export const metadata = { title: 'Forms and surveys' };
/** Form builder (FRM-01): one field per line as "Label | type | options | show-if". */
function parseFields(text: string) {
  return text.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map(([label, type, options, showIf], i) => ({ key: `f${i + 1}`, label, type: ['text', 'textarea', 'number', 'date', 'select', 'yesno', 'rating', 'file'].includes(type) ? type : 'text', options: options ? options.split(',').map((o) => o.trim()).filter(Boolean) : [], show_if: showIf || null }));
}
async function create(fd: FormData) { 'use server'; const ctx = await requireCap('forms', 'write'); const fields = parseFields(str(fd, 'fields') ?? ''); if (!fields.length) go('/forms', 'Add at least one question.', 'err'); const { error } = await ctx.sb.from('forms').insert({ title: str(fd, 'title'), description: str(fd, 'description'), audience: str(fd, 'audience'), fields, anonymous: fd.get('anonymous') === 'on', is_feedback_survey: fd.get('feedback') === 'on', maps_to: str(fd, 'maps_to'), closes_on: str(fd, 'closes_on'), status: 'published' }); go('/forms', error ? error.message : 'Form published. People in the audience see it in their app.', error ? 'err' : 'ok'); }
async function setStatus(fd: FormData) { 'use server'; const ctx = await requireCap('forms', 'write'); await ctx.sb.from('forms').update({ status: str(fd, 'status') }).eq('id', str(fd, 'id')!); go('/forms', 'Updated.'); }

export default async function Forms() {
  const ctx = await requireCap('forms');
  const { data } = await ctx.sb.from('forms').select('id, title, audience, status, anonymous, closes_on, responses:form_responses(count)').order('created_at', { ascending: false });
  const can = ctx.can('forms', 'write');
  return (
    <Page title="Forms and surveys" sub="Data collection, consent forms, feedback, surveys and polls, with conditional questions.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">{(data ?? []).length === 0 ? <Empty title="No forms yet" hint="Build a form on the right. Responses can update record fields, for example medical details." /> : <table className="tbl"><thead><tr><th>Form</th><th>For</th><th>Responses</th><th>Status</th><th></th></tr></thead><tbody>{data!.map((f) => <tr key={f.id}><td><Link className="link font-medium" href={`/forms/${f.id}`}>{f.title}</Link>{f.anonymous && <> <Badge tone="grey">anonymous</Badge></>}</td><td>{f.audience}</td><td>{(f.responses as unknown as { count: number }[])?.[0]?.count ?? 0}</td><td><Badge>{f.status}</Badge></td><td>{can && <form action={setStatus}><input type="hidden" name="id" value={f.id} /><button name="status" value={f.status === 'published' ? 'closed' : 'published'} className="btn-ghost btn-sm">{f.status === 'published' ? 'Close' : 'Reopen'}</button></form>}</td></tr>)}</tbody></table>}</Card>
        {can && <Card title="New form"><form action={create} className="space-y-3 p-4"><Field label="Title"><input name="title" required className="input" /></Field><Field label="Description"><input name="description" className="input" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Audience"><select name="audience" className="input">{['parents', 'students', 'staff', 'all'].map((a) => <option key={a}>{a}</option>)}</select></Field><Field label="Closes on"><input type="date" name="closes_on" className="input" /></Field></div>
          <Field label="Questions" help="One per line: Label | type | options | show-if. Types: text, textarea, number, date, select, yesno, rating, file. Show-if example: f1=Yes"><textarea name="fields" rows={6} required className="input font-mono text-xs" defaultValue={'Will your child join the trip? | yesno\nAny food allergy? | text | | f1=Yes\nRate the last PTM | rating'} /></Field>
          <Field label="Save answers to (optional)" help="For example student_sensitive.allergies"><input name="maps_to" className="input" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anonymous" className="h-4 w-4" /> Anonymous responses</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="feedback" className="h-4 w-4" /> Teacher feedback survey</label>
          <button className="btn w-full">Publish</button></form></Card>}
      </div>
    </Page>
  );
}
