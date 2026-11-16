'use server';
import { getCtx } from '@/lib/ctx';
import { go, str } from '@/lib/fmt';

export async function startTrip(fd: FormData) { const ctx = await getCtx(); const { data, error } = await ctx.sb.rpc('driver_trip_start', { p_route: str(fd, 'route'), p_direction: str(fd, 'direction') ?? 'pickup' }); go(error ? '/driver' : `/driver?trip=${data}`, error ? error.message : 'Trip started. Parents on this route have been told.', error ? 'err' : 'ok'); }
export async function endTrip(fd: FormData) { const ctx = await getCtx(); const { error } = await ctx.sb.rpc('driver_trip_end', { p_trip: str(fd, 'trip') }); go('/driver', error ? error.message : 'Trip ended. Location sharing has stopped.', error ? 'err' : 'ok'); }
export async function mark(fd: FormData) { const ctx = await getCtx(); const trip = str(fd, 'trip')!; const { error } = await ctx.sb.rpc('driver_mark', { p_trip: trip, p_student: str(fd, 'student'), p_type: str(fd, 'type'), p_note: str(fd, 'note') }); go(`/driver?trip=${trip}`, error ? error.message : str(fd, 'type') === 'sos' ? 'SOS sent to the transport manager and principal.' : undefined, error ? 'err' : 'ok'); }
export async function sendPosition(trip: string, lat: number, lng: number, speed: number | null) { const ctx = await getCtx(); await ctx.sb.rpc('driver_position', { p_trip: trip, p_lat: lat, p_lng: lng, p_speed: speed }); }
