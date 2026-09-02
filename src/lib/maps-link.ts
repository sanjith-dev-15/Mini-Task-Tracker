/**
 * Turn a shared Google Maps link (or pasted coordinates) into a lat/lng.
 *
 * Google's share sheet hands out several shapes:
 *   - short links  https://maps.app.goo.gl/XXXX  /  https://goo.gl/maps/XXXX
 *   - place links  https://www.google.com/maps/place/Name/@12.34,56.78,17z/data=!3d12.34!4d56.78
 *   - query links  https://maps.google.com/?q=12.34,56.78
 * plus people often just paste "12.34, 56.78" straight from the coordinate
 * readout. Short links (and place links that only carry a feature id) need a
 * network round-trip: we follow the redirects and, failing that, scrape the
 * coordinates out of the returned HTML.
 */

const GOOGLE_HOST = /google\.[a-z.]+\/maps|goo\.gl|maps\.app\.goo\.gl|g\.co|glgoo\.gl/i;

/** A desktop browser UA — Google serves a clean redirect + richer HTML to one. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

/** Extract "lat,lng" from a Maps URL, coordinate text, or a chunk of HTML. */
export function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let s = trimmed;
  try {
    s = decodeURIComponent(trimmed);
  } catch {
    // A whole HTML body rarely decodes cleanly — fall back to the raw text.
  }

  // `!3d<lat>!4d<lng>` — the exact pinned place inside a /maps/place/ link or
  // its HTML. The most reliable signal, so try it first.
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
  // (comma may arrive URL-encoded as %2C when the body didn't decode).
  const q = s.match(
    /[?&#](?:q|ll|query|destination|center|sll|saddr|daddr|viewpoint|cbll)=(-?\d+(?:\.\d+)?)(?:\s*(?:,|%2c)\s*|\s+)(-?\d+(?:\.\d+)?)/i,
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

/**
 * Scrape coordinates from a Google Maps HTML page, most-reliable signal first.
 * A `maps.app.goo.gl` link often resolves to a `/maps/place/` URL that carries
 * only a feature id, so the coordinates have to come from the page itself.
 */
function coordsFromHtml(html: string): { lat: number; lng: number } | null {
  // The Static Maps thumbnail baked into the page: `staticmap?center=<lat>,<lng>`.
  const center = html.match(/staticmap\?[^"'<>\s]*?center=(-?\d+\.\d+),(-?\d+\.\d+)/i);
  if (center) {
    const r = pair(center[1], center[2]);
    if (r) return r;
  }

  // `!3d<lat>!4d<lng>` — and the `!2d<lng>!3d<lat>` variant Google also embeds.
  const pin4 = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin4) {
    const r = pair(pin4[1], pin4[2]);
    if (r) return r;
  }
  const pin23 = html.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
  if (pin23) {
    const r = pair(pin23[2], pin23[1]); // !2d = lng, !3d = lat
    if (r) return r;
  }

  // `og:url` / `<link rel=canonical>` — the fully-resolved place URL.
  const canonical =
    html.match(/rel=["']?canonical["']?[^>]*?href=["']([^"']+)["']/i)?.[1] ??
    html.match(/property=["']og:url["'][^>]*?content=["']([^"']+)["']/i)?.[1];
  if (canonical) {
    const r = parseLatLng(canonical);
    if (r) return r;
  }

  // `APP_INITIALIZATION_STATE=[[[<x>,<lng>,<lat>], …`
  const init = html.match(
    /APP_INITIALIZATION_STATE=\[\[\[-?[\d.eE+]+,(-?\d+\.\d+),(-?\d+\.\d+)\]/,
  );
  if (init) {
    const r = pair(init[2], init[1]); // [x, lng, lat]
    if (r) return r;
  }

  return null;
}

/** Resolve a Google Maps URL (short or long) to coordinates over the network. */
async function resolveGoogleUrl(url: string): Promise<{ lat: number; lng: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' },
    });

    // 1. Redirected straight to a coordinate-bearing maps URL.
    const fromUrl = parseLatLng(res.url);
    if (fromUrl) return fromUrl;

    // 2. Otherwise dig through the returned HTML (normalising the escapes
    //    Google sprinkles through its inline JSON).
    const clean = (await res.text())
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/%2C/gi, ',');
    return coordsFromHtml(clean) ?? parseLatLng(clean);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
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
 * Resolve pasted text (a link or coordinates) to a location, hitting the network
 * to expand a Google link when an offline parse comes up empty. Returns null
 * when nothing usable is found.
 */
export async function resolveSharedLocation(raw: string): Promise<ParsedLocation | null> {
  let coords = parseLatLng(raw);

  if (!coords) {
    const url = raw.trim().match(/https?:\/\/\S+/)?.[0];
    if (url && GOOGLE_HOST.test(url)) {
      coords = await resolveGoogleUrl(url);
    }
  }

  if (!coords) return null;
  const label = await reverseGeocode(coords.lat, coords.lng);
  return { ...coords, label };
}
