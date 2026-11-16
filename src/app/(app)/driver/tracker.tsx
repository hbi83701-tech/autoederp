'use client';
import { useEffect, useState } from 'react';
import { sendPosition } from './actions';

/** Shares the phone's location every 20 seconds while a trip is running (TR-04). Stops when the trip ends. */
export function Tracker({ tripId }: { tripId: string }) {
  const [state, setState] = useState('Starting location…');
  useEffect(() => {
    if (!navigator.geolocation) { setState('This phone cannot share location.'); return; }
    let last = 0;
    const id = navigator.geolocation.watchPosition(async (p) => {
      if (Date.now() - last < 20000) return;
      last = Date.now();
      const speed = p.coords.speed !== null && p.coords.speed >= 0 ? p.coords.speed * 3.6 : null;
      try { await sendPosition(tripId, p.coords.latitude, p.coords.longitude, speed); setState(`Sharing live location · updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`); }
      catch { setState('No network. Location will resume when you are back online.'); }
    }, () => setState('Location permission is off. Turn it on so parents can see the bus.'), { enableHighAccuracy: true, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [tripId]);
  return <div className="rounded-lg bg-brand-soft px-4 py-2 text-sm text-brand-dark" role="status">{state}</div>;
}
