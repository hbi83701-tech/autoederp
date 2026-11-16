import type { SupabaseClient } from '@supabase/supabase-js';

/** Board and school-type packs (CF-07): ready configuration a school installs and then adjusts. */
export const BOARDS = ['CBSE', 'Cambridge', 'ICSE', 'IB', 'State', 'Pre-school', 'Mixed'] as const;

const GRADES: Record<string, [string, string][]> = {
  default: [['Nursery', 'Pre-primary'], ['LKG', 'Pre-primary'], ['UKG', 'Pre-primary'], ['Grade 1', 'Primary'], ['Grade 2', 'Primary'], ['Grade 3', 'Primary'], ['Grade 4', 'Primary'], ['Grade 5', 'Primary'],
    ['Grade 6', 'Middle'], ['Grade 7', 'Middle'], ['Grade 8', 'Middle'], ['Grade 9', 'Secondary'], ['Grade 10', 'Secondary'], ['Grade 11', 'Senior'], ['Grade 12', 'Senior']],
  Cambridge: [['Stage 1', 'Primary'], ['Stage 2', 'Primary'], ['Stage 3', 'Primary'], ['Stage 4', 'Primary'], ['Stage 5', 'Primary'], ['Stage 6', 'Primary'],
    ['Stage 7', 'Middle'], ['Stage 8', 'Middle'], ['Stage 9', 'Middle'], ['IGCSE 1', 'Secondary'], ['IGCSE 2', 'Secondary'], ['AS Level', 'Senior'], ['A Level', 'Senior']],
  'Pre-school': [['Playgroup', 'Pre-primary'], ['Nursery', 'Pre-primary'], ['LKG', 'Pre-primary'], ['UKG', 'Pre-primary']],
};

export const SCALES: Record<string, { min: number; grade: string; point?: number; descriptor?: string }[]> = {
  CBSE: [{ min: 91, grade: 'A1', point: 10 }, { min: 81, grade: 'A2', point: 9 }, { min: 71, grade: 'B1', point: 8 }, { min: 61, grade: 'B2', point: 7 }, { min: 51, grade: 'C1', point: 6 }, { min: 41, grade: 'C2', point: 5 }, { min: 33, grade: 'D', point: 4 }, { min: 0, grade: 'E', descriptor: 'Needs improvement' }],
  Cambridge: [{ min: 90, grade: 'A*' }, { min: 80, grade: 'A' }, { min: 70, grade: 'B' }, { min: 60, grade: 'C' }, { min: 50, grade: 'D' }, { min: 40, grade: 'E' }, { min: 30, grade: 'F' }, { min: 20, grade: 'G' }, { min: 0, grade: 'U', descriptor: 'Ungraded' }],
  ICSE: [{ min: 90, grade: '1' }, { min: 80, grade: '2' }, { min: 70, grade: '3' }, { min: 60, grade: '4' }, { min: 50, grade: '5' }, { min: 40, grade: '6' }, { min: 35, grade: '7' }, { min: 0, grade: '8', descriptor: 'Fail' }],
  IB: [{ min: 85, grade: '7' }, { min: 72, grade: '6' }, { min: 60, grade: '5' }, { min: 48, grade: '4' }, { min: 35, grade: '3' }, { min: 20, grade: '2' }, { min: 0, grade: '1' }],
  'NEP-HPC': [{ min: 75, grade: 'Proficient', descriptor: 'Mountain' }, { min: 50, grade: 'Developing', descriptor: 'Hill' }, { min: 0, grade: 'Beginner', descriptor: 'Stream' }],
  'Pre-school': [{ min: 75, grade: 'Achieved' }, { min: 40, grade: 'Developing' }, { min: 0, grade: 'Emerging' }],
};
SCALES.State = SCALES.CBSE; SCALES.Mixed = SCALES.CBSE;

export const SCHEME_CONFIG: Record<string, object> = {
  CBSE: { terms: ['Term 1', 'Term 2'], components: [{ name: 'Periodic Test', weightage: 10, best_of: 2 }, { name: 'Notebook', weightage: 5 }, { name: 'Subject Enrichment', weightage: 5 }, { name: 'Term Exam', weightage: 80 }], pass_percent: 33, rounding: 'nearest', grace_marks: 0, co_scholastic: ['Work Education', 'Art Education', 'Health and Physical Education', 'Discipline'] },
  Cambridge: { terms: ['Term 1', 'Term 2', 'Term 3'], components: [{ name: 'Coursework', weightage: 30 }, { name: 'Checkpoint / Exam', weightage: 70 }], pass_percent: 40, rounding: 'nearest', effort_grades: ['Excellent', 'Good', 'Satisfactory', 'Needs improvement'], remarks: ['homeroom', 'subject'] },
  'NEP-HPC': { terms: ['Term 1', 'Term 2'], components: [{ name: 'Activity', weightage: 50 }, { name: 'Assessment', weightage: 50 }], inputs: ['teacher', 'self', 'peer', 'parent'], stages: ['Foundational', 'Preparatory', 'Middle', 'Secondary'] },
  default: { terms: ['Term 1', 'Term 2'], components: [{ name: 'Internal', weightage: 20 }, { name: 'Term Exam', weightage: 80 }], pass_percent: 35, rounding: 'nearest' },
};

const SUBJECTS = [['English', 'ENG', 'language'], ['Hindi', 'HIN', 'language'], ['Telugu', 'TEL', 'language'], ['Mathematics', 'MAT', 'scholastic'], ['Science', 'SCI', 'scholastic'], ['Social Science', 'SST', 'scholastic'],
  ['Computer Science', 'CS', 'scholastic'], ['Art Education', 'ART', 'co-scholastic'], ['Physical Education', 'PE', 'co-scholastic'], ['Music', 'MUS', 'activity']];

export const RECIPES = [
  { recipe_key: 'absentee_notice', name: 'Absentee notice', trigger: 'attendance.submitted', actions: [{ do: 'message_parents_of_absentees' }, { do: 'task_class_teacher', after_consecutive: 3 }] },
  { recipe_key: 'attendance_not_marked', name: 'Attendance not marked', trigger: 'time.09:15', actions: [{ do: 'nudge_teacher' }, { do: 'alert_coordinator', at: '09:30' }] },
  { recipe_key: 'fee_reminder_ladder', name: 'Fee reminder ladder', trigger: 'fee.due_date', conditions: { days: [-7, -1, 3, 10], call_task_at: 15 }, actions: [{ do: 'remind_parent' }] },
  { recipe_key: 'cheque_bounced', name: 'Cheque bounced', trigger: 'cheque.bounced', actions: [{ do: 'apply_fine' }, { do: 'notify_parent' }, { do: 'task_accounts' }] },
  { recipe_key: 'concession_approval', name: 'Concession approval', trigger: 'concession.requested', actions: [{ do: 'start_approval' }] },
  { recipe_key: 'leave_and_cover', name: 'Leave and cover', trigger: 'leave.approved', actions: [{ do: 'propose_substitutes' }, { do: 'notify' }] },
  { recipe_key: 'homework_posting_check', name: 'Homework posting check', trigger: 'time.end_of_day', actions: [{ do: 'nudge_teachers_without_posts' }] },
  { recipe_key: 'marks_deadline', name: 'Marks deadline', trigger: 'assessment.deadline', conditions: { days_before: 2 }, actions: [{ do: 'remind_teachers' }, { do: 'status_to_coordinator' }] },
  { recipe_key: 'report_card_publish', name: 'Report-card publish', trigger: 'report_card.signed', actions: [{ do: 'publish' }, { do: 'notify_parents' }] },
  { recipe_key: 'gate_pass', name: 'Gate pass', trigger: 'gate_pass.requested', actions: [{ do: 'start_approval' }, { do: 'otp_to_parent' }] },
  { recipe_key: 'bus_delay', name: 'Bus delay', trigger: 'trip.late', actions: [{ do: 'notify_route_parents' }, { do: 'alert_transport_manager' }] },
  { recipe_key: 'document_expiry', name: 'Document expiry', trigger: 'document.expiry', conditions: { days_before: 30, escalate_at: 7 }, actions: [{ do: 'alert_owner' }] },
  { recipe_key: 'withdrawal_clearance', name: 'Withdrawal clearance', trigger: 'tc.requested', actions: [{ do: 'clearance_tasks' }] },
  { recipe_key: 'birthday_wishes', name: 'Birthday wishes', trigger: 'date.birthday', actions: [{ do: 'greeting' }] },
  { recipe_key: 'year_rollover_reminders', name: 'Year rollover reminders', trigger: 'date.march', actions: [{ do: 'rollover_checklist' }] },
];

const DOC = (title: string, body: string) => `<h2 style="text-align:center">${title}</h2><p>${body}</p><p style="margin-top:48px">Date: {{date}}<span style="float:right">Principal</span></p>`;
export const DOC_TEMPLATES = [
  { type: 'bonafide', name: 'Bonafide certificate', body: DOC('Bonafide Certificate', 'This is to certify that <b>{{student_name}}</b>, admission number {{admission_no}}, child of {{parent_name}}, is a bonafide student of this school studying in {{class}} during the academic year {{year}}. Date of birth as per our records: {{dob}}.') },
  { type: 'study', name: 'Study certificate', body: DOC('Study Certificate', 'This is to certify that <b>{{student_name}}</b> (admission number {{admission_no}}) has been studying in this school since {{joined_on}} and is at present in {{class}}.') },
  { type: 'conduct', name: 'Conduct certificate', body: DOC('Conduct Certificate', 'This is to certify that <b>{{student_name}}</b> of {{class}} has shown good conduct and character during the period of study in this school.') },
  { type: 'no_dues', name: 'No-dues certificate', body: DOC('No Dues Certificate', 'This is to certify that <b>{{student_name}}</b> (admission number {{admission_no}}) of {{class}} has no fee, library, store, transport or hostel dues pending as on {{date}}.') },
  { type: 'fee', name: 'Annual fee certificate', body: DOC('Fee Certificate', 'This is to certify that tuition fees of <b>{{tuition_paid}}</b> were received from {{parent_name}} for <b>{{student_name}}</b> of {{class}} for the academic year {{year}}.') },
  { type: 'tc', name: 'Transfer certificate', body: DOC('Transfer Certificate', '<b>{{student_name}}</b>, child of {{parent_name}}, date of birth {{dob}}, admission number {{admission_no}}, was admitted on {{joined_on}} and left the school on {{left_on}} from {{class}}. All dues to the school have been cleared. Conduct: Good. Reason for leaving: {{reason}}.') },
  { type: 'achievement', name: 'Achievement certificate', body: DOC('Certificate of Achievement', 'Awarded to <b>{{student_name}}</b> of {{class}} for {{reason}}.') },
  { type: 'id_card', name: 'Student ID card', body: '<div style="border:1px solid #999;border-radius:8px;padding:12px;width:240px"><b>{{school}}</b><br/>{{student_name}}<br/>{{class}} · Adm {{admission_no}}<br/>APAAR: {{apaar_id}}<br/>Blood group: {{blood_group}}</div>' },
  { type: 'experience', name: 'Experience letter', body: DOC('Experience Letter', 'This is to certify that <b>{{staff_name}}</b> worked with us as {{designation}} from {{joined_on}} to {{left_on}}.') },
];

/** Install the pack for a newly created school. Runs as the group admin, under row-level security. */
export async function installPack(sb: SupabaseClient, board: string) {
  const { data: branch } = await sb.from('branches').select('id').limit(1).single();
  const { data: year } = await sb.from('academic_years').select('id, start_date').eq('is_current', true).limit(1).single();
  if (!branch || !year) throw new Error('School structure is missing.');
  const ys = Number(String(year.start_date).slice(0, 4));
  const grades = GRADES[board] ?? GRADES.default;
  const { data: progs } = await sb.from('programmes').insert(grades.map(([name, stage], i) => ({ branch_id: branch.id, name, stage, board, sort: i + 1, capacity: 80 }))).select('id, name, sort');
  if (progs) {
    const sorted = [...progs].sort((a, b) => a.sort - b.sort);
    await Promise.all(sorted.slice(0, -1).map((p, i) => sb.from('programmes').update({ next_programme_id: sorted[i + 1].id }).eq('id', p.id)));
    await sb.from('sections').insert(sorted.map((p) => ({ branch_id: branch.id, year_id: year.id, programme_id: p.id, name: `${p.name} A` })));
  }
  const scaleKey = SCALES[board] ? board : 'CBSE';
  const { data: scale } = await sb.from('grading_scales').insert({ name: `${scaleKey} grading scale`, bands: SCALES[scaleKey] }).select('id').single();
  const packName = (['CBSE', 'Cambridge', 'ICSE', 'IB', 'State', 'Pre-school'] as string[]).includes(board) ? board : 'CBSE';
  const { data: accounts } = await sb.from('accounts').insert([
    { code: '1000', name: 'Cash in hand', type: 'asset', is_system: true }, { code: '1010', name: 'Bank account', type: 'asset', is_system: true },
    { code: '1200', name: 'Fees receivable', type: 'asset', is_system: true }, { code: '1500', name: 'Fixed assets', type: 'asset' },
    { code: '2000', name: 'Caution deposits', type: 'liability' }, { code: '2010', name: 'Advance fees', type: 'liability' }, { code: '2020', name: 'Canteen wallet balances', type: 'liability' },
    { code: '2100', name: 'Statutory dues payable (PF, ESI, PT, TDS)', type: 'liability' }, { code: '3000', name: 'Corpus / general fund', type: 'equity' },
    { code: '4000', name: 'Tuition fee income', type: 'income', is_system: true }, { code: '4010', name: 'Transport fee income', type: 'income' }, { code: '4020', name: 'Other fee income', type: 'income' },
    { code: '5000', name: 'Salaries and wages', type: 'expense', is_system: true }, { code: '5010', name: 'Transport running costs', type: 'expense' }, { code: '5020', name: 'Maintenance and repairs', type: 'expense' },
    { code: '5030', name: 'Utilities', type: 'expense' }, { code: '5040', name: 'Teaching materials', type: 'expense' }, { code: '5050', name: 'Marketing and admissions', type: 'expense' },
  ]).select('id, code');
  const acc = (c: string) => accounts?.find((a) => a.code === c)?.id ?? null;
  await Promise.all([
    sb.from('terms').insert([{ year_id: year.id, name: 'Term 1', start_date: `${ys}-04-01`, end_date: `${ys}-09-30`, sort: 1 }, { year_id: year.id, name: 'Term 2', start_date: `${ys}-10-01`, end_date: `${ys + 1}-03-31`, sort: 2 }]),
    sb.from('subjects').insert(SUBJECTS.map(([name, code, type]) => ({ name, code, type }))),
    sb.from('assessment_schemes').insert([
      { year_id: year.id, name: `${packName} scheme`, pack: packName, scale_id: scale?.id, config: SCHEME_CONFIG[packName] ?? SCHEME_CONFIG.default },
      { year_id: year.id, name: 'NEP Holistic Progress Card', pack: 'NEP-HPC', config: SCHEME_CONFIG['NEP-HPC'], active: false },
    ]),
    sb.from('fee_heads').insert([
      { name: 'Tuition fee', type: 'tuition', account_id: acc('4000'), tax_certificate: true }, { name: 'Admission fee', type: 'admission', account_id: acc('4020') },
      { name: 'Annual charges', type: 'annual', account_id: acc('4020') }, { name: 'Transport fee', type: 'transport', account_id: acc('4010') },
      { name: 'Hostel fee', type: 'hostel', account_id: acc('4020') }, { name: 'Activity fee', type: 'activity', account_id: acc('4020') },
      { name: 'Exam fee', type: 'exam', account_id: acc('4020') }, { name: 'Late fee / fine', type: 'fine', account_id: acc('4020') }, { name: 'Miscellaneous', type: 'misc', account_id: acc('4020') },
    ]),
    sb.from('concession_types').insert([
      { name: 'Sibling concession', kind: 'percent', value: 10, auto_rule: 'sibling' }, { name: 'Staff ward', kind: 'percent', value: 50, auto_rule: 'staff_ward' },
      { name: 'Merit scholarship', kind: 'percent', value: 25, auto_rule: 'merit' }, { name: 'Need-based support', kind: 'fixed', value: 10000 },
      { name: 'RTE (25% quota)', kind: 'percent', value: 100, auto_rule: 'rte' }, { name: 'Early-payment discount', kind: 'percent', value: 3, auto_rule: 'early_payment' }, { name: 'One-time waiver', kind: 'fixed', value: 1000 },
    ]),
    sb.from('leave_types').insert([
      { name: 'Casual leave', code: 'CL', annual_quota: 12 }, { name: 'Sick leave', code: 'SL', annual_quota: 10 }, { name: 'Earned leave', code: 'EL', annual_quota: 15, carry_forward: true, encashable: true },
      { name: 'Comp-off', code: 'CO', annual_quota: 0 }, { name: 'Loss of pay', code: 'LOP', annual_quota: 0, paid: false }, { name: 'Student leave', code: 'STU', annual_quota: 0, applies_to: 'student' },
    ]),
    sb.from('masters').insert([
      ...['Red', 'Blue', 'Green', 'Yellow'].map((n, i) => ({ type: 'house', name: n, sort: i, color: n.toLowerCase() })),
      ...['Academic', 'Fees', 'Transport', 'Safety', 'Facilities', 'Other'].map((n, i) => ({ type: 'concern_category', name: n, sort: i })),
      ...['Mathematics', 'Science', 'Languages', 'Social Science', 'Administration', 'Accounts', 'Transport'].map((n, i) => ({ type: 'department', name: n, sort: i })),
    ]),
    sb.from('bell_periods').insert([
      ...[['1', '08:40', '09:20'], ['2', '09:20', '10:00'], ['3', '10:00', '10:40']].map(([n, s, e]) => ({ branch_id: branch.id, period_no: Number(n), name: `Period ${n}`, start_time: s, end_time: e })),
      { branch_id: branch.id, period_no: 0, name: 'Short break', start_time: '10:40', end_time: '10:55', is_break: true },
      ...[['4', '10:55', '11:35'], ['5', '11:35', '12:15']].map(([n, s, e]) => ({ branch_id: branch.id, period_no: Number(n), name: `Period ${n}`, start_time: s, end_time: e })),
      { branch_id: branch.id, period_no: 0, name: 'Lunch', start_time: '12:15', end_time: '12:55', is_break: true },
      ...[['6', '12:55', '13:35'], ['7', '13:35', '14:15'], ['8', '14:15', '14:55']].map(([n, s, e]) => ({ branch_id: branch.id, period_no: Number(n), name: `Period ${n}`, start_time: s, end_time: e })),
    ]),
    sb.from('approval_rules').insert([
      { object_type: 'leave', name: 'Staff and student leave', steps: ['principal'] }, { object_type: 'gate_pass', name: 'Early pickup', steps: ['class_teacher'], escalate_hours: 1 },
      { object_type: 'concession', name: 'Concession up to Rs 10,000', max_amount: 10000, steps: ['principal'] }, { object_type: 'concession', name: 'Concession above Rs 10,000', min_amount: 10000.01, steps: ['principal', 'group_admin'] },
      { object_type: 'refund', name: 'Refunds', steps: ['principal', 'group_admin'] }, { object_type: 'receipt_reversal', name: 'Receipt cancellation', steps: ['principal'] },
      { object_type: 'marks_unlock', name: 'Unlock published marks', steps: ['principal'] }, { object_type: 'message', name: 'School-wide circular', steps: ['principal'] },
      { object_type: 'post', name: 'Homework post (junior grades)', steps: ['coordinator'] }, { object_type: 'expense', name: 'Expenses', steps: ['principal'] },
      { object_type: 'purchase_request', name: 'Purchase requests', steps: ['principal'] }, { object_type: 'purchase_order', name: 'Purchase orders', steps: ['principal', 'group_admin'] },
      { object_type: 'gallery', name: 'Photo gallery', steps: ['coordinator'] }, { object_type: 'lesson_plan', name: 'Lesson plans', steps: ['coordinator'] },
      { object_type: 'profile_change', name: 'Profile corrections', steps: ['front_office'] }, { object_type: 'regularisation', name: 'Attendance regularisation', steps: ['hr'] }, { object_type: 'tc', name: 'Transfer certificate', steps: ['principal'] },
    ]),
    sb.from('automations').insert(RECIPES.map((r) => ({ ...r, conditions: (r as { conditions?: object }).conditions ?? {} }))),
    sb.from('checklists').insert([
      { name: 'Attendance by cut-off', role: 'class_teacher', frequency: 'daily', check_key: 'attendance_marked' }, { name: 'Homework posted', role: 'subject_teacher', frequency: 'daily', check_key: 'homework_posted' },
      { name: 'Gallery upload', role: 'class_teacher', frequency: 'monthly', check_key: 'gallery_upload' }, { name: 'Marks entered by deadline', role: 'subject_teacher', frequency: 'term', check_key: 'marks_entered' },
      { name: 'Parent app usage', role: 'parent', frequency: 'monthly', check_key: 'app_login' },
    ]),
    sb.from('doc_templates').insert(DOC_TEMPLATES),
    sb.from('message_templates').insert([
      { event_key: 'absence', body: '{{student_name}} was marked absent today ({{date}}). Please reply with the reason or apply for leave in the app.' },
      { event_key: 'fee_due', body: 'A fee of {{amount}} for {{student_name}} is due on {{due_date}}. Pay in the app in one tap.' },
      { event_key: 'payment_receipt', body: 'We received {{amount}} for {{student_name}}. Receipt {{receipt_no}} is in the app.' },
      { event_key: 'report_card_published', body: 'The {{term}} report card for {{student_name}} is ready in the app.' },
      { event_key: 'homework_posted', body: 'New {{type}} for {{class}}: {{title}}' }, { event_key: 'bus_alert', body: '{{message}}' },
    ]),
    sb.from('discipline_rules').insert([{ category: 'Late to class', level: 'Minor', points: 1, consequence: 'Verbal reminder', notify_parent: false }, { category: 'Incomplete homework', level: 'Minor', points: 1, consequence: 'Complete in break' },
      { category: 'Disrespect', level: 'Moderate', points: 3, consequence: 'Meeting with coordinator' }, { category: 'Bullying', level: 'Serious', points: 5, consequence: 'Parent meeting and counselling' }]),
    sb.from('remark_bank').insert([{ category: 'General', body: 'Shows steady progress and takes pride in presenting work neatly.' }, { category: 'General', body: 'Participates actively in class discussions and works well with peers.' },
      { category: 'Effort', body: 'With more regular revision, results will reflect the understanding shown in class.', tone: 'encouraging' }, { category: 'Concern', body: 'Needs support to complete homework on time; let us work together on a routine.', tone: 'concern' }]),
    sb.from('retention_rules').insert([{ data_type: 'Student records after leaving', keep_years: 10 }, { data_type: 'Financial records', keep_years: 8, action: 'anonymise' }, { data_type: 'Visitor logs', keep_years: 1, action: 'delete' }, { data_type: 'Bus location history', keep_years: 0, action: 'delete', notes: 'Deleted after 30 days' }]),
    sb.from('policies').insert([{ title: 'Staff handbook', body: 'Code of conduct, working hours, leave rules, child-safety obligations and data-handling rules for all staff.', audience: 'staff' },
      { title: 'Privacy notice for parents', body: 'How the school uses your family’s data, the purposes that need your consent, and how to make a request.', audience: 'parents' }]),
    sb.from('calendar_events').insert([{ branch_id: branch.id, title: 'Independence Day', type: 'holiday', start_date: `${ys}-08-15` }, { branch_id: branch.id, title: 'Gandhi Jayanti', type: 'holiday', start_date: `${ys}-10-02` }, { branch_id: branch.id, title: 'Republic Day', type: 'holiday', start_date: `${ys + 1}-01-26` }]),
    sb.from('integrations').insert([{ type: 'payment_gateway', name: 'Razorpay', provider: 'razorpay' }, { type: 'whatsapp', name: 'WhatsApp Business API', provider: 'solution provider' }, { type: 'sms', name: 'DLT SMS', provider: 'aggregator' },
      { type: 'email', name: 'Transactional email', provider: 'smtp' }, { type: 'accounting', name: 'Tally Prime', provider: 'tally' }, { type: 'accounting', name: 'Zoho Books', provider: 'zoho' }, { type: 'sso', name: 'Google Workspace', provider: 'google' }, { type: 'maps', name: 'Maps provider', provider: 'osm', enabled: true, status: 'connected' }]),
  ]);
}
