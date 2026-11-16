import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCtx } from './ctx';

const T: Record<string, Record<string, string>> = {
  hi: { Today: 'आज', Fees: 'फीस', Academics: 'पढ़ाई', Requests: 'अनुरोध', Bus: 'बस', Calendar: 'कैलेंडर', Messages: 'संदेश', Attendance: 'उपस्थिति', Homework: 'गृहकार्य', 'Fees due': 'बकाया फीस', 'Pay now': 'अभी भुगतान करें', Present: 'उपस्थित', Absent: 'अनुपस्थित', 'Not marked yet': 'अभी दर्ज नहीं', 'Next actions': 'अगले कदम', Timetable: 'समय सारणी' },
  te: { Today: 'ఈ రోజు', Fees: 'ఫీజులు', Academics: 'చదువు', Requests: 'అభ్యర్థనలు', Bus: 'బస్సు', Calendar: 'క్యాలెండర్', Messages: 'సందేశాలు', Attendance: 'హాజరు', Homework: 'హోంవర్క్', 'Fees due': 'బకాయి ఫీజు', 'Pay now': 'ఇప్పుడే చెల్లించండి', Present: 'హాజరు', Absent: 'గైర్హాజరు', 'Not marked yet': 'ఇంకా నమోదు కాలేదు', 'Next actions': 'తదుపరి చర్యలు', Timetable: 'టైమ్ టేబుల్' },
};

/** Family context for the parent app (PAP-01): one login, all children, a child switcher. */
export async function family() {
  const ctx = await getCtx();
  if (ctx.isStaff) redirect('/');
  const { data } = await ctx.sb.from('students').select('id, first_name, last_name, admission_no, status, section_id, household_id, branch_id, photo_url, section:sections!students_section_id_fkey(name, class_teacher_id)').in('status', ['active', 'admitted', 'suspended']).order('dob');
  const children = (data ?? []) as unknown as { id: string; first_name: string; last_name: string | null; admission_no: string | null; status: string; section_id: string | null; household_id: string | null; branch_id: string | null; section: { name: string; class_teacher_id: string | null } | null }[];
  const store = await cookies();
  const child = children.find((c) => c.id === store.get('child')?.value) ?? children[0] ?? null;
  const lang = ctx.profile.language as string;
  const t = (s: string) => T[lang]?.[s] ?? s;
  return { ctx, children, child, t };
}
