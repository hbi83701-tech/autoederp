import type { Ctx } from './ctx';
import { subjectResult, overall, ranks, draftRemark, type Band, type SchemeConfig, type Score } from './rules/grading';
import { fullName, pct } from './fmt';

export type Snapshot = {
  student: { name: string; admission_no: string | null; roll_no: number | null; dob: string | null };
  section: string; term: string; year: string; scheme: string;
  subjects: { name: string; percent: number | null; grade: string | null; pass: boolean | null; absent: boolean; parts: { name: string; marks: string; max: number }[] }[];
  overall: number | null; overall_grade: string | null; rank: number | null; class_size: number;
  attendance: { present: number; total: number; percent: number | null };
  skills: { area: string; indicator: string; level: string | null }[];
  bands: Band[];
};

/** Compute every student's report card for a section and term from the live marks. */
export async function buildSnapshots(ctx: Ctx, sectionId: string, term: string) {
  const sb = ctx.sb;
  const [{ data: sec }, { data: studs }, { data: assess }, { data: scheme }] = await Promise.all([
    sb.from('sections').select('id, name, branch_id').eq('id', sectionId).single(),
    sb.from('students').select('id, first_name, last_name, admission_no, roll_no, dob').eq('section_id', sectionId).eq('status', 'active').order('roll_no').order('first_name'),
    sb.from('assessments').select('id, name, component, max_marks, weightage, subject:subjects!assessments_subject_id_fkey(name)').eq('section_id', sectionId).eq('term', term).eq('year_id', ctx.year?.id ?? ''),
    sb.from('assessment_schemes').select('id, name, config, scale:grading_scales!assessment_schemes_scale_id_fkey(bands)').eq('active', true).eq('year_id', ctx.year?.id ?? '').limit(1).maybeSingle(),
  ]);
  const A = (assess ?? []) as unknown as { id: string; name: string; component: string | null; max_marks: number; weightage: number; subject: { name: string } | null }[];
  const ids = (studs ?? []).map((s) => s.id);
  const [{ data: res }, { data: att }, { data: skills }] = await Promise.all([
    A.length ? sb.from('assessment_results').select('assessment_id, student_id, marks, code').in('assessment_id', A.map((a) => a.id)).limit(50000) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('attendance').select('student_id, status').in('student_id', ids).eq('session', 'day').gte('date', ctx.year?.start_date ?? '2000-01-01').limit(100000) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('rubric_results').select('student_id, area, indicator, level').in('student_id', ids).eq('term', term) : Promise.resolve({ data: [] }),
  ]);
  const cfg = (scheme?.config ?? {}) as SchemeConfig;
  const bands = ((scheme as unknown as { scale: { bands: Band[] } | null } | null)?.scale?.bands ?? [{ min: 0, grade: '-' }]) as Band[];
  const subjects = [...new Set(A.map((a) => a.subject?.name ?? 'Subject'))].sort();
  const totals: { id: string; total: number | null }[] = [];
  const out = new Map<string, Snapshot>();
  for (const s of studs ?? []) {
    const subj = subjects.map((name) => {
      const list = A.filter((a) => (a.subject?.name ?? 'Subject') === name);
      const scores: Score[] = []; const parts: Snapshot['subjects'][number]['parts'] = [];
      for (const a of list) {
        const r = (res ?? []).find((x) => x.assessment_id === a.id && x.student_id === s.id);
        scores.push({ component: a.component, marks: r?.marks ?? null, max: Number(a.max_marks), code: r?.code, weightage: Number(a.weightage) });
        parts.push({ name: a.name, marks: r?.code ?? (r?.marks === null || r?.marks === undefined ? '-' : String(r.marks)), max: Number(a.max_marks) });
      }
      return { name, ...subjectResult(scores, cfg, bands), parts };
    });
    const mine = (att ?? []).filter((a) => a.student_id === s.id);
    const present = mine.filter((a) => !['A', 'LV'].includes(a.status)).length;
    const ov = overall(subj);
    totals.push({ id: s.id, total: ov });
    out.set(s.id, {
      student: { name: fullName(s), admission_no: s.admission_no, roll_no: s.roll_no, dob: s.dob }, section: sec?.name ?? '', term, year: ctx.year?.name ?? '', scheme: scheme?.name ?? '',
      subjects: subj, overall: ov, overall_grade: ov === null ? null : [...bands].sort((a, b) => b.min - a.min).find((b) => ov >= b.min)?.grade ?? null, rank: null, class_size: (studs ?? []).length,
      attendance: { present, total: mine.length, percent: mine.length ? pct(present, mine.length) : null },
      skills: (skills ?? []).filter((k) => k.student_id === s.id).map((k) => ({ area: k.area, indicator: k.indicator, level: k.level })), bands,
    });
  }
  const rk = ranks(totals);
  for (const [id, snap] of out) snap.rank = rk.get(id) ?? null;
  return { snapshots: out, section: sec, schemeId: scheme?.id ?? null, assessmentIds: A.map((a) => a.id) };
}

export function remarkFor(snap: Snapshot) {
  const graded = snap.subjects.filter((s) => s.percent !== null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  return draftRemark(snap.student.name, snap.overall, snap.attendance.percent, graded[0]?.name, graded[graded.length - 1]?.name);
}
