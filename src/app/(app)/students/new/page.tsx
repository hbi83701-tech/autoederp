import { requireCap } from '@/lib/ctx';
import { Page, Card, Field } from '@/components/ui';
import { admitStudent } from '../actions';
import { today } from '@/lib/fmt';

export const metadata = { title: 'Admit student' };
export default async function NewStudent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCap('students', 'write');
  const [{ data: sections }, { data: houses }, { data: households }] = await Promise.all([
    ctx.sb.from('sections').select('id, name').eq('year_id', ctx.year?.id ?? '').order('name'),
    ctx.sb.from('masters').select('name').eq('type', 'house').order('sort'),
    ctx.sb.from('households').select('id, family_name, phone').order('family_name').limit(500),
  ]);
  return (
    <Page title="Admit a student" sub="One record for the student and the family. Siblings are matched to the same household by the parent's phone number.">
      <form action={admitStudent} className="space-y-4">
        {sp.enquiry_id && <input type="hidden" name="enquiry_id" value={sp.enquiry_id} />}
        <Card title="Student"><div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="First name *"><input className="input" name="first_name" required defaultValue={sp.first_name ?? ''} /></Field>
          <Field label="Last name"><input className="input" name="last_name" defaultValue={sp.last_name ?? ''} /></Field>
          <Field label="Date of birth"><input className="input" type="date" name="dob" defaultValue={sp.dob ?? ''} /></Field>
          <Field label="Gender"><select className="input" name="gender" defaultValue={sp.gender ?? ''}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
          <Field label="Section"><select className="input" name="section_id"><option value="">Not allocated yet</option>{(sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Joining date"><input className="input" type="date" name="joined_on" defaultValue={today()} /></Field>
          <Field label="Admission number" help="Leave blank to use the next number in the series."><input className="input" name="admission_no" /></Field>
          <Field label="Roll number"><input className="input" type="number" name="roll_no" /></Field>
          <Field label="House"><select className="input" name="house"><option value="">—</option>{(houses ?? []).map((h) => <option key={h.name}>{h.name}</option>)}</select></Field>
          <Field label="Mother tongue"><input className="input" name="mother_tongue" /></Field>
          <Field label="APAAR ID"><input className="input" name="apaar_id" /></Field>
          <Field label="PEN"><input className="input" name="pen" /></Field>
          <Field label="Previous school" span={2}><input className="input" name="previous_school" /></Field>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name="rte_quota" className="h-4 w-4" /> RTE quota</label>
        </div></Card>
        <Card title="Family"><div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Existing family" help="Pick this for a sibling. Otherwise fill in the parents below." span={3}><select className="input" name="household_id"><option value="">New family</option>{(households ?? []).map((h) => <option key={h.id} value={h.id}>{h.family_name}{h.phone ? ` · ${h.phone}` : ''}</option>)}</select></Field>
          <Field label="Parent 1 name"><input className="input" name="g1_name" defaultValue={sp.parent_name ?? ''} /></Field>
          <Field label="Relation"><select className="input" name="g1_relation"><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
          <Field label="Phone"><input className="input" name="g1_phone" inputMode="tel" defaultValue={sp.phone ?? ''} /></Field>
          <Field label="Email" span={3}><input className="input" type="email" name="g1_email" defaultValue={sp.email ?? ''} /></Field>
          <Field label="Parent 2 name"><input className="input" name="g2_name" /></Field>
          <Field label="Relation"><select className="input" name="g2_relation" defaultValue="Mother"><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
          <Field label="Phone"><input className="input" name="g2_phone" inputMode="tel" /></Field>
          <Field label="Address" span={2}><input className="input" name="address" /></Field>
          <Field label="City"><input className="input" name="city" /></Field>
        </div></Card>
        {ctx.can('sensitive', 'write') && <Card title="Health and statutory (restricted)"><div className="grid gap-4 p-4 sm:grid-cols-4">
          <Field label="Blood group"><input className="input" name="blood_group" /></Field>
          <Field label="Allergies"><input className="input" name="allergies" /></Field>
          <Field label="Emergency contact"><input className="input" name="emergency_contact" /></Field>
          <Field label="Category (optional)"><select className="input" name="category"><option value="">—</option>{['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div></Card>}
        <div className="flex items-center gap-4">
          <button className="btn">Admit student</button>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="confirm_duplicate" className="h-4 w-4" /> This is not a duplicate</label>
        </div>
      </form>
    </Page>
  );
}
