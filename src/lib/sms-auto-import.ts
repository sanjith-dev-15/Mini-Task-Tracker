import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid } from 'react-native';

import { parseBankSms, type BankTxn } from '@/lib/bank-sms';
import { startOfDay, useExpenses } from '@/lib/expenses';

import {
  addSmsChangeListener,
  hasSmsPermission,
  readInbox,
  smsInboxSupported,
} from '../../modules/bank-sms';

/**
 * Expenses ▸ auto-import: with READ_SMS granted, bank debit alerts in the inbox
 * become expenses without the user sharing them. Scans forward from a cursor
 * (the newest SMS already looked at) on launch, on returning to the app and
 * whenever a new SMS lands. Parsing is `@/lib/bank-sms`, all on the device.
 * Credits are left to the manual importer — refunds and self-transfers would
 * inflate "Money I have".
 */
const STATE_KEY = 'expenses:sms-auto:v1';

export type AutoImportState = {
  enabled: boolean;
  /** Received time (ms) of the newest SMS already scanned. */
  since: number;
  /** When the last scan finished, and how many expenses it added. */
  lastRun?: number;
  lastAdded?: number;
};

const OFF: AutoImportState = { enabled: false, since: 0 };

export { smsInboxSupported };

export async function loadAutoImport(): Promise<AutoImportState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<AutoImportState>) : null;
    if (!s || typeof s !== 'object') return OFF;
    return {
      enabled: s.enabled === true,
      since: typeof s.since === 'number' ? s.since : 0,
      lastRun: s.lastRun,
      lastAdded: s.lastAdded,
    };
  } catch {
    return OFF;
  }
}

async function saveAutoImport(s: AutoImportState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));
  listeners.forEach((fn) => fn(s));
}

const listeners = new Set<(s: AutoImportState) => void>();

export function subscribeAutoImport(fn: (s: AutoImportState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type EnableResult = 'on' | 'off' | 'denied' | 'blocked' | 'unavailable';

/**
 * Turn auto-import on (asks for READ_SMS) or off. The first time it's turned
 * on, this month's bank SMS are picked up too; `from` rewinds further.
 */
export async function setAutoImport(enabled: boolean, from?: number): Promise<EnableResult> {
  const cur = await loadAutoImport();
  if (!enabled) {
    await saveAutoImport({ ...cur, enabled: false });
    return 'off';
  }
  if (!smsInboxSupported) return 'unavailable';
  if (!hasSmsPermission()) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'Read bank SMS',
      message:
        'Goku reads your bank alert messages on this phone to add debits to Expenses. Messages never leave your device.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
  }
  const latest = await loadAutoImport();
  const start = from ?? (latest.since > 0 ? latest.since : rangeStart('month'));
  await saveAutoImport({
    ...latest,
    enabled: true,
    since: latest.since > 0 ? Math.min(latest.since, start) : start,
    ...(from != null && { lastRun: undefined }),
  });
  return 'on';
}

export type ImportRange = 'week' | 'month' | 'last-month';

export const IMPORT_RANGES: { key: ImportRange; label: string }[] = [
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Since last month' },
];

function rangeStart(range: ImportRange): number {
  const d = new Date();
  if (range === 'week') d.setDate(d.getDate() - 6);
  else if (range === 'month') d.setDate(1);
  else d.setMonth(d.getMonth() - 1, 1);
  return startOfDay(d);
}

const scanRequests = new Set<() => void>();

/**
 * Re-reads the inbox from the start of `range` (turning auto-import on, which
 * may ask for READ_SMS). Debits already in Expenses are skipped.
 */
export async function importRange(range: ImportRange): Promise<EnableResult> {
  const r = await setAutoImport(true, rangeStart(range));
  if (r === 'on') scanRequests.forEach((fn) => fn());
  return r;
}

const BATCH = 500;
/** Two alerts for the same amount this close together are one payment (bank + UPI app). */
const TWIN_MS = 10 * 60_000;

/** Businesses send from letter IDs ("AD-HDFCBK"); a plain number is a person. */
const isBusinessSender = (address: string) => /[a-z]/i.test(address);

/** Bank debits received after `since` that aren't in `known` yet. */
async function scanInbox(
  since: number,
  known: Set<string>,
): Promise<{ txns: BankTxn[]; newest: number; more: boolean }> {
  const msgs = await readInbox(since, BATCH);
  const txns: BankTxn[] = [];
  const at: number[] = [];
  let newest = since;
  for (const m of msgs) {
    newest = Math.max(newest, m.date);
    if (!isBusinessSender(m.address)) continue;
    const t = parseBankSms(m.body, m.date);
    if (!t || t.kind !== 'debit' || known.has(t.key)) continue;
    const twin = txns.findIndex(
      (o, i) => o.amount === t.amount && Math.abs(at[i] - m.date) < TWIN_MS,
    );
    if (twin >= 0) continue;
    txns.push(t);
    at.push(m.date);
  }
  return { txns, newest, more: msgs.length >= BATCH };
}

/**
 * Runs the auto-import while the app is alive. Mount once, inside
 * `ExpensesProvider`. Returns the current on/off state for convenience.
 */
export function useBankSmsAutoImport(): boolean {
  const { expenses, loading, addExpense } = useExpenses();
  const [enabled, setEnabled] = useState(false);

  // SMS keys already in Expenses (imported by hand or by an earlier scan).
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    known.current = new Set(expenses.map((e) => e.smsKey).filter((k): k is string => !!k));
  }, [expenses]);

  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    let added = 0;
    try {
      do {
        again.current = false;
        const state = await loadAutoImport();
        if (!state.enabled || !hasSmsPermission()) return;
        const { txns, newest, more } = await scanInbox(state.since, known.current);
        for (const t of txns) {
          addExpense({
            amount: t.amount,
            title: t.title,
            category: t.category,
            spentAt: startOfDay(t.date),
            smsKey: t.key,
          });
          known.current.add(t.key);
        }
        added += txns.length;
        const latest = await loadAutoImport();
        // Rewound by importRange() mid-scan → keep the earlier start and go again.
        const rewound = latest.since < state.since;
        if (rewound) again.current = true;
        await saveAutoImport({
          ...latest,
          since: rewound ? latest.since : Math.max(latest.since, newest),
          lastRun: Date.now(),
          lastAdded: added,
        });
        if (more) again.current = true;
      } while (again.current);
    } catch (e) {
      console.warn('Bank SMS auto-import failed', e);
    } finally {
      running.current = false;
    }
  }, [addExpense]);

  useEffect(() => {
    loadAutoImport().then((s) => setEnabled(s.enabled));
    return subscribeAutoImport((s) => setEnabled(s.enabled));
  }, []);

  // Wait for stored expenses so `known` is filled before the first scan.
  useEffect(() => {
    if (loading || !enabled) return;
    run();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    // The SMS store changes several times per message (and on read / delete).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sms = addSmsChangeListener(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 1500);
    });
    scanRequests.add(run);
    return () => {
      scanRequests.delete(run);
      app.remove();
      sms.remove();
      if (timer) clearTimeout(timer);
    };
  }, [loading, enabled, run]);

  return enabled;
}
