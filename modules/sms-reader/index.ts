import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export type InboxSms = {
  id: string;
  /** Sender, e.g. `VM-HDFCBK`. */
  address: string;
  body: string;
  /** Received time, epoch ms. */
  date: number;
};

type SmsReaderNative = {
  hasPermission(): boolean;
  readInbox(sinceMs: number, limit: number): Promise<InboxSms[]>;
};

/** null on iOS / web, or on a build made before this module was added. */
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<SmsReaderNative>('SmsReader') : null;

/** True when this build can read the SMS inbox. */
export const smsSupported = native != null;

export function hasSmsPermission(): boolean {
  try {
    return native?.hasPermission() ?? false;
  } catch {
    return false;
  }
}

/** 'granted' | 'denied' | 'blocked' (denied with "don't ask again" — needs app settings). */
export async function requestSmsPermission(): Promise<'granted' | 'denied' | 'blocked'> {
  if (!native) return 'denied';
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

export async function readInbox(sinceMs: number, limit = 2000): Promise<InboxSms[]> {
  if (!native) return [];
  return native.readInbox(sinceMs, limit);
}
