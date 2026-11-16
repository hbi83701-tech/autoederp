import { AutoSubmitSelect } from '@/components/client';
import { pickChild } from './actions';

export function ChildSwitcher({ children, current }: { children: { id: string; first_name: string; last_name: string | null }[]; current: string }) {
  if (children.length < 2) return null;
  return <form action={pickChild}><AutoSubmitSelect name="child" label="Child" value={current} className="input !w-auto" options={children.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name ?? ''}` }))} /></form>;
}
