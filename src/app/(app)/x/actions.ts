'use server';
import { getCtx } from '@/lib/ctx';
import { entity, rowFromForm } from '@/lib/crud';
import { go, errMsg, str } from '@/lib/fmt';

export async function saveRecord(fd: FormData) {
  const ctx = await getCtx();
  const key = str(fd, '_entity') ?? '';
  const ent = entity(key);
  if (!ent || ent.readonly) go('/', 'Unknown record type.', 'err');
  const id = str(fd, '_id');
  const back = str(fd, '_back') ?? `/x/${key}`;
  let row: Record<string, unknown>;
  try {
    const { data: custom } = ent!.custom ? await ctx.sb.from('custom_fields').select('key').eq('entity', ent!.table) : { data: [] };
    row = rowFromForm(ent!, fd, custom ?? []);
  } catch (e) { go(id ? `/x/${key}/${id}` : `/x/${key}/new`, errMsg(e), 'err'); }
  if (ent!.table === 'students') delete row!.status; // status changes go through the recorded state machine
  if (!id) {
    if (ent!.branch && !('branch_id' in row!)) row!.branch_id = ctx.branchId ?? ctx.profile.branch_id ?? (ctx.branches.length === 1 ? ctx.branches[0].id : null);
    if (ent!.year) row!.year_id = ctx.year?.id ?? null;
  }
  const q = id ? ctx.sb.from(ent!.table).update(row!).eq('id', id) : ctx.sb.from(ent!.table).insert(row!);
  const { error } = await q;
  if (error) go(id ? `/x/${key}/${id}` : `/x/${key}/new`, error.code === '42501' ? 'You do not have permission to save this.' : error.message, 'err');
  go(back, 'Saved.');
}

export async function deleteRecord(fd: FormData) {
  const ctx = await getCtx();
  const key = str(fd, '_entity') ?? '';
  const ent = entity(key);
  const id = str(fd, '_id');
  if (!ent || ent.readonly || !id) go('/', 'Unknown record.', 'err');
  const { error, count } = await ctx.sb.from(ent!.table).delete({ count: 'exact' }).eq('id', id!);
  if (error) go(`/x/${key}/${id}`, error.message, 'err');
  if (!count) go(`/x/${key}/${id}`, 'You do not have permission to delete this.', 'err');
  go(`/x/${key}`, 'Deleted.');
}
