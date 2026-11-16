'use server';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/ctx';
import { today, go, str, errMsg } from '@/lib/fmt';
import { addDays } from '@/lib/calendar';

export type Mark = { student_id: string; status: 'P' | 'A' | 'L' };

/** Roll call submit (ATT-02, ATT-04). Safe to retry: the same marks give the same result and parents are told once. */
export async function submitRoll(sectionId: string, date: string, session: string, marks: Mark[]): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await getCtx();
    if (!ctx.can('attendance', 'write')) return { ok: false, message: 'You do not have permission to mark attendance.' };
    const sb = ctx.sb;
    const d = today();
    if (date > d) return { ok: false, message: 'Attendance cannot be marked for a future date.' };
    if (date < d && !['F', 'B'].includes(ctx.perms.attendance)) return { ok: false, message: 'The edit window has closed. Ask your coordinator to make this change.' };
    const { data: sec } = await sb.from('sections').select('id, name, branch_id').eq('id', sectionId).single();
    if (!sec) return { ok: false, message: 'Section not found.' };
    const ids = marks.map((m) => m.student_id);
    const { data: before } = await sb.from('attendance').select('student_id, status').eq('date', date).eq('session', session).in('student_id', ids);
    const prev = new Map((before ?? []).map((b) => [b.student_id, b.status]));
    const rows = marks.filter((m) => !(prev.get(m.student_id) === 'LV' && m.status === 'A')).map((m) => ({ person_type: 'student', student_id: m.student_id, section_id: sectionId, branch_id: sec.branch_id, date, session, status: m.status, source: 'teacher' }));
    const { error } = await sb.from('attendance').upsert(rows, { onConflict: 'student_id,date,session' });
    if (error) return { ok: false, message: error.message };
    const count = (s: string) => marks.filter((m) => m.status === s).length;
    await sb.from('attendance_submissions').upsert({ section_id: sectionId, branch_id: sec.branch_id, date, session, present: count('P'), absent: count('A'), late: count('L'), submitted_by_name: ctx.name, submitted_at: new Date().toISOString() }, { onConflict: 'section_id,date,session' });
    // Tell parents of newly absent students once.
    const newlyAbsent = marks.filter((m) => m.status === 'A' && prev.get(m.student_id) !== 'A' && prev.get(m.student_id) !== 'LV').map((m) => m.student_id);
    if (newlyAbsent.length && session === 'day') {
      const { data: studs } = await sb.from('students').select('id, first_name, household_id').in('id', newlyAbsent);
      const { data: gs } = await sb.from('guardians').select('household_id, user_id, phone, whatsapp_opt_in').in('household_id', (studs ?? []).map((s) => s.household_id).filter(Boolean));
      const notes: object[] = [], out: object[] = [];
      for (const s of studs ?? []) for (const g of (gs ?? []).filter((x) => x.household_id === s.household_id)) {
        if (g.user_id) notes.push({ org_id: ctx.org.id, user_id: g.user_id, title: `${s.first_name} was marked absent`, body: `On ${date}. Reply with the reason or apply for leave in the app.`, link: '/parent/requests', kind: 'attendance' });
        if (g.phone && g.whatsapp_opt_in) out.push({ channel: 'whatsapp', to_address: g.phone, event_key: 'absence', student_id: s.id, body: `${s.first_name} was marked absent today (${date}).`, dedupe_key: `absence:${s.id}:${date}:${g.phone}` });
      }
      if (notes.length) await sb.from('notifications').insert(notes);
      if (out.length) await sb.from('outbox').upsert(out, { onConflict: 'dedupe_key', ignoreDuplicates: true });
      // Chronic absence: three consecutive days (ATT-08)
      const { data: recent } = await sb.from('attendance').select('student_id, date, status').in('student_id', newlyAbsent).eq('session', 'day').gte('date', addDays(date, -7)).order('date', { ascending: false });
      const chronic = newlyAbsent.filter((id) => (recent ?? []).filter((r) => r.student_id === id).slice(0, 3).filter((r) => r.status === 'A').length === 3);
      if (chronic.length) {
        const { data: people } = await sb.from('profiles').select('id').in('role', ['counsellor', 'coordinator']);
        const names = (studs ?? []).filter((s) => chronic.includes(s.id)).map((s) => s.first_name).join(', ');
        await sb.from('notifications').insert([{ id: ctx.user.id }, ...(people ?? [])].map((p) => ({ org_id: ctx.org.id, user_id: p.id, title: 'Three days absent in a row', body: `${names} (${sec.name}). Please contact the family.`, link: `/attendance/roll/${sectionId}`, kind: 'attendance' })));
      }
    }
    revalidatePath('/attendance');
    return { ok: true, message: `Saved: ${count('P')} present, ${count('A')} absent, ${count('L')} late.${newlyAbsent.length ? ' Parents of absentees have been informed.' : ''}` };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}

export async function markStaff(fd: FormData) {
  const ctx = await getCtx();
  const date = str(fd, 'date') ?? today();
  const rows = [...fd.entries()].filter(([k, v]) => k.startsWith('s_') && v).map(([k, v]) => ({ person_type: 'staff', staff_id: k.slice(2), date, session: 'day', status: String(v), source: 'teacher', branch_id: ctx.branchId }));
  if (!rows.length) go(`/attendance/staff?date=${date}`, 'Nothing to save.', 'err');
  const { error } = await ctx.sb.from('attendance').upsert(rows, { onConflict: 'staff_id,date,session' });
  go(`/attendance/staff?date=${date}`, error ? error.message : 'Staff attendance saved.', error ? 'err' : 'ok');
}
