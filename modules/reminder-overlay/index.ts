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
