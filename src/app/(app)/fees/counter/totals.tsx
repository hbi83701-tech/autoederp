'use client';
import { useEffect, useState } from 'react';
import { ConfirmSubmit } from '@/components/client';

/** Live total of the amounts typed in the dues grid, so the cashier sees the impact before saving. */
export function CounterTotals() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const form = document.getElementById('collect');
    const calc = () => setTotal([...(form?.querySelectorAll<HTMLInputElement>('input.amt') ?? [])].reduce((t, i) => t + (Number(i.value) || 0), 0));
    calc();
    form?.addEventListener('input', calc);
    return () => form?.removeEventListener('input', calc);
  }, []);
  return (
    <div className="flex items-center justify-between border-t border-line pt-3">
      <div className="text-sm">Collecting <span className="text-xl font-semibold tabular-nums">Rs {total.toLocaleString('en-IN')}</span></div>
      <ConfirmSubmit className="btn" message={`Issue a receipt for Rs ${total.toLocaleString('en-IN')}? Receipts cannot be edited afterwards, only reversed with approval.`}>Save and print receipt</ConfirmSubmit>
    </div>
  );
}
