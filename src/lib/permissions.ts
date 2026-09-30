import type { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  canDrawOverlays,
  isIgnoringBatteryOptimizations,
  openOverlaySettings,
  overlaySupported,
  requestIgnoreBatteryOptimizations,
} from '../../modules/reminder-overlay';

/** How the OS grants a permission. */
export type GrantKind = 'runtime' | 'install' | 'dev';

export type PermissionInfo = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Bare Android permission names this entry covers. */
  android: string[];
  /** One line: what the app does with it. */
  purpose: string;
  /** Extra reassurance / caveats. */
  detail: string;
  grant: GrantKind;
  /** The app works fully without it. */
  optional?: boolean;
};

/**
 * Everything the app declares in its Android manifest, in plain language.
 * Keep in sync with `android/app/src/main/AndroidManifest.xml`.
 */
export const PERMISSIONS: PermissionInfo[] = [
  {
    key: 'location',
    title: 'Location',
    icon: 'location-outline',
    android: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    purpose: 'Centre the map on where you are and pin a reminder to a place.',
    detail:
      'Read only while the app is open, and only when you tap “locate me” or drop a pin. Your position is never stored. To show you the address of a spot you pin, that spot’s coordinate is sent to an address lookup — nothing else about you goes with it.',
    grant: 'runtime',
    optional: true,
  },
  {
    key: 'background-location',
    title: 'Background location',
    icon: 'navigate-outline',
    android: ['ACCESS_BACKGROUND_LOCATION'],
    purpose: 'Notify you when you arrive near a reminder you pinned to a place.',
    detail:
      'Only used for location reminders, and only if you turn them on below. Uses low-power geofencing — no continuous GPS. Requires the "Allow all the time" setting. Your location is never stored or sent anywhere.',
    grant: 'runtime',
    optional: true,
  },
  {
    key: 'notifications',
    title: 'Notifications',
    icon: 'notifications-outline',
    android: ['POST_NOTIFICATIONS'],
    purpose: 'Show the alert when you reach a located reminder.',
    detail: 'The only notifications this app sends. Nothing else is pushed to you.',
    grant: 'runtime',
    optional: true,
  },
  {
    key: 'network',
    title: 'Network access',
    icon: 'wifi-outline',
    android: ['INTERNET', 'ACCESS_NETWORK_STATE'],
    purpose:
      'Download map tiles from OpenFreeMap, and turn the places you search or pin into an address.',
    detail:
      'Your notes, reminders, expenses and tasks live only on this device — there is no account, no server and no sync.',
    grant: 'install',
  },
  {
    key: 'vibrate',
    title: 'Vibration',
    icon: 'phone-portrait-outline',
    android: ['VIBRATE'],
    purpose: 'Short haptic feedback on a few actions.',
    detail: 'Granted automatically at install; it cannot access any of your data.',
    grant: 'install',
  },
  {
    key: 'storage',
    title: 'Media storage (legacy)',
    icon: 'folder-outline',
    android: ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
    purpose: 'Declared by the image library for old Android versions.',
    detail:
      'Applies only to Android 12 (API 32) and below, and no screen in the app actually uses it.',
    grant: 'install',
  },
  {
    key: 'overlay',
    title: 'Display over other apps',
    icon: 'albums-outline',
    android: ['SYSTEM_ALERT_WINDOW'],
    purpose: 'Pop the reminder card up on screen when you arrive, even while you’re in another app.',
    detail:
      'Only used for the arrival card of a location reminder. Without it you just get the notification, and the card shows the next time you open the app.',
    grant: 'runtime',
  },
  {
    key: 'battery',
    title: 'Unrestricted battery',
    icon: 'battery-charging-outline',
    android: ['REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'],
    purpose: 'Keep location reminders firing while the app is closed.',
    detail:
      'Battery optimisation can stop the app from hearing that you arrived. Geofencing is low-power, so this costs very little battery.',
    grant: 'runtime',
  },
];

/* ------------------------------------------------ runtime permission status */

export type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type PermResult = { status: PermStatus; canAsk: boolean };

/** Keys in `PERMISSIONS` that map to a runtime permission we can drive. */
export const RUNTIME_KEYS = [
  'location',
  'background-location',
  'notifications',
  'overlay',
  'battery',
] as const;
export type RuntimeKey = (typeof RUNTIME_KEYS)[number];

/** Android-only special permissions granted from a system settings screen. */
const SETTINGS_SCREEN_KEYS: readonly string[] = ['overlay', 'battery'];

/** Granted on a system settings screen rather than via an in-app dialog. */
export function isSettingsScreenPermission(key: string): boolean {
  return SETTINGS_SCREEN_KEYS.includes(key);
}

function toResult(granted: boolean, canAskAgain: boolean | undefined): PermResult {
  const canAsk = canAskAgain ?? true;
  return { status: granted ? 'granted' : canAsk ? 'undetermined' : 'denied', canAsk };
}

export async function readPermission(key: string): Promise<PermResult> {
  try {
    if (key === 'location') {
      const r = await Location.getForegroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'background-location') {
      const r = await Location.getBackgroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'notifications') {
      const r = await Notifications.getPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (isSettingsScreenPermission(key)) {
      if (!overlaySupported) return { status: 'unavailable', canAsk: false };
      const granted = key === 'overlay' ? canDrawOverlays() : isIgnoringBatteryOptimizations();
      return toResult(granted, true);
    }
  } catch {
    /* native module or manifest entry missing */
  }
  return { status: 'unavailable', canAsk: false };
}

/**
 * Ask for a permission. For the settings-screen ones this only opens the
 * system page — re-read the status when the app comes back to the foreground.
 */
export async function askPermission(key: string): Promise<PermResult> {
  try {
    if (key === 'location') {
      const r = await Location.requestForegroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'background-location') {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!fg.granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) return toResult(false, asked.canAskAgain);
      }
      const r = await Location.requestBackgroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'notifications') {
      const r = await Notifications.requestPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'overlay') {
      openOverlaySettings();
      return readPermission(key);
    }
    if (key === 'battery') {
      requestIgnoreBatteryOptimizations();
      return readPermission(key);
    }
  } catch {
    /* native module or manifest entry missing */
  }
  return { status: 'unavailable', canAsk: false };
}

/** Runtime permissions that apply on this platform / build. */
export function applicableRuntimeKeys(): RuntimeKey[] {
  return RUNTIME_KEYS.filter(
    (k) => Platform.OS === 'android' || !isSettingsScreenPermission(k),
  );
}

export function grantLabel(info: PermissionInfo): string {
  if (info.grant === 'dev') return 'Dev builds only';
  if (info.grant === 'install') return 'Automatic';
  return info.optional ? 'Optional' : 'Asked when needed';
}
