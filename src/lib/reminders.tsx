import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createId } from '@/lib/notes';

const STORAGE_KEY = 'reminders:v1';

export type ReminderLocation = {
  lat: number;
  lng: number;
  /** Optional human-readable label (e.g. from reverse geocoding). */
  label?: string;
  /** Geofence trigger radius in metres (defaults to 500 when unset). */
  radius?: number;
};

export type Reminder = {
  id: string;
  title: string;
  notes: string;
  /** Epoch ms the reminder is due, or null for no date. */
  dueAt: number | null;
  location: ReminderLocation | null;
  done: boolean;
  createdAt: number;
  updatedAt: number;
};

export function emptyReminder(): Reminder {
  const now = Date.now();
  return {
    id: createId(),
    title: '',
    notes: '',
    dueAt: null,
    location: null,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** True when the reminder has nothing worth keeping. */
export function isBlankReminder(r: Reminder): boolean {
  return !r.title.trim() && !r.notes.trim() && !r.location;
}

type ReminderPatch = Partial<Omit<Reminder, 'id' | 'createdAt'>>;

type RemindersContextValue = {
  reminders: Reminder[];
  loading: boolean;
  getReminder: (id: string) => Reminder | undefined;
  createReminder: (patch?: ReminderPatch) => Reminder;
  updateReminder: (id: string, patch: ReminderPatch) => void;
  deleteReminder: (id: string) => void;
  toggleDone: (id: string) => void;
};

const RemindersContext = createContext<RemindersContextValue | null>(null);

/** not-done first, then soonest due (no date last), then most recently touched. */
function compareReminders(a: Reminder, b: Reminder): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt == null) return 1;
    if (b.dueAt == null) return -1;
    return a.dueAt - b.dueAt;
  }
  return b.updatedAt - a.updatedAt;
}

export function RemindersProvider({ children }: { children: ReactNode }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Reminder[];
          if (Array.isArray(parsed)) setReminders(parsed);
        }
      } catch (e) {
        console.warn('Failed to load reminders', e);
      } finally {
        hydrated.current = true;
        setLoading(false);
      }
    })();
  }, []);

  // Persist whenever reminders change (after the initial hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders)).catch((e) =>
      console.warn('Failed to save reminders', e),
    );
  }, [reminders]);

  const getReminder = useCallback(
    (id: string) => reminders.find((r) => r.id === id),
    [reminders],
  );

  const createReminder = useCallback<RemindersContextValue['createReminder']>((patch) => {
    const reminder: Reminder = { ...emptyReminder(), ...patch };
    setReminders((prev) => [reminder, ...prev]);
    return reminder;
  }, []);

  const updateReminder = useCallback<RemindersContextValue['updateReminder']>((id, patch) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r)),
    );
  }, []);

  const deleteReminder = useCallback((id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleDone = useCallback((id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, done: !r.done, updatedAt: Date.now() } : r)),
    );
  }, []);

  const sorted = useMemo(() => [...reminders].sort(compareReminders), [reminders]);

  const value = useMemo<RemindersContextValue>(
    () => ({
      reminders: sorted,
      loading,
      getReminder,
      createReminder,
      updateReminder,
      deleteReminder,
      toggleDone,
    }),
    [sorted, loading, getReminder, createReminder, updateReminder, deleteReminder, toggleDone],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used within a RemindersProvider');
  return ctx;
}
