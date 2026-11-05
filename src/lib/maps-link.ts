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

import * as Location from 'expo-location';

import { geocodePlaceName, reverseGeocode, type LatLng } from '@/lib/geocode';
import { expandLink } from '../../modules/reminder-overlay';

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
 * Scrape a pinned place's coordinates from a Google Maps HTML page.
 *
 * Deliberately NOT the page's `staticmap?center=` or `APP_INITIALIZATION_STATE`
 * viewport: without JavaScript Google centres those on the *viewer's* own
 * location, so they'd silently pin wherever the user is now.
 */
function coordsFromHtml(html: string): { lat: number; lng: number } | null {
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

  return null;
}

/** GET a URL (following redirects); its final URL and body, or null if unreachable. */
async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' },
    });
    // Normalise the escapes Google sprinkles through its inline JSON.
    const html = (await res.text())
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/%2C/gi, ',');
    return { url: res.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** The place name in a `/maps/place/<Name>/…` or `?q=<text>` link, if any. */
export function placeNameOf(url: string): string | null {
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' ')).trim();
    } catch {
      return s.replace(/\+/g, ' ').trim();
    }
  };
  const place = url.match(/\/maps\/place\/([^/@?#]+)/)?.[1];
  if (place) return decode(place) || null;
  const q = url.match(/[?&](?:q|query)=([^&#]+)/)?.[1];
  const text = q ? decode(q) : '';
  // Coordinates aren't a name (parseLatLng handles those).
  return text && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text) ? text : null;
}

async function lastKnownSpot(): Promise<LatLng | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const pos = await Location.getLastKnownPositionAsync();
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve pasted text (a link or coordinates) to a location. Returns null when
 * nothing usable is found.
 *
 * For a Google link: expand it (natively first — some ISPs, Jio among them,
 * block `maps.app.goo.gl` at DNS), read coordinates off the full URL, else look
 * up the place's name (Google keeps a place's coordinates out of its no-JS
 * page), else scrape the page for a pin.
 */
export async function resolveSharedLocation(raw: string): Promise<ParsedLocation | null> {
  const direct = parseLatLng(raw);
  if (direct) return { ...direct, label: await reverseGeocode(direct.lat, direct.lng) };

  const url = raw.trim().match(/https?:\/\/\S+/)?.[0];
  if (!url || !GOOGLE_HOST.test(url)) return null;

  const expanded = await expandLink(url);
  const page = expanded ? null : await fetchPage(url);
  const full = expanded ?? page?.url ?? url;
  const name = placeNameOf(full);

  const fromUrl = parseLatLng(full);
  if (fromUrl) {
    return { ...fromUrl, label: name ?? (await reverseGeocode(fromUrl.lat, fromUrl.lng)) };
  }

  if (name) {
    const hit = await geocodePlaceName(name, await lastKnownSpot());
    if (hit) return hit;
  }

  const html = page?.html ?? (await fetchPage(full))?.html;
  const scraped = html ? (coordsFromHtml(html) ?? null) : null;
  if (!scraped) return null;
  return { ...scraped, label: name ?? (await reverseGeocode(scraped.lat, scraped.lng)) };
}
