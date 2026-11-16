import { getCtx } from '@/lib/ctx';
import { Page, Card, Empty } from '@/components/ui';
import { ConfirmSubmit } from '@/components/client';
import { startTrip, endTrip, mark } from './actions';
import { Tracker } from './tracker';

export const metadata = { title: 'Driver app' };
type Row = { student_id: string; name: string; stop: string | null; last_event: string | null };
/** Driver and attendant app (OAP-01): start and end a trip, tap to mark boarding and drop, SOS. Big buttons. */
export default async function Driver({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { data: routes } = await ctx.sb.rpc('driver_routes');
  const R = (routes ?? []) as { id: string; name: string; vehicle: string | null; running_trip: string | null }[];
  const trip = sp.trip ?? R.find((r) => r.running_trip)?.running_trip ?? null;
  const { data: studs } = trip ? await ctx.sb.rpc('driver_trip_students', { p_trip: trip }) : { data: null };
  const S = (studs ?? []) as Row[];
  const route = R.find((r) => r.running_trip === trip);
  if (!trip || !route) return (
    <Page title="Driver app" sub="Choose your route and start the trip.">
      {R.length === 0 ? <Card><Empty title="No route is assigned to you" hint="Ask the transport manager to set you as the driver or attendant on a route." /></Card> : <div className="grid gap-3 sm:grid-cols-2">{R.map((r) => <Card key={r.id}><div className="space-y-3 p-4"><div className="text-lg font-semibold">{r.name}</div><div className="text-sm text-muted">{r.vehicle ?? 'No vehicle set'}</div>
        <form action={startTrip} className="grid grid-cols-2 gap-2"><input type="hidden" name="route" value={r.id} /><button name="direction" value="pickup" className="btn !py-4 text-base">Start pickup</button><button name="direction" value="drop" className="btn-ghost !py-4 text-base">Start drop</button></form></div></Card>)}</div>}
    </Page>);
  const on = S.filter((s) => s.last_event === 'boarded').length;
  return (
    <Page title={route.name} sub={`${route.vehicle ?? ''} · ${on} on the bus · ${S.length} on this route`}>
      <div className="space-y-3">
        <Tracker tripId={trip} />
        {S.length === 0 ? <Card><Empty title="No students are assigned to this route" /></Card> : <div className="space-y-2">{S.map((s) => (
          <div key={s.student_id} className={`card flex items-center justify-between gap-2 p-3 ${s.last_event === 'boarded' ? 'border-emerald-300 bg-emerald-50' : s.last_event === 'dropped' ? 'bg-slate-50' : s.last_event === 'absent' ? 'border-red-200 bg-red-50' : ''}`}>
            <div><div className="text-base font-medium">{s.name}</div><div className="text-xs text-muted">{s.stop ?? 'No stop'}{s.last_event ? ` · ${s.last_event}` : ''}</div></div>
            <form action={mark} className="flex gap-1"><input type="hidden" name="trip" value={trip} /><input type="hidden" name="student" value={s.student_id} />
              {s.last_event !== 'boarded' && s.last_event !== 'dropped' && <><button name="type" value="boarded" className="btn !px-4 !py-3">Boarded</button><button name="type" value="absent" className="btn-ghost !py-3">Absent</button></>}
              {s.last_event === 'boarded' && <button name="type" value="dropped" className="btn !px-4 !py-3">Dropped</button>}</form></div>))}</div>}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <form action={mark}><input type="hidden" name="trip" value={trip} /><input type="hidden" name="note" value="15" /><button name="type" value="delay" className="btn-ghost w-full !py-4">Running late</button></form>
          <form action={mark}><input type="hidden" name="trip" value={trip} /><ConfirmSubmit name="type" value="sos" className="btn-danger w-full !py-4 text-base" message="Send an SOS to the transport manager and principal?">SOS</ConfirmSubmit></form>
          <form action={endTrip}><input type="hidden" name="trip" value={trip} /><ConfirmSubmit className="btn-ghost w-full !py-4" message="End this trip? Location sharing stops.">End trip</ConfirmSubmit></form>
        </div>
      </div>
    </Page>
  );
}
