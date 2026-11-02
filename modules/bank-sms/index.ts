import { requireOptionalNativeModule, type NativeModule } from 'expo';
import { Platform } from 'react-native';

type Events = {
  onChange: (event: Record<string, never>) => void;
};

export type InboxSms = {
  /** Sender — "AD-HDFCBK", "VM-SBIUPI", or a phone number. */
  address: string;
  body: string;
  /** Received time, epoch ms. */
  date: number;
};

declare class BankSmsNative extends NativeModule<Events> {
  hasPermission(): boolean;
  readInbox(sinceMs: number, limit: number): Promise<InboxSms[]>;
}

/** null on iOS / web, or on a build made before this module was added. */
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<BankSmsNative>('BankSms') : null;

/** True when this build can read the SMS inbox. */
export const smsInboxSupported = native != null;

export function hasSmsPermission(): boolean {
  try {
    return native?.hasPermission() ?? false;
  } catch {
    return false;
  }
}

/** Inbox SMS received after `sinceMs`, oldest first. Empty without permission. */
export async function readInbox(sinceMs: number, limit = 500): Promise<InboxSms[]> {
  try {
    return (await native?.readInbox(sinceMs, limit)) ?? [];
  } catch {
    return [];
  }
}

/** Fires when a new SMS lands. Start listening only after READ_SMS is granted. */
export function addSmsChangeListener(fn: () => void): { remove(): void } {
  const sub = native?.addListener('onChange', () => fn());
  return { remove: () => sub?.remove() };
}
