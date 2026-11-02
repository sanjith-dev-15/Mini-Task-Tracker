import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type InstalledVersion = { versionCode: number; versionName: string };

type AppUpdaterNative = {
  getVersion(): InstalledVersion;
  canInstallPackages(): boolean;
  openInstallSettings(): void;
  installApk(contentUri: string): void;
};

/** null on iOS / web, or on a build made before this module was added. */
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<AppUpdaterNative>('AppUpdater') : null;

/** True when this build can install updates itself. */
export const updaterSupported = native != null;

export function getInstalledVersion(): InstalledVersion | null {
  try {
    return native?.getVersion() ?? null;
  } catch {
    return null;
  }
}

export function canInstallPackages(): boolean {
  try {
    return native?.canInstallPackages() ?? false;
  } catch {
    return false;
  }
}

export function openInstallSettings(): void {
  native?.openInstallSettings();
}

/** Hands the APK to Android's package installer (the user taps "Install"). */
export function installApk(contentUri: string): void {
  native?.installApk(contentUri);
}
