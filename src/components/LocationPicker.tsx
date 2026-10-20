import React, { useEffect, useId, useState } from 'react';
import { LocateFixedIcon, MapPinIcon } from 'lucide-react';
import type { Place } from '../types/skillpass';
import { LAGOS_CENTRE, findArea, insideLagos, lagosAreas, nearestArea } from '../data/lagosAreas';
import { useT } from '../i18n';

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
  const { t } = useT();
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
        if (!typed) setName(insideLagos(here) ? t('loc.near', { area: nearestArea(here).name }) : t('loc.mine'));
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
          placeholder={t('loc.placeholder')}
          autoComplete="off"
          className={`min-w-0 flex-1 ${inputClassName}`} />

        <button
          type="button"
          onClick={locate}
          disabled={status === 'locating'}
          aria-label={t('loc.useMine')}
          title={t('loc.useMine')}
          className={`flex shrink-0 items-center justify-center rounded-xl border px-3 transition-colors duration-150 disabled:opacity-50 ${gps ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-muted hover:bg-canvas hover:text-ink'}`}>
          <LocateFixedIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <datalist id={listId}>
        {lagosAreas.map((a) => <option key={a.name} value={a.name} />)}
      </datalist>

      <p className="mt-1.5 flex items-start gap-1 text-xs text-ink-muted" aria-live="polite">
        <MapPinIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {status === 'locating' ? t('loc.locating') :
        status === 'denied' ? t('loc.denied') :
        status === 'unsupported' ? t('loc.unsupported') :
        gps ? insideLagos(gps) ? t('loc.gps') : t('loc.gpsOutside') :
        approximate ? t('loc.approximate') :
        known ? t('loc.found') :
        t('loc.hint')}
      </p>
    </div>);

}
