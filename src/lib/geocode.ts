/**
 * Address lookup — one place for every coordinate→address and text→place query.
 *
 * Two sources, deliberately ordered:
 *
 *   1. The OS geocoder (`expo-location`). On Android this is the platform
 *      Geocoder, which is backed by Google's address data — far better house
 *      number and locality coverage than OpenStreetMap, especially in India
 *      where OSM housenumber tagging is sparse. Needs foreground location
 *      permission and is rate-limited by the OS, so it is only ever called for
 *      a deliberate user action (pin here / long-press), never per keystroke.
 *
 *   2. Photon (photon.komoot.io) — OSM geocoder built for type-ahead. Free, no
 *      API key. Used for search-as-you-type, and as the reverse fallback when
 *      the OS geocoder is unavailable, unpermitted, or only manages to place
 *      the coordinate in a region.
 *
 * Nothing here invents address parts: every component comes from a provider
 * response. A vague-but-true label beats a specific wrong one, because the
 * label is what the user reads back to confirm the geofence is on the right
 * building.
 */

import * as Location from 'expo-location';

export type LatLng = { lat: number; lng: number };

const PHOTON_SEARCH = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE = 'https://photon.komoot.io/reverse/';

/** Photon is a free shared service — give it a bounded time to answer. */
const PHOTON_TIMEOUT_MS = 6000;

/** One row in the search autocomplete list. */
export type Suggestion = {
  key: string;
  /** Place name (primary line). */
  name: string;
  /** Humanised OSM category, e.g. "Cafe" — or null. */
  category: string | null;
  /** Full one-line address (secondary line). */
  address: string;
  lat: number;
  lng: number;
};

export const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * Join address components, dropping blanks and case-insensitive repeats.
 * Providers routinely echo the same value in two fields (`city` and `county`,
 * `district` and `suburb`), which reads as "Indiranagar, Indiranagar".
 */
function joinParts(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const s = str(part);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.join(', ');
}

/**
 * Google hands back an Open Location Code ("7J4V+XR Bengaluru, ...") when it
 * has no street address for the point. The code is noise to a human reading
 * back a reminder, so strip it and keep the place names that follow.
 */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i;

const stripPlusCode = (s: string): string => s.replace(PLUS_CODE, '').trim();

// ---------------------------------------------------------------------------
// Photon (OSM)
// ---------------------------------------------------------------------------

/** Humanise a Photon `osm_value`/`osm_key` (e.g. `fast_food` → "Fast food"). */
function categoryLabel(p: Record<string, unknown>): string | null {
  const raw =
    (str(p.osm_value) && p.osm_value !== 'yes' ? str(p.osm_value) : null) ?? str(p.osm_key);
  if (!raw) return null;
  const s = raw.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Assemble a single-line address from a Photon feature's properties.
 *
 * Two things this has to get right, both of which the previous version got
 * wrong and both of which are why labels read as a bare "Bengaluru, Karnataka,
 * India":
 *
 *   - The street is not always in `street`. For an OSM way (`type: "street"`)
 *     Photon puts the road name in `name` and leaves `street`/`housenumber`
 *     unset — so reverse-geocoding 100 Feet Road silently dropped "100 Feet
 *     Road" and led with the neighbourhood. When there is no house number or
 *     street, `name` *is* the street line.
 *   - The neighbourhood arrives in whichever of `neighbourhood` / `suburb` /
 *     `locality` / `district` the underlying OSM object happened to use; none
 *     of them were read at all.
 *
 * One token per level, most specific first — stacking `locality` *and*
 * `district` yields noise like "Indiranagar 1st Stage, Hoysala Nagara Central"
 * where the second half is an administrative ward nobody navigates by.
 *
 * `includeName` is off for search suggestions, where the name is already shown
 * as the primary line and repeating it in the secondary line reads as a stutter.
 */
export function photonAddressLine(
  p: Record<string, unknown>,
  { includeName = true }: { includeName?: boolean } = {},
): string {
  const houseStreet = [str(p.housenumber), str(p.street)].filter(Boolean).join(' ');
  const streetLine = houseStreet || (includeName ? str(p.name) : null);
  return joinParts([
    streetLine,
    str(p.neighbourhood) ?? str(p.suburb) ?? str(p.locality) ?? str(p.district),
    str(p.city) ?? str(p.town) ?? str(p.village) ?? str(p.county),
    str(p.postcode),
    str(p.state),
    str(p.country),
  ]);
}

function placeName(p: Record<string, unknown>): string {
  return (
    str(p.name) ??
    str(p.street) ??
    str(p.district) ??
    str(p.city) ??
    str(p.state) ??
    str(p.country) ??
    'Unknown place'
  );
}

function toSuggestion(f: GeoJSON.Feature, i: number): Suggestion | null {
  const c = (f.geometry as GeoJSON.Point | undefined)?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  return {
    key: `${(p as { osm_id?: number }).osm_id ?? 'x'}-${i}`,
    name: placeName(p),
    category: categoryLabel(p),
    address: photonAddressLine(p, { includeName: false }),
    lat: c[1],
    lng: c[0],
  };
}

/** `fetch` with a hard timeout — a hung request must not wedge the pin flow. */
async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    // A provider that answers 503 (Photon's `/reverse` does, for hours at a
    // time) must read as "no answer" so the next source gets a turn.
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Type-ahead place search, biased toward `near` (the current map centre).
 *
 * `location_bias_scale` pulls nearby hits up the ranking hard enough that
 * "reliance fresh" resolves to the one down the road rather than the one in
 * another state; Photon's default of 0.2 barely moves the order at all.
 */
export async function searchPlaces(
  q: string,
  near?: [number, number] | null,
): Promise<Suggestion[]> {
  const url =
    PHOTON_SEARCH +
    '?limit=6&lang=en&q=' +
    encodeURIComponent(q) +
    (near ? `&lon=${near[0]}&lat=${near[1]}&zoom=13&location_bias_scale=0.6` : '');
  const data = await fetchJson<{ features?: GeoJSON.Feature[] }>(url);
  if (!data) return [];
  return (data.features ?? [])
    .map(toSuggestion)
    .filter((s): s is Suggestion => s != null);
}

/** Reverse-geocode via Photon. Returns undefined when it has nothing. */
async function reverseViaPhoton(lat: number, lng: number): Promise<string | undefined> {
  const data = await fetchJson<{ features?: GeoJSON.Feature[] }>(
    `${PHOTON_REVERSE}?lon=${lng}&lat=${lat}&lang=en`,
  );
  const p = (data?.features?.[0]?.properties ?? {}) as Record<string, unknown>;
  return photonAddressLine(p) || str(p.name) || undefined;
}

// ---------------------------------------------------------------------------
// Nominatim (OSM) — last resort
// ---------------------------------------------------------------------------

/**
 * Photon's free public instance serves search and reverse from separate
 * upstreams, and `/reverse` goes down on its own for long stretches (a flat
 * 503 while `/api/` keeps answering 200). That used to leave a pinned reminder
 * with no address at all, so Nominatim — OSM's own reverse geocoder, different
 * host, different operator — backs it up.
 *
 * Their usage policy requires an identifying User-Agent and no more than one
 * request a second, which is why this is last in the chain and rate-limited: it
 * is only ever reached for a deliberate pin when two other sources have
 * already failed.
 */
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

// Replace with a contact URL for this app if you publish it — Nominatim asks
// for a way to reach the operator of a heavy client.
const USER_AGENT = 'Goku-Reminders/1.0 (+https://github.com/sanjith-dev-15)';

const NOMINATIM_MIN_GAP_MS = 1100;
let lastNominatimAt = 0;

/** Compose a one-line address from Nominatim's `address` detail object. */
function nominatimAddressLine(a: Record<string, unknown>, name: string | null): string {
  const houseRoad = [str(a.house_number), str(a.road)].filter(Boolean).join(' ');
  return joinParts([
    houseRoad || name,
    str(a.neighbourhood) ?? str(a.suburb) ?? str(a.residential),
    str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.municipality),
    str(a.postcode),
    str(a.state),
    str(a.country),
  ]);
}

async function reverseViaNominatim(lat: number, lng: number): Promise<string | undefined> {
  const since = Date.now() - lastNominatimAt;
  if (since < NOMINATIM_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, NOMINATIM_MIN_GAP_MS - since));
  }
  lastNominatimAt = Date.now();

  const data = await fetchJson<{
    name?: string;
    display_name?: string;
    address?: Record<string, unknown>;
  }>(
    `${NOMINATIM_REVERSE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    { 'User-Agent': USER_AGENT },
  );
  if (!data) return undefined;
  // `display_name` piles on every administrative level ("... Bengaluru Central
  // City Corporation, Bangalore North, Bengaluru Urban, ..."), so compose from
  // the structured parts and keep `display_name` only as a floor.
  return (
    nominatimAddressLine(data.address ?? {}, str(data.name)) ||
    str(data.display_name) ||
    undefined
  );
}

// ---------------------------------------------------------------------------
// OS geocoder
// ---------------------------------------------------------------------------

/** Compose a one-line address from an OS geocoder result. */
function nativeAddressLine(a: Location.LocationGeocodedAddress): string {
  // Android composes `formattedAddress` itself and does it well — prefer it,
  // minus any plus-code prefix. iOS does not provide the field at all.
  const formatted = str(a.formattedAddress);
  if (formatted) {
    const cleaned = stripPlusCode(formatted);
    if (cleaned) return cleaned.replace(/\s*\n\s*/g, ', ');
  }
  const houseStreet = [str(a.streetNumber), str(a.street)].filter(Boolean).join(' ');
  return joinParts([
    houseStreet || str(a.name),
    str(a.district),
    str(a.city) ?? str(a.subregion),
    str(a.postalCode),
    str(a.region),
    str(a.country),
  ]);
}

/**
 * Did the OS actually place this at a street or landmark, or did it only
 * manage the city? A city-only answer is no better than Photon's, so we let
 * Photon have a turn rather than settling for it.
 */
function isSpecific(a: Location.LocationGeocodedAddress): boolean {
  return Boolean(str(a.street) || str(a.name) || str(a.district));
}

/**
 * Reverse-geocode through the OS. Returns undefined when location permission
 * has not been granted (we check silently — this must never raise a permission
 * prompt on a long-press), when the device has no geocoder backend, or when
 * the result is too coarse to be worth showing.
 */
async function reverseViaOs(lat: number, lng: number): Promise<string | undefined> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return undefined;
    const [hit] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!hit || !isSpecific(hit)) return undefined;
    return nativeAddressLine(hit) || undefined;
  } catch {
    // No Play Services geocoder backend, or the OS rate-limited us.
    return undefined;
  }
}

/**
 * Coordinate → one-line address, best available source.
 *
 * OS geocoder → Photon → Nominatim, stopping at the first real answer. The OS
 * leads because on Android its data is Google's (house numbers and localities
 * that simply are not in OSM); the two OSM services behind it cover the cases
 * where permission was never granted, the device has no geocoder backend, or
 * the OS could only name the city.
 *
 * Returns undefined only when all three come up empty — callers must then show
 * the raw coordinate rather than a guess, because a plausible wrong address on
 * a geofence is worse than an obviously vague one.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  return (
    (await reverseViaOs(lat, lng)) ??
    (await reverseViaPhoton(lat, lng)) ??
    (await reverseViaNominatim(lat, lng))
  );
}
