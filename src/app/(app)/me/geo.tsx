'use client';
import { useEffect, useState } from 'react';

/** Attaches the phone's location to the check-in form when the user allows it. */
export function GeoFields() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => { navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { timeout: 8000 }); }, []);
  return <><input type="hidden" name="lat" value={pos?.lat ?? ''} /><input type="hidden" name="lng" value={pos?.lng ?? ''} /><p className="text-xs text-muted">{pos ? 'Location attached to this check-in.' : 'Allow location to attach it to your check-in.'}</p></>;
}
