import React, { useEffect, useId, useState } from 'react';
import { LocateFixedIcon, MapPinIcon } from 'lucide-react';
import type { Place } from '../types/skillpass';
import { LAGOS_CENTRE, findArea, insideLagos, lagosAreas, nearestArea } from '../data/lagosAreas';

interface LocationPickerProps {
  id: string;
  label: string;
  /** Called with the chosen place, or null while the field is empty. */
  onChange: (place: Place | null) => void;
  initial?: Place | null;
  inputClassName?: string;
}

type Gps = {lat: number;lng: number;} | null;
type Status = 'idle' | 'locating' | 'denied' | 'unsupported';

/**
 * Pick a location three ways: share the phone's location, pick a Lagos area from the suggestions, or type any
 * area name. A typed name we don't recognise still works; distance then uses central Lagos and the field says so.
 */
export function LocationPicker({ id, label, onChange, initial = null, inputClassName = '' }: LocationPickerProps) {
  const listId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [gps, setGps] = useState<Gps>(null);
  const [status, setStatus] = useState<Status>('idle');

  const known = findArea(name);
  const typed = name.trim();
  const place: Place | null =
  typed.length < 2 ? null :
  gps ? { name: typed, lat: gps.lat, lng: gps.lng } :
  known ?? (initial && initial.name === typed ? initial : { name: typed, lat: LAGOS_CENTRE.lat, lng: LAGOS_CENTRE.lng });
  const approximate = !!place && !gps && !known && !(initial && initial.name === typed);

  useEffect(() => {
    onChange(place);
    // Only re-emit when the place itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.name, place?.lat, place?.lng]);

  const locate = () => {
    if (!navigator.geolocation) return setStatus('unsupported');
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGps(here);
        setStatus('idle');
        if (!typed) setName(insideLagos(here) ? `Near ${nearestArea(here).name}` : 'My location');
      },
      () => setStatus('denied'),
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          list={listId}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (findArea(e.target.value)) setGps(null); // picking a listed area replaces the phone location
          }}
          placeholder="Area, e.g. Yaba"
          autoComplete="off"
          className={`min-w-0 flex-1 ${inputClassName}`} />

        <button
          type="button"
          onClick={locate}
          disabled={status === 'locating'}
          aria-label="Use my current location"
          title="Use my current location"
          className={`flex shrink-0 items-center justify-center rounded-xl border px-3 transition-colors duration-150 disabled:opacity-50 ${gps ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-muted hover:bg-canvas hover:text-ink'}`}>
          <LocateFixedIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <datalist id={listId}>
        {lagosAreas.map((a) => <option key={a.name} value={a.name} />)}
      </datalist>

      <p className="mt-1.5 flex items-start gap-1 text-xs text-ink-muted" aria-live="polite">
        <MapPinIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {status === 'locating' ? 'Finding your location…' :
        status === 'denied' ? 'Location access was blocked. Type your area instead.' :
        status === 'unsupported' ? "This browser can't share location. Type your area instead." :
        gps ? insideLagos(gps) ? 'Using your phone\'s location.' : 'Using your phone\'s location. You seem to be outside Lagos State, where the pilot runs.' :
        approximate ? "We don't know that area yet, so distances use central Lagos. Tap the location button for better matches." :
        known ? 'Area found.' :
        'Type your area or tap the button to use your location.'}
      </p>
    </div>);

}
