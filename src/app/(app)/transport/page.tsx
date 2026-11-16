import Link from 'next/link';
import { requireCap } from '@/lib/ctx';
import { Page, Card, Empty, Badge, Stat } from '@/components/ui';
import { fdate, today, fullName } from '@/lib/fmt';
import { addDays } from '@/lib/calendar';
import { entitiesOf } from '@/lib/nav';

export const metadata = { title: 'Transport' };
/** Transport console (TR-01, TR-02): routes with capacity checks and compliance documents with expiry alerts. */
export default async function Transport() {
  const ctx = await requireCap('transport');
  const [{ data: routes }, { data: vehicles }, { data: st }, { data: drivers }, { data: trips }] = await Promise.all([
    ctx.sb.from('routes').select('id, name, zone, monthly_fee, active, vehicle:vehicles!routes_vehicle_id_fkey(reg_no, capacity), driver:staff!routes_driver_id_fkey(first_name, last_name, licence_expiry, bgv_status), stops(count)').order('name'),
    ctx.sb.from('vehicles').select('*').eq('active', true), ctx.sb.from('student_transport').select('route_id').eq('active', true).limit(20000),
    ctx.sb.from('staff').select('id, first_name, last_name, licence_expiry, bgv_status').in('staff_type', ['driver', 'attendant']).eq('status', 'active'),
    ctx.sb.from('trips').select('id, status').eq('date', today()),
  ]);
  const d = today(), soon = addDays(d, 30);
  const riders = new Map<string, number>(); for (const s of st ?? []) riders.set(s.route_id, (riders.get(s.route_id) ?? 0) + 1);
  const alerts: { what: string; when: string; expired: boolean }[] = [];
  for (const v of vehicles ?? []) for (const [k, l] of [['registration_expiry', 'Registration'], ['fitness_expiry', 'Fitness certificate'], ['insurance_expiry', 'Insurance'], ['permit_expiry', 'Permit'], ['puc_expiry', 'Pollution certificate']] as const) { const x = v[k] as string | null; if (x && x <= soon) alerts.push({ what: `${v.reg_no} · ${l}`, when: x, expired: x < d }); }
  for (const s of drivers ?? []) { if (s.licence_expiry && s.licence_expiry <= soon) alerts.push({ what: `${fullName(s)} · Driving licence`, when: s.licence_expiry, expired: s.licence_expiry < d }); if (s.bgv_status !== 'clear') alerts.push({ what: `${fullName(s)} · Background verification ${s.bgv_status}`, when: d, expired: s.bgv_status === 'flagged' }); }
  const R = (routes ?? []) as unknown as { id: string; name: string; zone: string; monthly_fee: number; active: boolean; vehicle: { reg_no: string; capacity: number } | null; driver: { first_name: string; last_name: string } | null; stops: { count: number }[] }[];
  const can = ctx.can('transport', 'write');
  return (
    <Page title="Transport" sub="Routes, vehicles, compliance and live trips." actions={<><Link className="btn-ghost" href="/transport/live">Live trips</Link><Link className="btn-ghost" href="/driver">Driver app</Link>{can && <Link className="btn" href="/x/routes/new?back=/transport">New route</Link>}</>}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Routes" value={R.filter((r) => r.active).length} /><Stat label="Students on transport" value={(st ?? []).length} /><Stat label="Trips today" value={(trips ?? []).length} hint={`${(trips ?? []).filter((t) => t.status === 'running').length} running`} href="/transport/live" /><Stat label="Compliance alerts" value={alerts.length} tone={alerts.some((a) => a.expired) ? 'bad' : alerts.length ? 'warn' : 'good'} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Routes" className="lg:col-span-2">{R.length === 0 ? <Empty title="No routes yet" hint="Create a route, add its stops with times, then assign students to stops." /> : <table className="tbl"><thead><tr><th>Route</th><th>Vehicle</th><th>Driver</th><th>Stops</th><th>Students / capacity</th></tr></thead><tbody>{R.map((r) => { const n = riders.get(r.id) ?? 0, cap = r.vehicle?.capacity ?? 0; return <tr key={r.id}><td><Link className="link font-medium" href={`/x/routes/${r.id}?back=/transport`}>{r.name}</Link><div className="text-xs text-muted">{r.zone}</div></td><td>{r.vehicle?.reg_no ?? <span className="text-red-600">none</span>}</td><td>{r.driver ? fullName(r.driver) : <span className="text-red-600">none</span>}</td><td><Link className="link" href={`/x/stops?q=`}>{r.stops?.[0]?.count ?? 0}</Link></td><td>{n} / {cap || '—'} {cap > 0 && n > cap && <Badge tone="red">over capacity</Badge>}</td></tr>; })}</tbody></table>}</Card>
        <Card title="Document and expiry alerts">{alerts.length === 0 ? <Empty title="Everything is in date" hint="Alerts start 30 days before a vehicle or driver document expires." /> : <ul className="divide-y divide-line text-sm">{alerts.sort((a, b) => a.when.localeCompare(b.when)).map((a, i) => <li key={i} className="flex justify-between gap-2 px-4 py-2"><span>{a.what}</span><Badge tone={a.expired ? 'red' : 'amber'}>{a.expired ? 'expired' : fdate(a.when)}</Badge></li>)}</ul>}</Card>
      </div>
      <Card title="Transport desk" className="mt-4"><div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">{entitiesOf('transport').map((e) => <Link key={e.table} href={`/x/${e.table}`} className="bg-white px-4 py-3 text-sm hover:bg-paper">{e.title}</Link>)}</div></Card>
    </Page>
  );
}
