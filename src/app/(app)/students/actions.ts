'use server';
import { getCtx } from '@/lib/ctx';
import { go, str, numv, today } from '@/lib/fmt';

export async function admitStudent(fd: FormData) {
  const ctx = await getCtx();
  const sb = ctx.sb;
  const first = str(fd, 'first_name'), dob = str(fd, 'dob'), phone = str(fd, 'g1_phone');
  if (!first) go('/students/new', 'Enter the student name.', 'err');
  // Duplicate checks on student and family (SIS-02)
  if (fd.get('confirm_duplicate') !== 'on') {
    const { data: dup } = dob ? await sb.from('students').select('id, first_name, last_name').ilike('first_name', first!).eq('dob', dob).limit(1) : { data: [] };
    if (dup?.length) go('/students/new', `A student named ${dup[0].first_name} ${dup[0].last_name ?? ''} with this date of birth already exists. Tick "This is not a duplicate" to continue.`, 'err');
  }
  let household = str(fd, 'household_id');
  if (!household && phone) {
    const { data: g } = await sb.from('guardians').select('household_id').eq('phone', phone).limit(1);
    if (g?.length) household = g[0].household_id; // existing family: siblings share one household record
  }
  if (!household) {
    const { data: h, error } = await sb.from('households').insert({ family_name: str(fd, 'family_name') ?? `${str(fd, 'last_name') ?? first} family`, address: str(fd, 'address'), city: str(fd, 'city'), phone }).select('id').single();
    if (error) go('/students/new', error.message, 'err');
    household = h!.id;
    const guardians = [1, 2].map((n) => ({ household_id: household, name: str(fd, `g${n}_name`), relation: str(fd, `g${n}_relation`) ?? (n === 1 ? 'Father' : 'Mother'), phone: str(fd, `g${n}_phone`), email: str(fd, `g${n}_email`), is_primary: n === 1 })).filter((g) => g.name);
    if (guardians.length) await sb.from('guardians').insert(guardians);
  }
  const sectionId = str(fd, 'section_id');
  const { data: sec } = sectionId ? await sb.from('sections').select('id, branch_id, programme_id').eq('id', sectionId).single() : { data: null };
  const branchId = sec?.branch_id ?? ctx.branchId ?? ctx.branches[0]?.id;
  const { data: admNo } = await sb.rpc('next_no', { p_key: 'admission', p_prefix: `${ctx.year?.name.slice(2, 4) ?? ''}A`, p_scope: branchId ?? '' });
  const { data: st, error } = await sb.from('students').insert({
    household_id: household, branch_id: branchId, admission_no: str(fd, 'admission_no') ?? admNo, first_name: first, last_name: str(fd, 'last_name'), dob, gender: str(fd, 'gender'),
    programme_id: sec?.programme_id ?? null, section_id: sectionId, roll_no: numv(fd, 'roll_no'), house: str(fd, 'house'), mother_tongue: str(fd, 'mother_tongue'),
    apaar_id: str(fd, 'apaar_id'), pen: str(fd, 'pen'), joined_on: str(fd, 'joined_on') ?? today(), previous_school: str(fd, 'previous_school'), rte_quota: fd.get('rte_quota') === 'on',
  }).select('id').single();
  if (error) go('/students/new', error.message, 'err');
  await Promise.all([
    sb.from('enrolments').insert({ student_id: st!.id, branch_id: branchId, year_id: ctx.year?.id, programme_id: sec?.programme_id, section_id: sectionId, roll_no: numv(fd, 'roll_no') }),
    sb.from('student_status_events').insert({ student_id: st!.id, to_status: 'active', reason: 'Admission', actor_name: ctx.name }),
    ctx.can('sensitive', 'write') ? sb.from('student_sensitive').insert({ student_id: st!.id, blood_group: str(fd, 'blood_group'), allergies: str(fd, 'allergies'), category: str(fd, 'category'), emergency_contact: str(fd, 'emergency_contact') }) : Promise.resolve(),
    str(fd, 'enquiry_id') ? sb.from('enquiries').update({ status: 'admitted', student_id: st!.id }).eq('id', str(fd, 'enquiry_id')!) : Promise.resolve(),
    sb.from('prejoining_tasks').insert(['Uniform and book order', 'Transport route selection', 'Medical form', 'ID photo', 'Parent app onboarding'].map((task) => ({ student_id: st!.id, task }))),
  ]);
  go(`/students/${st!.id}`, 'Student admitted. Assign a fee plan from the Fees tab.');
}

export async function changeStatus(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'id')!;
  const { error } = await ctx.sb.rpc('change_student_status', { p_student: id, p_to: str(fd, 'to'), p_reason: str(fd, 'reason'), p_date: str(fd, 'date') ?? today() });
  go(`/students/${id}?tab=timeline`, error ? error.message : 'Status changed and recorded.', error ? 'err' : 'ok');
}

export async function addGrowth(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'student_id')!;
  const { error } = await ctx.sb.from('growth_records').insert({ student_id: id, type: str(fd, 'type'), category: str(fd, 'category'), note: str(fd, 'note'), visibility: str(fd, 'visibility') ?? 'teacher', points: numv(fd, 'points'), share_with_parent: fd.get('share_with_parent') === 'on', follow_up_date: str(fd, 'follow_up_date'), recorded_by_name: ctx.name });
  go(`/students/${id}?tab=growth`, error ? error.message : 'Recorded.', error ? 'err' : 'ok');
}

export async function saveSensitive(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'student_id')!;
  const row = Object.fromEntries(['blood_group', 'allergies', 'chronic_conditions', 'medications', 'medical_notes', 'doctor_name', 'doctor_phone', 'emergency_contact', 'vaccination', 'category', 'religion', 'aadhaar_last4'].map((k) => [k, str(fd, k)]));
  const { error } = await ctx.sb.from('student_sensitive').upsert({ student_id: id, ...row }, { onConflict: 'student_id' });
  go(`/students/${id}?tab=health`, error ? error.message : 'Saved.', error ? 'err' : 'ok');
}

export async function requestConcession(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'student_id')!;
  const typeId = str(fd, 'type_id');
  const { data: type } = typeId ? await ctx.sb.from('concession_types').select('*').eq('id', typeId).single() : { data: null };
  const kind = str(fd, 'kind') ?? type?.kind ?? 'percent';
  const value = numv(fd, 'value') ?? Number(type?.value ?? 0);
  const { data: dem } = await ctx.sb.from('fee_demands').select('amount, concession, paid, head:fee_heads!fee_demands_head_id_fkey(type)').eq('student_id', id).in('status', ['due', 'partial']);
  const base = ((dem ?? []) as unknown as { amount: number; concession: number; paid: number; head: { type: string } | null }[]).filter((d) => d.head?.type === (type?.head_type ?? 'tuition')).reduce((t, d) => t + Number(d.amount) - Number(d.concession) - Number(d.paid), 0);
  const impact = kind === 'percent' ? Math.round((base * value) / 100) : Math.min(value, base);
  if (type?.max_amount && impact > Number(type.max_amount)) go(`/students/${id}?tab=fees`, `This is above the limit of Rs ${type.max_amount} for ${type.name}.`, 'err');
  const { data: c, error } = await ctx.sb.from('concessions').insert({ student_id: id, year_id: ctx.year?.id, type_id: typeId, kind, value, reason: str(fd, 'reason') }).select('id').single();
  if (error) go(`/students/${id}?tab=fees`, error.message, 'err');
  const { data: s } = await ctx.sb.from('students').select('first_name, last_name').eq('id', id).single();
  const { error: e2 } = await ctx.sb.rpc('submit_approval', { p_type: 'concession', p_object: c!.id, p_title: `${type?.name ?? 'Concession'} for ${s?.first_name} ${s?.last_name ?? ''}`, p_summary: str(fd, 'reason'), p_amount: impact, p_student: id, p_impact: `Reduces open ${type?.head_type ?? 'tuition'} dues by about Rs ${impact.toLocaleString('en-IN')} (${kind === 'percent' ? value + '%' : 'fixed'}).` });
  go(`/students/${id}?tab=fees`, e2 ? e2.message : `Concession requested. Effect on dues: about Rs ${impact.toLocaleString('en-IN')}. It applies when approved.`, e2 ? 'err' : 'ok');
}

/** Bulk section transfer with preview on the page; records enrolment history (SIS-04, GRP-03). */
export async function bulkTransfer(fd: FormData) {
  const ctx = await getCtx();
  const ids = fd.getAll('ids').map(String);
  const to = str(fd, 'to_section');
  if (!ids.length || !to) go('/students/bulk', 'Select students and a destination section.', 'err');
  const { data: sec } = await ctx.sb.from('sections').select('id, branch_id, programme_id').eq('id', to!).single();
  const house = str(fd, 'house');
  const patch: Record<string, unknown> = { section_id: to, programme_id: sec!.programme_id, branch_id: sec!.branch_id };
  if (house) patch.house = house;
  const { error } = await ctx.sb.from('students').update(patch).in('id', ids);
  if (error) go('/students/bulk', error.message, 'err');
  await ctx.sb.from('enrolments').update({ status: 'transferred', end_date: today() }).in('student_id', ids).eq('status', 'active');
  await ctx.sb.from('enrolments').insert(ids.map((student_id) => ({ student_id, year_id: ctx.year?.id, branch_id: sec!.branch_id, programme_id: sec!.programme_id, section_id: to })));
  go('/students/bulk', `${ids.length} students moved. To undo, move them back from the destination section.`);
}
