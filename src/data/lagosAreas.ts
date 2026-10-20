import type { Place } from '../types/skillpass';

/**
 * Common Lagos areas and approximate centre points (within a couple of kilometres). Job matching scores distance
 * over 30 km, so this is precise enough when someone types an area instead of sharing their phone's location.
 */
export const lagosAreas: Place[] = [
{ name: 'Agege', lat: 6.6180, lng: 3.3209 },
{ name: 'Agungi, Lekki', lat: 6.4389, lng: 3.5105 },
{ name: 'Ajah', lat: 6.4698, lng: 3.5852 },
{ name: 'Ajegunle', lat: 6.4560, lng: 3.3330 },
{ name: 'Apapa', lat: 6.4489, lng: 3.3590 },
{ name: 'Badagry', lat: 6.4150, lng: 2.8800 },
{ name: 'Balogun Market, Lagos Island', lat: 6.4549, lng: 3.3896 },
{ name: 'Computer Village, Ikeja', lat: 6.5966, lng: 3.3421 },
{ name: 'Egbeda, Alimosho', lat: 6.5920, lng: 3.2960 },
{ name: 'Epe', lat: 6.5840, lng: 3.9830 },
{ name: 'Festac Town', lat: 6.4660, lng: 3.2830 },
{ name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
{ name: 'Ikorodu', lat: 6.6190, lng: 3.5100 },
{ name: 'Ikotun', lat: 6.5480, lng: 3.2640 },
{ name: 'Ikoyi', lat: 6.4541, lng: 3.4347 },
{ name: 'Isolo', lat: 6.5300, lng: 3.3200 },
{ name: 'Iyana Ipaja', lat: 6.6100, lng: 3.2700 },
{ name: 'Ketu', lat: 6.5960, lng: 3.3870 },
{ name: 'Ladipo, Mushin', lat: 6.5352, lng: 3.3531 },
{ name: 'Lekki Phase 1', lat: 6.4474, lng: 3.4727 },
{ name: 'Maryland', lat: 6.5700, lng: 3.3670 },
{ name: 'Mushin', lat: 6.5270, lng: 3.3540 },
{ name: 'Ogba', lat: 6.6250, lng: 3.3400 },
{ name: 'Ojo', lat: 6.4600, lng: 3.1800 },
{ name: 'Ojodu Berger', lat: 6.6400, lng: 3.3700 },
{ name: 'Oshodi', lat: 6.5550, lng: 3.3430 },
{ name: 'Sangotedo', lat: 6.4700, lng: 3.6300 },
{ name: 'Surulere', lat: 6.4969, lng: 3.3538 },
{ name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
{ name: 'Yaba', lat: 6.5095, lng: 3.3711 }];


/** Used for distance when someone types an area we don't know and doesn't share their location. */
export const LAGOS_CENTRE: Place = { name: 'Lagos', lat: 6.5244, lng: 3.3792 };

/** Rough box around Lagos State, used only to warn people who seem to be outside the pilot area. */
export const insideLagos = (p: {lat: number;lng: number;}) => p.lat >= 6.35 && p.lat <= 6.75 && p.lng >= 2.7 && p.lng <= 4.4;

const km = (a: {lat: number;lng: number;}, b: {lat: number;lng: number;}) => {
  const rad = (d: number) => d * Math.PI / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

export const nearestArea = (p: {lat: number;lng: number;}) =>
lagosAreas.reduce((best, a) => km(a, p) < km(best, p) ? a : best, lagosAreas[0]);

export const findArea = (name: string) => lagosAreas.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
