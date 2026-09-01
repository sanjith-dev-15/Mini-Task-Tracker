/**
 * Turn a shared Google Maps link (or pasted coordinates) into a lat/lng.
 *
 * Google's share sheet hands out several shapes:
 *   - short links  https://maps.app.goo.gl/XXXX  /  https://goo.gl/maps/XXXX
 *   - place links  https://www.google.com/maps/place/Name/@12.34,56.78,17z/data=!3d12.34!4d56.78
 *   - query links  https://maps.google.com/?q=12.34,56.78
 * plus people often just paste "12.34, 56.78" straight from the coordinate
 * readout. Short links need a network round-trip to expand; everything else is
 * parsed offline.
 */

const GOOGLE_HOST = /(?:google\.[a-z.]+\/maps|goo\.gl|maps\.app\.goo\.gl|g\.co)/i;

export type ParsedLocation = { lat: number; lng: number; label?: string };

const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

function pair(a: string, b: string): { lat: number; lng: number } | null {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  return inRange(lat, lng) ? { lat, lng } : null;
}

/** Extract "lat,lng" from a Maps URL or bare coordinate text. Offline. */
export function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let s = trimmed;
  try {
    s = decodeURIComponent(trimmed);
  } catch {
    // keep the raw string if it isn't valid percent-encoding
  }

  // `!3d<lat>!4d<lng>` — the exact pinned place inside a /maps/place/ link.
  const pin = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    const r = pair(pin[1], pin[2]);
    if (r) return r;
  }

  // `@<lat>,<lng>,<zoom>z` — the map centre.
  const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    const r = pair(at[1], at[2]);
    if (r) return r;
  }

  // `?q=` / `?ll=` / `?query=` / `?destination=` / `&center=` / `&sll=` …
  const q = s.match(
    /[?&#](?:q|ll|query|destination|center|sll|daddr|viewpoint)=(-?\d+(?:\.\d+)?)[, ]+(-?\d+(?:\.\d+)?)/i,
  );
  if (q) {
    const r = pair(q[1], q[2]);
    if (r) return r;
  }

  // `geo:<lat>,<lng>`
  const geo = s.match(/geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (geo) {
    const r = pair(geo[1], geo[2]);
    if (r) return r;
  }

  // Bare "12.34, 56.78" (also "12.34 56.78").
  const bare = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (bare) {
    const r = pair(bare[1], bare[2]);
    if (r) return r;
  }

  return null;
}

/** Follow a short link's redirects and return the final URL. */
async function expand(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.url || null;
  } catch {
    return null;
  }
}

/** Reverse-geocode to a one-line address (best effort). */
async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse/?lon=${lng}&lat=${lat}`);
    const data: { features?: { properties?: Record<string, unknown> }[] } = await res.json();
    const p = data.features?.[0]?.properties ?? {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const parts = [
      [str(p.housenumber), str(p.street)].filter(Boolean).join(' ') || null,
      str(p.city) ?? str(p.county),
      str(p.state),
      str(p.country),
    ].filter((x): x is string => x != null);
    return parts.join(', ') || str(p.name) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve pasted text (a link or coordinates) to a location, expanding a Google
 * short link over the network if needed. Returns null when nothing usable is
 * found.
 */
export async function resolveSharedLocation(raw: string): Promise<ParsedLocation | null> {
  let coords = parseLatLng(raw);

  if (!coords) {
    const url = raw.trim().match(/https?:\/\/\S+/)?.[0];
    if (url && GOOGLE_HOST.test(url)) {
      const expanded = await expand(url);
      if (expanded) coords = parseLatLng(expanded);
    }
  }

  if (!coords) return null;
  const label = await reverseGeocode(coords.lat, coords.lng);
  return { ...coords, label };
}
