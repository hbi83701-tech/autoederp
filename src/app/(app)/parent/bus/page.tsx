import { family } from '@/lib/parent';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { ftime, today } from '@/lib/fmt';
import { ChildSwitcher } from '../switcher';
import { AutoRefresh } from '../../driver/refresh';

export const metadata = { title: 'Bus' };
/** Live bus tracking (PAP-07): position while a trip runs, boarded and dropped alerts. */
export default async function Bus() {
  const { ctx, children, child, t } = await family();
  if (!child) return <Page title={t('Bus')}><Card><Empty title="No child linked" /></Card></Page>;
  const d = today();
  const { data: st } = await ctx.sb.from('student_transport').select('route_id, route:routes!student_transport_route_id_fkey(name), stop:stops!student_transport_stop_id_fkey(name, pickup_time, drop_time)').eq('student_id', child.id).eq('active', true).maybeSingle();
  const S = st as unknown as { route_id: string; route: { name: string } | null; stop: { name: string; pickup_time: string | null; drop_time: string | null } | null } | null;
  const [{ data: trips }, { data: ev }] = S ? await Promise.all([
    ctx.sb.from('trips').select('id, direction, status, started_at, ended_at, delay_minutes, last_lat, last_lng, last_at').eq('route_id', S.route_id).eq('date', d).order('started_at', { ascending: false }),
    ctx.sb.from('trip_events').select('type, at').eq('student_id', child.id).gte('at', d + 'T00:00:00+05:30').order('at', { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const live = (trips ?? []).find((x) => x.status === 'running');
  return (
    <Page title={t('Bus')} sub={S ? `${S.route?.name} · stop: ${S.stop?.name ?? 'not set'}` : child.first_name} actions={<ChildSwitcher children={children} current={child.id} />}>
      <AutoRefresh seconds={20} />
      {!S ? <Card><Empty title={`${child.first_name} is not on school transport`} hint="To request a route or change a stop, use Requests." /></Card> : <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Right now" className="lg:col-span-2">{live ? <div className="space-y-3 p-4"><div className="flex items-center gap-2"><Badge tone="blue">{live.direction} trip running</Badge>{live.delay_minutes > 0 && <Badge tone="amber">about {live.delay_minutes} min late</Badge>}</div>
          {live.last_lat ? <><p className="text-sm">Last position at {ftime(live.last_at)}.</p><iframe title="Bus location" className="h-72 w-full rounded-lg border border-line" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(live.last_lng) - 0.01}%2C${Number(live.last_lat) - 0.007}%2C${Number(live.last_lng) + 0.01}%2C${Number(live.last_lat) + 0.007}&layer=mapnik&marker=${live.last_lat}%2C${live.last_lng}`} /></> : <p className="text-sm text-muted">The trip has started. The position appears as soon as the driver's phone shares it.</p>}</div>
          : <Empty title="No trip is running" hint={`Pickup at ${String(S.stop?.pickup_time ?? '—').slice(0, 5)}, drop at ${String(S.stop?.drop_time ?? '—').slice(0, 5)}. The bus is shown only during a trip; there is no tracking outside school use.`} />}</Card>
        <Card title="Today">{(ev ?? []).length === 0 ? <Empty title="No boarding or drop yet today" /> : <ul className="divide-y divide-line text-sm">{ev!.map((e, i) => <li key={i} className="flex justify-between px-4 py-2"><Badge tone={e.type === 'boarded' ? 'blue' : e.type === 'dropped' ? 'green' : 'amber'}>{e.type}</Badge><span className="text-muted">{ftime(e.at)}</span></li>)}</ul>}</Card>
      </div>}
    </Page>
  );
}
