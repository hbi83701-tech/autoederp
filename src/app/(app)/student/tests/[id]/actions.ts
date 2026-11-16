'use server';
import { getCtx } from '@/lib/ctx';

export async function submitTest(test: string, student: string, answers: Record<string, string>, tabSwitches: number) {
  const ctx = await getCtx();
  const { data, error } = await ctx.sb.rpc('submit_test', { p_test: test, p_student: student, p_answers: answers, p_tab_switches: tabSwitches });
  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, ...(data as { score: number; max: number }) };
}
