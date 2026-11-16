import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge } from '@/components/ui';
import { ftime, today } from '@/lib/fmt';
import { AutoRefresh } from '../../driver/refresh';

export const metadata = { title: 'Live trips' };
/** Transport manager console (TR-06): all buses, last position and exceptions. Refreshes every 20 seconds. */
export default async function Live() {
  const ctx = await requireCap('transport');
  const d = today();
  const [{ data: trips }, { data: ev }] = await Promise.all([
    ctx.sb.from('trips').select('id, direction, status, started_at, ended_at, delay_minutes, last_lat, last_lng, last_speed, last_at, route:routes!trips_route_id_fkey(name, vehicle:vehicles!routes_vehicle_id_fkey(reg_no))').eq('date', d).order('started_at', { ascending: false }),
    ctx.sb.from('trip_events').select('trip_id, type, note, at').gte('at', d + 'T00:00:00+05:30').order('at', { ascending: false }).limit(2000),
  ]);
  const T = (trips ?? []) as unknown as { id: string; direction: string; status: string; started_at: string; ended_at: string | null; delay_minutes: number; last_lat: number | null; last_lng: number | null; last_speed: number | null; last_at: string | null; route: { name: string; vehicle: { reg_no: string } | null } | null }[];
  const count = (id: string, type: string) => (ev ?? []).filter((e) => e.trip_id === id && e.type === type).length;
  const exceptions = (ev ?? []).filter((e) => ['sos', 'delay', 'overspeed', 'offroute'].includes(e.type));
  return (
    <Page title="Live trips" sub="Phone GPS from the driver app. Location is shared only while a trip is running." actions={<Link className="btn-ghost" href="/transport">Transport</Link>}>
      <AutoRefresh seconds={20} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">{T.length === 0 ? <Card><Empty title="No trips today" hint="Drivers start a trip from the driver app; it appears here at once." /></Card> : T.map((t) => { const stale = t.status === 'running' && (!t.last_at || Date.now() - new Date(t.last_at).getTime() > 5 * 60000); return (
          <Card key={t.id}><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-semibold">{t.route?.name} <span className="font-normal text-muted">· {t.route?.vehicle?.reg_no} · {t.direction}</span></div><div className="text-sm text-muted">Started {ftime(t.started_at)}{t.ended_at ? ` · ended ${ftime(t.ended_at)}` : ''} · {count(t.id, 'boarded')} boarded · {count(t.id, 'dropped')} dropped</div>
            {t.last_lat && <div className="text-sm">Last seen {ftime(t.last_at)}{t.last_speed ? ` · ${Math.round(Number(t.last_speed))} km/h` : ''} · <a className="link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${t.last_lat}&mlon=${t.last_lng}#map=16/${t.last_lat}/${t.last_lng}`}>Open on map</a></div>}</div>
            <div className="flex flex-col items-end gap-1"><Badge>{t.status}</Badge>{t.delay_minutes > 0 && <Badge tone="amber">{t.delay_minutes} min late</Badge>}{stale && <Badge tone="red">no signal for 5+ min</Badge>}</div></div></Card>); })}</div>
        <Card title="Exceptions today">{exceptions.length === 0 ? <Empty title="No exceptions" hint="SOS, delays and over-speed alerts appear here and notify you." /> : <ul className="divide-y divide-line text-sm">{exceptions.map((e, i) => <li key={i} className="flex justify-between gap-2 px-4 py-2"><span><Badge tone={e.type === 'sos' ? 'red' : 'amber'}>{e.type}</Badge> {e.note}</span><span className="text-xs text-muted">{ftime(e.at)}</span></li>)}</ul>}</Card>
      </div>
    </Page>
  );
}
