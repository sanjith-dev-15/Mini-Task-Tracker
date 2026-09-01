import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { Reminder } from '@/lib/reminders';

/**
 * Location reminders (geofencing).
 *
 * We register one geofence per located, not-done reminder. When the device
 * enters one — even with the app closed — the background task below reads the
 * reminders straight from AsyncStorage (it can't touch React state) and posts a
 * local notification.
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

/** Radius options offered in the reminder editor (metres). */
export const RADIUS_OPTIONS = [200, 500, 1000] as const;
export const DEFAULT_RADIUS = 500;

export function radiusLabel(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

/* ----------------------------------------------------------- background task */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    const reminders: Reminder[] = raw ? JSON.parse(raw) : [];
    const match = reminders.find((r) => r.id === region.identifier && !r.done);
    if (!match) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: match.title.trim() || 'Reminder nearby',
        body: match.location?.label
          ? `You're near ${match.location.label}`
          : "You're near somewhere you set a reminder",
        data: { reminderId: match.id },
      },
      trigger: null,
    });
  } catch {
    // A background task must never throw.
  }
});

/* ---------------------------------------------------------------- setup */

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
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

/* --------------------------------------------------------------- sync */

async function isStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

/** Stable fingerprint of a region set — order-independent. */
function signature(regions: Location.LocationRegion[]): string {
  return regions
    .map((r) => `${r.identifier}:${r.latitude},${r.longitude}@${r.radius}`)
    .sort()
    .join('|');
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
      notifyOnExit: false,
    }));

  if (!enabled || state !== 'ready' || regions.length === 0) {
    if (await isStarted()) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    }
    await AsyncStorage.removeItem(SIGNATURE_KEY);
    return;
  }

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
