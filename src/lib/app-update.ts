/**
 * In-app updates for the sideloaded Android APK.
 *
 * CI (`.github/workflows/android-release.yml`) publishes every build from `main`
 * to the rolling GitHub release `android-latest`, alongside a `version.json`:
 *
 *   { "versionCode": 16, "versionName": "1.0.0", "apk": "Goku-v1.0.0-build16.apk",
 *     "notes": ["Auto-import bank debits", ...], "publishedAt": "..." }
 *
 * The app compares `versionCode` with its own, downloads the APK with progress,
 * and hands it to Android's installer. Same-key signing is what lets it install
 * over the current app; Android always asks the user to tap "Install".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  canInstallPackages,
  getInstalledVersion,
  installApk,
  openInstallSettings,
  updaterSupported,
} from '../../modules/app-updater';

const RELEASE_BASE =
  'https://github.com/sanjith-dev-15/Mini-Task-Tracker/releases/download/android-latest';
const DISMISS_KEY = 'app-update:dismissed:v1';
/** "Later" hides the prompt for that build this long. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

export type UpdateInfo = {
  versionCode: number;
  versionName: string;
  url: string;
  notes: string[];
  /** The installed build, for display. */
  current: number;
};

export { canInstallPackages, openInstallSettings, updaterSupported };

/** The newer build on GitHub, or null when up to date / offline / unsupported. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const installed = getInstalledVersion();
  if (!updaterSupported || !installed) return null;
  const res = await fetch(`${RELEASE_BASE}/version.json?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return null;
  const m = (await res.json()) as {
    versionCode?: number;
    versionName?: string;
    apk?: string;
    notes?: unknown;
  };
  if (typeof m.versionCode !== 'number' || !m.apk) return null;
  if (m.versionCode <= installed.versionCode) return null;
  return {
    versionCode: m.versionCode,
    versionName: m.versionName ?? '',
    url: `${RELEASE_BASE}/${encodeURIComponent(m.apk)}`,
    notes: Array.isArray(m.notes) ? m.notes.filter((n) => typeof n === 'string').slice(0, 12) : [],
    current: installed.versionCode,
  };
}

/** Whether the automatic prompt should stay hidden for this build ("Later"). */
export async function isSnoozed(versionCode: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as { versionCode: number; at: number };
    return s.versionCode === versionCode && Date.now() - s.at < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snooze(versionCode: number): Promise<void> {
  return AsyncStorage.setItem(DISMISS_KEY, JSON.stringify({ versionCode, at: Date.now() }));
}

export type Download = {
  /** Resolves to the APK's content:// URI; rejects on failure. Null when cancelled. */
  done: Promise<string | null>;
  cancel(): void;
};

/** Downloads the APK into the cache, reporting progress as 0…1. */
export function downloadUpdate(info: UpdateInfo, onProgress: (p: number) => void): Download {
  const dir = `${FileSystem.cacheDirectory}updates/`;
  const target = `${dir}goku-${info.versionCode}.apk`;
  let cancelled = false;
  let task: FileSystem.DownloadResumable | null = null;

  const done = (async () => {
    // Clear out older downloads so the cache doesn't fill with 60 MB APKs.
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    if (cancelled) return null;
    task = FileSystem.createDownloadResumable(info.url, target, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });
    let result: FileSystem.FileSystemDownloadResult | undefined;
    try {
      result = await task.downloadAsync();
    } catch (e) {
      if (cancelled) return null;
      throw e;
    }
    if (cancelled || !result) return null;
    if (result.status !== 200) throw new Error(`Download failed (HTTP ${result.status})`);
    onProgress(1);
    return FileSystem.getContentUriAsync(result.uri);
  })();

  return {
    done,
    cancel() {
      cancelled = true;
      task?.cancelAsync().catch(() => {});
    },
  };
}

/** Opens the system installer. Returns false when "Install unknown apps" is off. */
export function install(contentUri: string): boolean {
  if (!canInstallPackages()) return false;
  installApk(contentUri);
  return true;
}
