import type { Ctx } from './ctx';
import { today } from './fmt';
import { addDays, isWorking } from './calendar';
import { generate, type Need } from './rules/timetable';

const FIRST = ['Aarav', 'Ananya', 'Vihaan', 'Diya', 'Arjun', 'Saanvi', 'Reyansh', 'Aadhya', 'Kabir', 'Myra', 'Ishaan', 'Kiara', 'Rohan', 'Anika', 'Dhruv', 'Sara', 'Aditya', 'Navya', 'Krish', 'Riya', 'Yusuf', 'Zoya', 'Nikhil', 'Meera', 'Farhan', 'Tara', 'Varun', 'Pooja', 'Imran', 'Lakshmi'];
const LAST = ['Reddy', 'Sharma', 'Khan', 'Rao', 'Iyer', 'Patel', 'Nair', 'Gupta', 'Shaikh', 'Verma', 'Naidu', 'Das', 'Mehta', 'Joshi', 'Pillai'];
const TEACHERS = [['Sunita', 'Rao', 'English'], ['Mohammed', 'Irfan', 'Mathematics'], ['Priya', 'Nair', 'Science'], ['Ramesh', 'Kumar', 'Social Science'], ['Fatima', 'Begum', 'Hindi'], ['Lakshmi', 'Devi', 'Telugu'], ['Arvind', 'Menon', 'Computer Science'], ['Kavita', 'Joshi', 'Mathematics'], ['Suresh', 'Babu', 'Physical Education'], ['Neha', 'Kapoor', 'English']];
// Deterministic pseudo-random so the demo looks the same every time.
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

/** Sample data for a new school (CF-09): clearly fictional families, so the product can be explored end to end. */
export async function seedDemo(ctx: Ctx) {
  const sb = ctx.sb, d = today();
  const { count } = await sb.from('students').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) throw new Error('This school already has students. Demo data is only for an empty school.');
  const branch = ctx.branches[0]?.id, year = ctx.year;
  if (!branch || !year) throw new Error('Set up a branch and academic year first.');
  const ys = Number(year.start_date.slice(0, 4));
  const [{ data: secs }, { data: subjects }, { data: heads }] = await Promise.all([sb.from('sections').select('id, name, programme_id').eq('year_id', year.id).order('name'), sb.from('subjects').select('id, name'), sb.from('fee_heads').select('id, type')]);
  const sections = (secs ?? []).filter((s) => /Grade (4|5|6|7|8|9)\b|Stage (4|5|6|7|8|9)\b|LKG|UKG/.test(s.name)).slice(0, 6);
  if (!sections.length) throw new Error('No sections found. Install a board pack first.');
  const sub = (n: string) => subjects?.find((s) => s.name === n)?.id;
  // Staff
  const { data: staff, error: e1 } = await sb.from('staff').insert([
    ...TEACHERS.map(([f, l, s], i) => ({ branch_id: branch, emp_code: `T${101 + i}`, first_name: f, last_name: l, designation: `${s} teacher`, department: s, staff_type: 'teaching', joining_date: `${ys - 2}-06-01`, bgv_status: 'clear', gender: i % 2 ? 'Male' : 'Female' })),
    { branch_id: branch, emp_code: 'A201', first_name: 'Deepa', last_name: 'Krishnan', designation: 'Accountant', department: 'Accounts', staff_type: 'admin', bgv_status: 'clear' },
    { branch_id: branch, emp_code: 'D301', first_name: 'Raju', last_name: 'Yadav', designation: 'Driver', department: 'Transport', staff_type: 'driver', licence_no: 'TS0920150001234', licence_expiry: addDays(d, 20), bgv_status: 'clear' },
    { branch_id: branch, emp_code: 'D302', first_name: 'Salim', last_name: 'Pasha', designation: 'Driver', department: 'Transport', staff_type: 'driver', licence_no: 'TS0920170004321', licence_expiry: addDays(d, 400), bgv_status: 'pending' },
  ]).select('id, first_name, department, staff_type');
  if (e1) throw new Error(e1.message);
  const teachers = (staff ?? []).filter((s) => s.staff_type === 'teaching');
  await sb.from('salary_structures').insert((staff ?? []).map((s, i) => ({ staff_id: s.id, effective_from: `${ys}-04-01`, basic: s.staff_type === 'driver' ? 12000 : 22000 + (i % 4) * 3000, hra: s.staff_type === 'driver' ? 3000 : 8000, special_allowance: 2000, pf_applicable: true, esi_applicable: s.staff_type === 'driver' })));
  await Promise.all(sections.map((s, i) => sb.from('sections').update({ class_teacher_id: teachers[i % teachers.length].id, room: `Room ${101 + i}` }).eq('id', s.id)));
  // Families and students
  const students: { id: string; section_id: string; household_id: string; branch_id: string }[] = [];
  for (const [si, sec] of sections.entries()) {
    const fam = Array.from({ length: 16 }, (_, i) => ({ family_name: `${LAST[(si * 3 + i) % LAST.length]} family`, city: ctx.org.city ?? 'Hyderabad', phone: `98${String(48000000 + si * 1000 + i * 37).padStart(8, '0')}`, address: `${12 + i}, Example Street` }));
    const { data: hh } = await sb.from('households').insert(fam).select('id, family_name, phone');
    await sb.from('guardians').insert((hh ?? []).flatMap((h, i) => [{ household_id: h.id, name: `${pick(['Rajesh', 'Suresh', 'Anil', 'Imran', 'Vijay', 'Kiran'])} ${h.family_name.split(' ')[0]}`, relation: 'Father', phone: h.phone, is_primary: true }, { household_id: h.id, name: `${pick(['Sunita', 'Rekha', 'Ayesha', 'Padma', 'Geeta'])} ${h.family_name.split(' ')[0]}`, relation: 'Mother', phone: `97${String(51000000 + si * 1000 + i * 41).padStart(8, '0')}` }]));
    const { data: st, error } = await sb.from('students').insert((hh ?? []).map((h, i) => ({ household_id: h.id, branch_id: branch, admission_no: `${String(ys).slice(2)}A${String(si * 100 + i + 1).padStart(4, '0')}`, first_name: FIRST[(si * 5 + i) % FIRST.length], last_name: h.family_name.split(' ')[0], dob: `${ys - 9 - si}-${String((i % 12) + 1).padStart(2, '0')}-${String((i * 2 % 27) + 1).padStart(2, '0')}`, gender: i % 2 ? 'Female' : 'Male', programme_id: sec.programme_id, section_id: sec.id, roll_no: i + 1, house: ['Red', 'Blue', 'Green', 'Yellow'][i % 4], mother_tongue: pick(['Telugu', 'Hindi', 'Urdu', 'Tamil']), joined_on: i < 3 ? `${ys}-06-10` : `${ys - 1 - (i % 3)}-06-10`, is_new: i < 3, apaar_id: i % 4 === 0 ? null : `APAAR${ys}${si}${String(i).padStart(4, '0')}` }))).select('id, section_id, household_id, branch_id');
    if (error) throw new Error(error.message);
    students.push(...(st ?? []));
  }
  await sb.from('enrolments').insert(students.map((s) => ({ student_id: s.id, branch_id: branch, year_id: year.id, section_id: s.section_id, programme_id: sections.find((x) => x.id === s.section_id)?.programme_id })));
  await sb.from('student_sensitive').insert(students.filter((_, i) => i % 9 === 0).map((s, i) => ({ student_id: s.id, blood_group: pick(['O+', 'A+', 'B+', 'AB+']), allergies: i % 2 ? 'Peanuts' : 'Dust' })));
  // Teaching assignments and timetable
  const core = ['English', 'Mathematics', 'Science', 'Social Science', 'Hindi', 'Telugu', 'Computer Science', 'Physical Education'].filter(sub);
  const needs: Need[] = sections.flatMap((sec, si) => core.map((name, ci) => { const pool = teachers.filter((t) => t.department === name); return { section_id: sec.id, subject_id: sub(name)!, staff_id: (pool.length ? pool[si % pool.length] : teachers[(si + ci) % teachers.length]).id, periods_per_week: ['English', 'Mathematics', 'Science'].includes(name) ? 6 : name === 'Physical Education' ? 2 : 4 }; }));
  await sb.from('teacher_assignments').insert(needs.map((n) => ({ ...n, year_id: year.id })));
  const { created } = generate(needs, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let i = 0; i < created.length; i += 400) await sb.from('timetable_entries').insert(created.slice(i, i + 400).map((e) => ({ ...e, branch_id: branch, year_id: year.id })));
  // Fees: one plan per section's grade, demands, and some payments
  const tuition = heads?.find((h) => h.type === 'tuition')?.id, annual = heads?.find((h) => h.type === 'annual')?.id;
  for (const [si, sec] of sections.entries()) {
    const { data: plan } = await sb.from('fee_plans').insert({ name: `${sec.name.replace(/ A$/, '')} fee plan`, programme_id: sec.programme_id, branch_id: branch, year_id: year.id }).select('id').single();
    const { data: items } = await sb.from('fee_plan_items').insert([{ plan_id: plan!.id, head_id: annual, instalment: 'Annual', amount: 8000, due_date: `${ys}-04-15` }, ...[['Term 1', `${ys}-04-15`], ['Term 2', `${ys}-08-15`], ['Term 3', `${ys}-12-15`]].map(([n, due]) => ({ plan_id: plan!.id, head_id: tuition, instalment: n, amount: 18000 + si * 2000, due_date: due }))]).select('id, head_id, instalment, amount, due_date');
    const mine = students.filter((s) => s.section_id === sec.id);
    await sb.from('fee_demands').insert(mine.flatMap((s) => (items ?? []).map((it) => ({ student_id: s.id, branch_id: branch, year_id: year.id, head_id: it.head_id, plan_item_id: it.id, label: `${sec.name.replace(/ A$/, '')} · ${it.instalment}`, amount: it.amount, due_date: it.due_date }))));
  }
  const { data: dem } = await sb.from('fee_demands').select('id, student_id, amount, due_date').lte('due_date', d).order('due_date').limit(5000);
  let paidCount = 0;
  for (const s of students) { if (rnd() < 0.22) continue; const mine = (dem ?? []).filter((x) => x.student_id === s.id); const pay = rnd() < 0.8 ? mine : mine.slice(0, 1); if (!pay.length) continue;
    const total = pay.reduce((t, x) => t + Number(x.amount), 0); const mode = pick(['upi', 'upi', 'cash', 'card', 'bank_transfer']);
    const { error } = await sb.rpc('collect_fee', { p: { allocations: pay.map((x) => ({ demand_id: x.id, amount: Number(x.amount) })), payments: [{ mode, amount: total, reference: mode === 'cash' ? null : `REF${Math.floor(rnd() * 1e9)}` }], date: addDays(d, -Math.floor(rnd() * 40)), idempotency_key: `demo-${s.id}` } });
    if (!error) paidCount++; }
  // Attendance for the last working days
  const days: string[] = []; for (let x = addDays(d, -9); x < d; x = addDays(x, 1)) if (isWorking(x, '1,2,3,4,5,6', [])) days.push(x);
  for (const day of days) { const rows = students.map((s) => ({ person_type: 'student', student_id: s.id, section_id: s.section_id, branch_id: branch, date: day, session: 'day', status: rnd() < 0.06 ? 'A' : rnd() < 0.04 ? 'L' : 'P' }));
    for (let i = 0; i < rows.length; i += 500) await sb.from('attendance').insert(rows.slice(i, i + 500));
    await sb.from('attendance_submissions').insert(sections.map((sec) => { const r = rows.filter((x) => x.section_id === sec.id); return { section_id: sec.id, branch_id: branch, date: day, present: r.filter((x) => x.status === 'P').length, absent: r.filter((x) => x.status === 'A').length, late: r.filter((x) => x.status === 'L').length, submitted_by_name: 'Class teacher', submitted_at: `${day}T03:${String(20 + Math.floor(rnd() * 30)).padStart(2, '0')}:00Z` }; }));
    await sb.from('attendance').insert((staff ?? []).map((s) => ({ person_type: 'staff', staff_id: s.id, branch_id: branch, date: day, session: 'day', status: rnd() < 0.04 ? 'A' : 'P' }))); }
  // Assessments and marks
  const { data: scheme } = await sb.from('assessment_schemes').select('id').eq('active', true).limit(1).maybeSingle();
  for (const sec of sections) for (const name of ['English', 'Mathematics', 'Science'].filter(sub)) {
    const n = needs.find((x) => x.section_id === sec.id && x.subject_id === sub(name));
    const { data: as } = await sb.from('assessments').insert([{ name: 'Periodic Test 1', component: 'Periodic Test', max_marks: 40, weightage: 10 }, { name: 'Term 1 Exam', component: 'Term Exam', max_marks: 80, weightage: 80 }].map((a) => ({ ...a, term: 'Term 1', section_id: sec.id, branch_id: branch, year_id: year.id, subject_id: sub(name), staff_id: n?.staff_id, scheme_id: scheme?.id, date: addDays(d, -20), entry_deadline: addDays(d, a.name.startsWith('Term') ? 3 : -5), status: 'open' }))).select('id, max_marks, name');
    for (const a of as ?? []) { if (a.name.startsWith('Term') && name === 'Science') continue; await sb.from('assessment_results').insert(students.filter((s) => s.section_id === sec.id).map((s) => ({ assessment_id: a.id, student_id: s.id, marks: Math.round(Number(a.max_marks) * (0.35 + rnd() * 0.63)) }))); await sb.from('assessments').update({ status: 'submitted' }).eq('id', a.id); } }
  // Homework, transport, library, store, helpdesk, admissions, growth records
  await sb.from('posts').insert(sections.flatMap((sec, i) => [{ type: 'homework', section_id: sec.id, branch_id: branch, subject_id: sub('Mathematics'), title: 'Practice worksheet 4', body: 'Complete questions 1 to 10 in your notebook.', due_date: addDays(d, 2), posted_by_name: teachers[1].first_name, allow_submission: true }, ...(i % 2 ? [] : [{ type: 'note', section_id: sec.id, branch_id: branch, subject_id: sub('English'), title: 'Reading for this week', body: 'Read chapter 3 and note five new words.', posted_by_name: teachers[0].first_name }])]));
  const drivers = (staff ?? []).filter((s) => s.staff_type === 'driver');
  const { data: veh } = await sb.from('vehicles').insert([{ branch_id: branch, reg_no: 'TS09 UB 1234', capacity: 40, make_model: 'Tata Starbus', has_cctv: true, has_speed_governor: true, fitness_expiry: addDays(d, 25), insurance_expiry: addDays(d, 200), permit_expiry: addDays(d, 300), puc_expiry: addDays(d, -5) }, { branch_id: branch, reg_no: 'TS09 UC 5678', capacity: 32, make_model: 'Eicher Skyline', has_speed_governor: true, fitness_expiry: addDays(d, 320), insurance_expiry: addDays(d, 150), permit_expiry: addDays(d, 250), puc_expiry: addDays(d, 90) }]).select('id');
  const { data: routes } = await sb.from('routes').insert([{ branch_id: branch, name: 'Route 1 · North', vehicle_id: veh?.[0].id, driver_id: drivers[0]?.id, zone: 'North', monthly_fee: 1800 }, { branch_id: branch, name: 'Route 2 · East', vehicle_id: veh?.[1].id, driver_id: drivers[1]?.id, zone: 'East', monthly_fee: 2200 }]).select('id');
  const { data: stops } = await sb.from('stops').insert((routes ?? []).flatMap((r, ri) => ['Market Road', 'Lake View', 'Temple Street', 'Railway Colony'].map((n, i) => ({ route_id: r.id, name: `${n}${ri ? ' East' : ''}`, sort: i + 1, pickup_time: `07:${String(20 + i * 8).padStart(2, '0')}`, drop_time: `15:${String(40 + i * 5).padStart(2, '0')}`, lat: 17.385 + ri * 0.02 + i * 0.004, lng: 78.486 + i * 0.006 })))).select('id, route_id');
  await sb.from('student_transport').insert(students.filter((_, i) => i % 3 === 0).map((s, i) => { const r = routes![i % routes!.length]; const st = (stops ?? []).filter((x) => x.route_id === r.id); return { student_id: s.id, route_id: r.id, stop_id: st[i % st.length]?.id, year_id: year.id }; }));
  const { data: books } = await sb.from('books').insert([['The Jungle Book', 'Rudyard Kipling'], ['Malgudi Days', 'R. K. Narayan'], ['Wings of Fire', 'A. P. J. Abdul Kalam'], ['Grandma\'s Bag of Stories', 'Sudha Murty'], ['Charlotte\'s Web', 'E. B. White'], ['The Blue Umbrella', 'Ruskin Bond']].map(([title, author]) => ({ title, author, category: 'Fiction', location: 'Shelf A' }))).select('id');
  const { data: copies } = await sb.from('book_copies').insert((books ?? []).flatMap((b, i) => [1, 2].map((n) => ({ book_id: b.id, accession_no: `ACC${String(i * 2 + n).padStart(5, '0')}`, barcode: `ACC${String(i * 2 + n).padStart(5, '0')}` })))).select('id, book_id');
  for (const [i, c] of (copies ?? []).slice(0, 4).entries()) { await sb.from('loans').insert({ copy_id: c.id, book_id: c.book_id, student_id: students[i * 7].id, issued_on: addDays(d, -20 + i * 3), due_on: addDays(d, -6 + i * 4) }); await sb.from('book_copies').update({ status: 'issued' }).eq('id', c.id); }
  const { data: items } = await sb.from('items').insert([{ name: 'School shirt', category: 'uniform', price: 450, variants: '28,30,32,34', reorder_level: 20 }, { name: 'Notebook (200 pages)', category: 'stationery', price: 60, reorder_level: 100 }, { name: 'Veg sandwich', category: 'canteen', price: 40, allergens: 'gluten' }, { name: 'Peanut chikki', category: 'canteen', price: 20, allergens: 'peanuts' }, { name: 'Fresh lime', category: 'canteen', price: 25 }, { name: 'Whiteboard marker', category: 'consumable', price: 30, reorder_level: 50 }]).select('id, name, reorder_level');
  await sb.from('stock_movements').insert((items ?? []).map((it, i) => ({ item_id: it.id, branch_id: branch, qty: i === 5 ? 30 : 200, type: 'inward', note: 'Opening stock' })));
  await sb.from('wallets').insert(students.slice(0, 20).map((s, i) => ({ student_id: s.id, balance: 300 + i * 20, daily_limit: i % 3 === 0 ? 100 : null, blocked_items: i % 9 === 0 ? 'Peanut chikki' : null })));
  await sb.from('tickets').insert([{ type: 'concern', category: 'Transport', subject: 'Bus reached late twice this week', body: 'Route 1 pickup was 15 minutes late on Monday and Tuesday.', student_id: students[0].id, branch_id: branch, priority: 'high' }, { type: 'concern', category: 'Academic', subject: 'Request for extra help in Mathematics', student_id: students[5].id, branch_id: branch }, { type: 'maintenance', category: 'Facilities', subject: 'Fan not working in Room 103', branch_id: branch, priority: 'low' }, { type: 'certificate', category: 'Other', subject: 'Bonafide certificate for passport', student_id: students[9].id, branch_id: branch }]);
  await sb.from('enquiries').insert([['Advik Rao', 'Suresh Rao', 'Walk-in', 'enquiry'], ['Nisha Khan', 'Imran Khan', 'Website', 'visit'], ['Tanvi Patel', 'Hema Patel', 'Referral', 'applied'], ['Rehan Shaikh', 'Asif Shaikh', 'Social', 'test'], ['Ira Nair', 'Deepak Nair', 'Referral', 'offered']].map(([c, p, source, status], i) => ({ child_name: c, parent_name: p, phone: `96${String(30000000 + i * 911).padStart(8, '0')}`, source, status, branch_id: branch, year_id: year.id, programme_id: sections[i % sections.length].programme_id, follow_up_date: addDays(d, i - 2) })));
  await sb.from('growth_records').insert([{ student_id: students[2].id, type: 'achievement', category: 'Sports', note: 'Won the inter-house 100 m race.', share_with_parent: true }, { student_id: students[4].id, type: 'anecdote', category: 'Kindness', note: 'Helped a new classmate settle in during the first week.' }, { student_id: students[11].id, type: 'discipline', category: 'Late to class', note: 'Late to first period three times this week.', points: 1, follow_up_date: addDays(d, -1) }, { student_id: students[11].id, type: 'discipline', category: 'Incomplete homework', note: 'Homework not submitted twice.', points: 1 }, { student_id: students[20].id, type: 'counselling', note: 'Seems withdrawn after a family move. Meeting planned.', visibility: 'counsellor' }].map((g) => ({ ...g, branch_id: branch, recorded_by_name: 'Class teacher' })));
  await sb.from('house_points').insert([['Red', 40], ['Blue', 55], ['Green', 35], ['Yellow', 48]].map(([house, points]) => ({ house, points, reason: 'Sports day' })));
  await sb.from('calendar_events').insert([{ branch_id: branch, title: 'Parent-teacher meeting', type: 'ptm', start_date: addDays(d, 10) }, { branch_id: branch, title: 'Term 1 examinations', type: 'exam', start_date: addDays(d, 25), end_date: addDays(d, 32) }, { branch_id: branch, title: 'Annual day', type: 'event', start_date: addDays(d, 45) }]);
  await sb.from('events').insert({ branch_id: branch, title: 'Science exhibition', type: 'competition', date: addDays(d, 18), venue: 'School auditorium', consent_required: true });
  await sb.from('questions').insert([['What is 12 × 12?', ['124', '144', '132', '112'], '144', 'easy', 'remember'], ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 'Mars', 'easy', 'remember'], ['A train travels 120 km in 2 hours. What is its average speed?', ['40 km/h', '60 km/h', '80 km/h', '240 km/h'], '60 km/h', 'medium', 'apply'], ['Which gas do plants absorb during photosynthesis?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], 'Carbon dioxide', 'medium', 'understand'], ['If 3x + 5 = 20, what is x?', ['3', '5', '7', '15'], '5', 'medium', 'apply'], ['Which of these is a prime number?', ['21', '27', '29', '33'], '29', 'hard', 'analyse']].map(([q, o, a, diff, bloom], i) => ({ question: q, options: o, answer: a, difficulty: diff, bloom, type: 'mcq', subject_id: sub(i % 2 ? 'Science' : 'Mathematics') })));
  return { students: students.length, staff: (staff ?? []).length, sections: sections.length, receipts: paidCount, days: days.length };
}
