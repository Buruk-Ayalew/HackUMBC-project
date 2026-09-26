// Small geo and date helpers for Local Risk (no turf dependency needed for point distance).

const EARTH_RADIUS_M = 6371008.8;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Key for per-location caches and "seen" tracking (~1 m precision).
export function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// ArcGIS date fields are epoch ms. Some layers store UTC midnight, others local
// midnight (04:00/05:00 UTC). Either way, return the calendar date as YYYY-MM-DD.
export function epochToDate(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  if (ms % 86_400_000 === 0) return d.toISOString().slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function epochToIso(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function daysAgo(n: number, from = new Date()): Date {
  return new Date(from.getTime() - n * 86_400_000);
}

// Collapse whitespace and cut to a short excerpt (we show excerpts, not full records).
export function excerpt(text: string | null | undefined, max = 240): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
