'use server';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/ctx';
import { go, str, numv, errMsg } from '@/lib/fmt';

export async function createAssessment(fd: FormData) {
  const ctx = await getCtx();
  const sections = fd.getAll('section_id').map(String).filter(Boolean);
  const { data: secs } = await ctx.sb.from('sections').select('id, branch_id').in('id', sections);
  const subject = str(fd, 'subject_id');
  const { data: ta } = await ctx.sb.from('teacher_assignments').select('section_id, staff_id').in('section_id', sections).eq('subject_id', subject ?? '');
  const { data: scheme } = await ctx.sb.from('assessment_schemes').select('id').eq('active', true).eq('year_id', ctx.year?.id ?? '').limit(1).maybeSingle();
  const rows = (secs ?? []).map((s) => ({ name: str(fd, 'name'), term: str(fd, 'term') ?? 'Term 1', component: str(fd, 'component'), section_id: s.id, branch_id: s.branch_id, year_id: ctx.year?.id, subject_id: subject, max_marks: numv(fd, 'max_marks') ?? 100, weightage: numv(fd, 'weightage') ?? 100, date: str(fd, 'date'), entry_deadline: str(fd, 'entry_deadline'), scheme_id: scheme?.id, staff_id: (ta ?? []).find((t) => t.section_id === s.id)?.staff_id ?? (['class_teacher', 'subject_teacher'].includes(ctx.role) ? ctx.profile.staff_id : null) }));
  if (!rows.length) go('/assessments', 'Choose at least one section.', 'err');
  const { error } = await ctx.sb.from('assessments').insert(rows);
  go('/assessments', error ? error.message : `${rows.length} assessment${rows.length > 1 ? 's' : ''} created. Teachers see them under "Marks due".`, error ? 'err' : 'ok');
}

export type MarkRow = { student_id: string; value: string; remark?: string };
/** Save a grid of marks. A cell holds a number or one of the codes AB (absent), EX (exempt), ML (medical leave). */
export async function saveMarks(assessmentId: string, rows: MarkRow[]): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await getCtx();
    const { data: a } = await ctx.sb.from('assessments').select('max_marks, status').eq('id', assessmentId).single();
    if (!a) return { ok: false, message: 'Assessment not found.' };
    if (['locked', 'published'].includes(a.status)) return { ok: false, message: 'Marks are locked after publication. Request an unlock with a reason.' };
    const out = [];
    for (const r of rows) {
      const v = r.value.trim().toUpperCase();
      if (v === '') { out.push({ assessment_id: assessmentId, student_id: r.student_id, marks: null, code: null, remark: r.remark ?? null }); continue; }
      if (['AB', 'EX', 'ML'].includes(v)) { out.push({ assessment_id: assessmentId, student_id: r.student_id, marks: null, code: v, remark: r.remark ?? null }); continue; }
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > Number(a.max_marks)) return { ok: false, message: `"${r.value}" is not valid. Enter 0 to ${a.max_marks}, or AB, EX or ML.` };
      out.push({ assessment_id: assessmentId, student_id: r.student_id, marks: n, code: null, remark: r.remark ?? null });
    }
    const { error } = await ctx.sb.from('assessment_results').upsert(out, { onConflict: 'assessment_id,student_id' });
    if (error) return { ok: false, message: error.message };
    revalidatePath(`/assessments/${assessmentId}`);
    return { ok: true, message: `Saved ${out.filter((o) => o.marks !== null || o.code).length} entries.` };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}

export async function setAssessmentStatus(fd: FormData) {
  const ctx = await getCtx();
  const id = str(fd, 'id')!, status = str(fd, 'status');
  if (status === 'unlock') {
    const { data: a } = await ctx.sb.from('assessments').select('name').eq('id', id).single();
    const { error } = await ctx.sb.rpc('submit_approval', { p_type: 'marks_unlock', p_object: id, p_title: `Unlock marks: ${a?.name}`, p_summary: str(fd, 'reason'), p_impact: 'Marks become editable again; the change is shown in the audit trail and report cards need re-publishing.' });
    go(`/assessments/${id}`, error ? error.message : 'Unlock request sent for approval.', error ? 'err' : 'ok');
  }
  const { error } = await ctx.sb.from('assessments').update({ status }).eq('id', id);
  go(`/assessments/${id}`, error ? error.message : status === 'submitted' ? 'Marked as complete. The coordinator can now review.' : 'Updated.', error ? 'err' : 'ok');
}
