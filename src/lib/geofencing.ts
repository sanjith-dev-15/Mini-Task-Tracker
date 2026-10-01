import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { Reminder } from '@/lib/reminders';
import {
  overlaySupported,
  showOverlay,
  type OverlayContent,
} from '../../modules/reminder-overlay';

/**
 * Location reminders (geofencing).
 *
 * We register one geofence per located, not-done reminder. When the device
 * enters one — even with the app closed — the background task below reads the
 * reminders straight from AsyncStorage (it can't touch React state), shows the
 * arrival card over other apps (Android, "Display over other apps" granted) and
 * posts a local notification.
 *
 * This module is imported at the top of the root layout so `defineTask` and
 * `setNotificationHandler` run during module load, as expo-task-manager requires.
 */

const GEOFENCE_TASK = 'reminder-geofence';
const CHANNEL_ID = 'reminders';
const ENABLED_KEY = 'geofence:enabled';
/** Fingerprint of the currently-registered region set (see `syncGeofences`). */
const SIGNATURE_KEY = 'geofence:signature';
/** Must match STORAGE_KEY in `src/lib/reminders.tsx`. */
const REMINDERS_KEY = 'reminders:v1';
/** Reminder ids whose geofence fired but the in-app arrival modal hasn't shown yet. */
const ARRIVALS_KEY = 'geofence:arrivals';
/** Background location updates (Android foreground service) — see below. */
const WATCH_TASK = 'reminder-watch';
/** Reminder ids the device is currently inside (already alerted for this visit). */
const INSIDE_KEY = 'geofence:inside';
/** Must match STORAGE_KEY in `src/lib/theme.tsx`. */
const THEME_KEY = 'theme:mode';
/** Must match `expo.scheme` in app.json. */
const DEEP_LINK_SCHEME = 'app';

/** Radius options offered in the reminder editor (metres). */
export const RADIUS_OPTIONS = [200, 500, 1000] as const;
export const DEFAULT_RADIUS = 500;

export function radiusLabel(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

/* ----------------------------------------------------------- background task */

Notifications.setNotificationHandler({
  // While the app is open, skip the banner for a location reminder whose card
  // is already on screen — the overlay, or (iOS / old build) the in-app
  // modal. The sound still plays.
  handleNotification: async (n) => {
    const data = n.request.content.data;
    const cardShown =
      data?.reminderId != null && (data.overlay === true || !overlaySupported);
    return {
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: !cardShown,
      shouldShowList: !cardShown,
    };
  },
});

/*
 * Two triggers feed the same alert:
 * - OS geofences (cheap, but on Android they only fire when *something* asks
 *   for a fresh location — with the app closed that can take ages, so the
 *   alert used to turn up only once the app was opened and the map asked
 *   for a fix);
 * - a location-updates task running as a foreground service (Android shows
 *   a small "Location reminders on" notification), which keeps fixes coming
 *   while the app is closed and checks the distance to each reminder itself.
 * `INSIDE_KEY` remembers which reminders we're already inside so each visit
 * alerts once, whichever trigger gets there first.
 */

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  try {
    const id = region.identifier;
    if (!id) return;
    if (eventType === Location.GeofencingEventType.Exit) {
      await updateInside((ids) => ids.delete(id));
      return;
    }
    const reminders = await storedReminders();
    const match = reminders.find((r) => r.id === id && !r.done);
    if (match) await arrive([match]);
  } catch {
    // A background task must never throw.
  }
});

TaskManager.defineTask(WATCH_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const fix = locations?.[locations.length - 1]?.coords;
  if (!fix) return;
  try {
    const reminders = (await storedReminders()).filter((r) => r.location && !r.done);
    const entered: Reminder[] = [];
    const left: string[] = [];
    for (const r of reminders) {
      const radius = r.location!.radius ?? DEFAULT_RADIUS;
      const d = distanceMeters(fix.latitude, fix.longitude, r.location!.lat, r.location!.lng);
      if (d <= radius) entered.push(r);
      // A little slack (and the fix's own error) so GPS jitter at the edge
      // doesn't count as leaving and arriving again.
      else if (d > radius * 1.2 + (fix.accuracy ?? 0)) left.push(r.id);
    }
    if (left.length) await updateInside((ids) => left.forEach((id) => ids.delete(id)));
    if (entered.length) await arrive(entered);
  } catch {
    // A background task must never throw.
  }
});

/** Alert for each reminder we weren't already inside. */
async function arrive(reminders: Reminder[]) {
  let fresh: Reminder[] = [];
  await updateInside((ids) => {
    fresh = reminders.filter((r) => !ids.has(r.id));
    fresh.forEach((r) => ids.add(r.id));
  });
  if (fresh.length === 0) return;

  const dark = await overlayDarkMode();
  await ensureChannel();
  for (const r of fresh) {
    const content = arrivalOverlayContent(r, dark);
    const { title, subtitle: near, notes } = content;

    // Android: pop the card over whatever is on screen (app open or not).
    // Otherwise queue it for the in-app modal on the next open.
    const overlay = showOverlay(content);
    if (!overlay) await addArrival(r.id);

    await Notifications.scheduleNotificationAsync({
      // Fixed id: if both triggers race, the second replaces the first.
      identifier: `arrival-${r.id}`,
      content: {
        title,
        body: notes ? `${near}\n${notes}` : near,
        data: { reminderId: r.id, overlay },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  }
}

async function storedReminders(): Promise<Reminder[]> {
  const raw = await AsyncStorage.getItem(REMINDERS_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

/** Read-modify-write the "currently inside" set. */
async function updateInside(change: (ids: Set<string>) => void) {
  let ids: Set<string>;
  try {
    const raw = await AsyncStorage.getItem(INSIDE_KEY);
    ids = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    ids = new Set();
  }
  change(ids);
  await AsyncStorage.setItem(INSIDE_KEY, JSON.stringify([...ids]));
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/* ---------------------------------------------------------------- setup */

/** What the over-other-apps arrival card shows for a reminder. */
export function arrivalOverlayContent(r: Reminder, dark?: boolean): OverlayContent {
  return {
    id: r.id,
    title: r.title.trim() || 'Reminder nearby',
    subtitle: r.location?.label
      ? `You're near ${r.location.label}`
      : "You're near somewhere you set a reminder",
    notes: r.notes.trim(),
    url: `${DEEP_LINK_SCHEME}://reminder/${encodeURIComponent(r.id)}`,
    dark,
  };
}

/** The overlay follows the in-app theme choice (`theme:mode` in `src/lib/theme.tsx`). */
async function overlayDarkMode(): Promise<boolean | undefined> {
  const mode = await AsyncStorage.getItem(THEME_KEY).catch(() => null);
  return mode === 'dark' ? true : mode === 'light' ? false : undefined;
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    // Omit `sound` for the system default — a channel's `sound` is a custom
    // file name, so 'default' would be looked up as a missing file.
    vibrationPattern: [0, 250, 250, 250],
  });
}

/* ------------------------------------------------------------ arrivals queue */

async function readArrivals(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ARRIVALS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function addArrival(id: string) {
  const ids = await readArrivals();
  if (!ids.includes(id)) await AsyncStorage.setItem(ARRIVALS_KEY, JSON.stringify([...ids, id]));
}

/** Reminder ids that fired while the modal couldn't show (e.g. app closed). */
export const pendingArrivals = readArrivals;

export async function clearArrival(id: string) {
  const ids = await readArrivals();
  await AsyncStorage.setItem(ARRIVALS_KEY, JSON.stringify(ids.filter((x) => x !== id)));
}

export type GeofenceState =
  | 'ready'
  | 'needs-location'
  | 'needs-background'
  | 'needs-notifications'
  /** Native side can't do background geofencing (e.g. app not rebuilt yet). */
  | 'unavailable';

export async function geofencePermissionState(): Promise<GeofenceState> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return 'needs-location';
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) return 'needs-background';
    const notif = await Notifications.getPermissionsAsync();
    if (!notif.granted) return 'needs-notifications';
    return 'ready';
  } catch {
    return 'unavailable';
  }
}

/** Walk the permission chain (foreground → background → notifications). */
export async function requestGeofencePermissions(): Promise<GeofenceState> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return 'needs-location';
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return 'needs-background';
    const notif = await Notifications.requestPermissionsAsync();
    if (!notif.granted) return 'needs-notifications';
    await ensureChannel();
    return 'ready';
  } catch (e) {
    console.warn('requestGeofencePermissions failed', e);
    return 'unavailable';
  }
}

/* ------------------------------------------------------------- enable flag */

export async function isGeofencingEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}

export async function setGeofencingEnabled(on: boolean, reminders: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  await syncGeofences(reminders);
}

/**
 * Turn location reminders on once every permission they need is granted —
 * unless the user has already switched them on/off themselves in Settings.
 */
export async function enableGeofencingByDefault(reminders: Reminder[]): Promise<void> {
  if ((await AsyncStorage.getItem(ENABLED_KEY)) != null) return;
  if ((await geofencePermissionState()) !== 'ready') return;
  await ensureChannel();
  await setGeofencingEnabled(true, reminders);
}

/* --------------------------------------------------------------- sync */

async function isStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

async function isWatching(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(WATCH_TASK);
  } catch {
    return false;
  }
}

/**
 * Keep location fixes flowing while the app is closed (Android). Must be
 * started while the app is in the foreground — Android blocks starting a
 * location foreground service from the background.
 */
async function startWatching() {
  if (Platform.OS !== 'android' || (await isWatching())) return;
  try {
    await Location.startLocationUpdatesAsync(WATCH_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 50,
      foregroundService: {
        notificationTitle: 'Location reminders on',
        notificationBody: "You'll get an alert when you're near a reminder.",
        notificationColor: '#F26722',
        killServiceOnDestroy: false,
      },
    });
  } catch (e) {
    console.warn('startLocationUpdatesAsync failed', e);
  }
}

async function stopWatching() {
  if (await isWatching()) {
    await Location.stopLocationUpdatesAsync(WATCH_TASK).catch(() => {});
  }
}

/** Stable fingerprint of a region set — order-independent. */
function signature(regions: Location.LocationRegion[]): string {
  // "v2": regions gained notifyOnExit — forces one re-register on update.
  return (
    'v2|' +
    regions
      .map((r) => `${r.identifier}:${r.latitude},${r.longitude}@${r.radius}`)
      .sort()
      .join('|')
  );
}

/**
 * (Re)register geofences for every located, not-done reminder. Cheap and
 * idempotent — call it whenever reminders or permissions change.
 *
 * `startGeofencingAsync` re-arms every fence from scratch, and both platforms
 * replay an `Enter` transition for any region the device is *already* inside at
 * registration time. This effect runs on every app launch and every reminder
 * edit, so calling it unconditionally spams a notification each time the app is
 * opened near a reminder. To avoid that we fingerprint the region set and only
 * re-register when it actually changed.
 */
export async function syncGeofences(reminders: Reminder[]): Promise<void> {
  const [enabled, state] = await Promise.all([
    isGeofencingEnabled(),
    geofencePermissionState(),
  ]);

  const regions: Location.LocationRegion[] = reminders
    .filter((r) => r.location && !r.done)
    .slice(0, 90) // Android caps at 100 geofences per app
    .map((r) => ({
      identifier: r.id,
      latitude: r.location!.lat,
      longitude: r.location!.lng,
      radius: r.location!.radius ?? DEFAULT_RADIUS,
      notifyOnEnter: true,
      // Exits clear the "inside" mark so the next visit alerts again.
      notifyOnExit: true,
    }));

  // Forget "inside" marks for reminders that are gone, done or unlocated.
  const active = new Set(regions.map((r) => r.identifier));
  await updateInside((ids) => [...ids].forEach((id) => active.has(id) || ids.delete(id)));

  if (!enabled || state !== 'ready' || regions.length === 0) {
    if (await isStarted()) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    }
    await stopWatching();
    await AsyncStorage.removeItem(SIGNATURE_KEY);
    return;
  }

  await startWatching();

  const next = signature(regions);
  const [prev, started] = await Promise.all([
    AsyncStorage.getItem(SIGNATURE_KEY),
    isStarted(),
  ]);
  if (started && prev === next) return;

  try {
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    await AsyncStorage.setItem(SIGNATURE_KEY, next);
  } catch (e) {
    console.warn('startGeofencingAsync failed', e);
  }
}
