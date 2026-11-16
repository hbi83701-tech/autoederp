'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCtx } from '@/lib/ctx';
import { go, str, numv } from '@/lib/fmt';

export async function pickChild(fd: FormData) { const s = await cookies(); s.set('child', String(fd.get('child')), { path: '/', maxAge: 31536000 }); revalidatePath('/parent', 'layout'); }

export async function leaveRequest(fd: FormData) {
  const ctx = await getCtx();
  const sid = str(fd, 'student_id')!, from = str(fd, 'from_date')!, to = str(fd, 'to_date') ?? from;
  const { data: s } = await ctx.sb.from('students').select('first_name, last_name, branch_id').eq('id', sid).single();
  const { data: lr, error } = await ctx.sb.from('leave_requests').insert({ person_type: 'student', student_id: sid, branch_id: s?.branch_id, from_date: from, to_date: to, days: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1, reason: str(fd, 'reason') }).select('id').single();
  if (error) go('/parent/requests', error.message, 'err');
  await ctx.sb.rpc('submit_approval', { p_type: 'leave', p_object: lr!.id, p_title: `Student leave: ${s?.first_name} ${s?.last_name ?? ''} · ${from}${to !== from ? ` to ${to}` : ''}`, p_summary: str(fd, 'reason'), p_student: sid });
  go('/parent/requests', 'Leave request sent. Attendance is marked automatically when it is approved.');
}

export async function gatePass(fd: FormData) {
  const ctx = await getCtx();
  const sid = str(fd, 'student_id')!;
  const { data: s } = await ctx.sb.from('students').select('first_name, last_name, branch_id').eq('id', sid).single();
  const person = str(fd, 'pickup_person_id');
  const { data: g, error } = await ctx.sb.from('gate_passes').insert({ student_id: sid, branch_id: s?.branch_id, reason: str(fd, 'reason'), collector_name: str(fd, 'collector_name'), collector_phone: str(fd, 'collector_phone'), pickup_person_id: person, pickup_time: str(fd, 'pickup_time') }).select('id').single();
  if (error) go('/parent/requests', error.message, 'err');
  await ctx.sb.rpc('submit_approval', { p_type: 'gate_pass', p_object: g!.id, p_title: `Early pickup: ${s?.first_name} ${s?.last_name ?? ''}`, p_summary: `${str(fd, 'reason') ?? ''} · collector: ${str(fd, 'collector_name') ?? 'registered person'}`, p_student: sid });
  go('/parent/requests', 'Pickup request sent to the class teacher. You will get an OTP here once it is approved.');
}

export async function raiseTicket(fd: FormData) {
  const ctx = await getCtx();
  const sid = str(fd, 'student_id');
  const { data: s } = sid ? await ctx.sb.from('students').select('branch_id').eq('id', sid).single() : { data: null };
  const type = str(fd, 'type') ?? 'concern';
  const { data: t, error } = await ctx.sb.from('tickets').insert({ type, category: str(fd, 'category'), subject: str(fd, 'subject'), body: str(fd, 'body'), student_id: sid, branch_id: s?.branch_id, payload: type === 'profile_change' ? { field: str(fd, 'field'), value: str(fd, 'value') } : null }).select('id').single();
  if (error) go('/parent/requests', error.message, 'err');
  if (type === 'profile_change' && sid && str(fd, 'field')) await ctx.sb.rpc('submit_approval', { p_type: 'profile_change', p_object: sid, p_title: `Correction: ${str(fd, 'field')?.replace('_', ' ')}`, p_summary: `New value: ${str(fd, 'value')}. ${str(fd, 'body') ?? ''}`, p_student: sid, p_payload: { table: 'students', field: str(fd, 'field'), value: str(fd, 'value'), ticket_id: t!.id } });
  go('/parent/requests', 'Request sent. You can follow its status here.');
}

export async function startConversation(fd: FormData) {
  const ctx = await getCtx();
  const { data: c, error } = await ctx.sb.from('conversations').insert({ subject: str(fd, 'subject'), student_id: str(fd, 'student_id'), parent_name: ctx.name, with_role: str(fd, 'with_role') ?? 'class_teacher' }).select('id').single();
  if (error) go('/parent/messages', error.message, 'err');
  await ctx.sb.from('conversation_messages').insert({ conversation_id: c!.id, sender_name: ctx.name, body: str(fd, 'body') });
  go(`/parent/messages?open=${c!.id}`, 'Message sent.');
}
export async function parentReply(fd: FormData) { const ctx = await getCtx(); const id = str(fd, 'conversation')!; const { error } = await ctx.sb.from('conversation_messages').insert({ conversation_id: id, sender_name: ctx.name, body: str(fd, 'body') }); go(`/parent/messages?open=${id}`, error ? error.message : undefined, error ? 'err' : 'ok'); }
export async function ackMessage(fd: FormData) { const ctx = await getCtx(); await ctx.sb.from('message_recipients').update({ read_at: new Date().toISOString(), ack_at: new Date().toISOString(), status: 'read' }).eq('id', str(fd, 'id')!); revalidatePath('/parent/messages'); }
export async function bookPtm(fd: FormData) { const ctx = await getCtx(); const { error } = await ctx.sb.rpc('book_ptm_slot', { p_slot: str(fd, 'slot'), p_student: str(fd, 'student_id') }); go('/parent/calendar', error ? error.message : 'Slot booked.', error ? 'err' : 'ok'); }
export async function registerEvent(fd: FormData) { const ctx = await getCtx(); const { error } = await ctx.sb.from('event_registrations').insert({ event_id: str(fd, 'event'), student_id: str(fd, 'student_id'), status: fd.get('consent') === 'on' ? 'consented' : 'registered' }); go('/parent/calendar', error ? (error.code === '23505' ? 'Already registered.' : error.message) : 'Registered.', error ? 'err' : 'ok'); }
export async function setConsent(fd: FormData) { const ctx = await getCtx(); const purpose = str(fd, 'purpose')!, sid = str(fd, 'student_id'); const granted = fd.get('granted') === 'true'; const { data: ex } = await ctx.sb.from('consents').select('id').eq('user_id', ctx.user.id).eq('purpose', purpose).eq('student_id', sid ?? '').maybeSingle(); if (ex) await ctx.sb.from('consents').update({ granted, at: new Date().toISOString() }).eq('id', ex.id); else await ctx.sb.from('consents').insert({ purpose, student_id: sid, granted }); go('/parent/more', 'Your choice is saved with today’s date.'); }
export async function storeOrder(fd: FormData) { const ctx = await getCtx(); const item = str(fd, 'item')!.split('|'); const qty = numv(fd, 'qty') ?? 1; const { error } = await ctx.sb.from('store_orders').insert({ student_id: str(fd, 'student_id'), lines: [{ item_id: item[0], name: item[1], price: Number(item[2]), qty, size: str(fd, 'size') }], total: Number(item[2]) * qty, sizes_note: str(fd, 'size') }); go('/parent/more', error ? error.message : 'Order placed. Pay and collect at the school store.', error ? 'err' : 'ok'); }
export async function dataRequest(fd: FormData) { const ctx = await getCtx(); const { error } = await ctx.sb.from('data_requests').insert({ type: str(fd, 'type'), subject: ctx.name, details: str(fd, 'details') }); go('/parent/more', error ? error.message : 'Request recorded. The school will respond within the legal time limit.', error ? 'err' : 'ok'); }
export async function logReading(fd: FormData) { const ctx = await getCtx(); const { error } = await ctx.sb.from('reading_logs').insert({ student_id: str(fd, 'student_id'), title: str(fd, 'title'), pages: numv(fd, 'pages'), minutes: numv(fd, 'minutes') }); go(str(fd, 'back') ?? '/parent/more', error ? error.message : 'Reading logged.', error ? 'err' : 'ok'); }
