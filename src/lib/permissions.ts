import type { Ionicons } from '@expo/vector-icons';

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
      'Read only while the app is open, and only when you tap “locate me” or drop a pin. It is never stored or sent anywhere.',
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
    purpose: 'Download map tiles from OpenFreeMap and look up places you search.',
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
    icon: 'bug-outline',
    android: ['SYSTEM_ALERT_WINDOW'],
    purpose: 'Shows the red error overlay while developing.',
    detail: 'Present only in development builds — a release build does not request it.',
    grant: 'dev',
  },
];

export function grantLabel(info: PermissionInfo): string {
  if (info.grant === 'dev') return 'Dev builds only';
  if (info.grant === 'install') return 'Automatic';
  return info.optional ? 'Optional' : 'Asked when needed';
}
