import { requireOptionalNativeModule, type NativeModule } from 'expo';
import { Platform } from 'react-native';

type Events = {
  onDone: (event: { id: string }) => void;
};

declare class ReminderOverlayNative extends NativeModule<Events> {
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
  show(
    id: string,
    title: string,
    subtitle: string,
    notes: string,
    url: string,
    dark: boolean | null,
  ): boolean;
  hide(id: string): void;
  takeDone(): string[];
  startAlarm(): void;
  stopAlarm(force: boolean): void;
  startWatch?(targetsJson: string): boolean;
  stopWatch?(): void;
  testArrival?(
    id: string,
    title: string,
    subtitle: string,
    notes: string,
    url: string,
    dark: boolean | null,
    delayMs: number,
  ): void;
}

/** null on iOS / web, or on a build made before this module was added. */
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<ReminderOverlayNative>('ReminderOverlay') : null;

/** True when this build can draw the arrival card over other apps. */
export const overlaySupported = native != null;

export function canDrawOverlays(): boolean {
  try {
    return native?.canDrawOverlays() ?? false;
  } catch {
    return false;
  }
}

export function openOverlaySettings() {
  native?.openOverlaySettings();
}

export function isIgnoringBatteryOptimizations(): boolean {
  try {
    return native?.isIgnoringBatteryOptimizations() ?? false;
  } catch {
    return false;
  }
}

export function requestIgnoreBatteryOptimizations() {
  native?.requestIgnoreBatteryOptimizations();
}

export type OverlayContent = {
  id: string;
  title: string;
  subtitle: string;
  notes: string;
  /** Deep link for the "Open" button. */
  url: string;
  /** Omit to follow the system dark-mode setting. */
  dark?: boolean;
};

/** Show the arrival card over other apps. Returns false if it couldn't. */
export function showOverlay(c: OverlayContent): boolean {
  try {
    return native?.show(c.id, c.title, c.subtitle, c.notes, c.url, c.dark ?? null) ?? false;
  } catch {
    return false;
  }
}

export function hideOverlay(id: string) {
  native?.hide(id);
}

/**
 * Ring (alarm sound on loop) and vibrate until stopped or 2 minutes pass.
 * The overlay card starts this itself; call it for arrivals without a card.
 */
export function startAlarm() {
  try {
    native?.startAlarm();
  } catch {
    // old build
  }
}

/** Silence the alarm. Without `force`, it keeps ringing while an overlay card is up. */
export function stopAlarm(force = false) {
  try {
    native?.stopAlarm(force);
  } catch {
    // old build
  }
}

/** This build checks arrivals natively (works with the screen off). */
export const arrivalWatchSupported = typeof native?.startWatch === 'function';

export type WatchTarget = OverlayContent & { lat: number; lng: number; radius: number };

/**
 * Hand the located reminders to the native watcher: a foreground service that
 * checks each location fix itself and rings, wakes the screen and shows the
 * card over the lock screen on arrival. An empty list stops it.
 */
export function startArrivalWatch(targets: WatchTarget[]): boolean {
  try {
    return native?.startWatch?.(JSON.stringify(targets)) ?? false;
  } catch {
    return false;
  }
}

/** Fake a native arrival after `delayMs` (lock the phone meanwhile to test the screen-off alert). */
export function testArrival(c: OverlayContent, delayMs: number): boolean {
  if (!native?.testArrival) return false;
  try {
    native.testArrival(c.id, c.title, c.subtitle, c.notes, c.url, c.dark ?? null, delayMs);
    return true;
  } catch {
    return false;
  }
}

export function stopArrivalWatch() {
  try {
    native?.stopWatch?.();
  } catch {
    // old build
  }
}

/** Reminder ids the user marked done from the overlay; clears the list. */
export function takeOverlayDone(): string[] {
  try {
    return native?.takeDone() ?? [];
  } catch {
    return [];
  }
}

export function addOverlayDoneListener(fn: (id: string) => void): { remove(): void } {
  const sub = native?.addListener('onDone', (e) => fn(e.id));
  return { remove: () => sub?.remove() };
}
