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
import type { CategoryKey } from '@/lib/expense-categories';

const STORAGE_KEY = 'expenses:v1';
/** `YYYY-MM` → income set for that month (rupees). */
const INCOME_KEY = 'expenses:income:v1';

export type Expense = {
  id: string;
  /** Amount in rupees (may have a fractional part). */
  amount: number;
  title: string;
  category: CategoryKey;
  /** Epoch ms of the day the money was spent. */
  spentAt: number;
  createdAt: number;
  updatedAt: number;
};

export function emptyExpense(): Expense {
  const now = Date.now();
  return {
    id: createId(),
    amount: 0,
    title: '',
    category: 'food',
    spentAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

type ExpensePatch = Partial<Omit<Expense, 'id' | 'createdAt'>>;

/** `YYYY-MM` key for the month a timestamp falls in. */
export function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type ExpensesContextValue = {
  /** Newest spend first. */
  expenses: Expense[];
  loading: boolean;
  getExpense: (id: string) => Expense | undefined;
  addExpense: (patch?: ExpensePatch) => Expense;
  updateExpense: (id: string, patch: ExpensePatch) => void;
  deleteExpense: (id: string) => void;
  /** `YYYY-MM` → income the user recorded for that month. */
  income: Record<string, number>;
  /** Set (or clear, when `amount <= 0`) the income for a month. Defaults to now. */
  setMonthlyIncome: (amount: number, ref?: number) => void;
};

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawExpenses, rawIncome] = await AsyncStorage.multiGet([STORAGE_KEY, INCOME_KEY]);
        const parsed = rawExpenses[1] ? (JSON.parse(rawExpenses[1]) as Expense[]) : null;
        if (Array.isArray(parsed)) setExpenses(parsed);
        const parsedIncome = rawIncome[1] ? (JSON.parse(rawIncome[1]) as Record<string, number>) : null;
        if (parsedIncome && typeof parsedIncome === 'object') setIncome(parsedIncome);
      } catch (e) {
        console.warn('Failed to load expenses', e);
      } finally {
        hydrated.current = true;
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(expenses)).catch((e) =>
      console.warn('Failed to save expenses', e),
    );
  }, [expenses]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(INCOME_KEY, JSON.stringify(income)).catch((e) =>
      console.warn('Failed to save income', e),
    );
  }, [income]);

  const getExpense = useCallback(
    (id: string) => expenses.find((e) => e.id === id),
    [expenses],
  );

  const addExpense = useCallback<ExpensesContextValue['addExpense']>((patch) => {
    const expense: Expense = { ...emptyExpense(), ...patch };
    setExpenses((prev) => [expense, ...prev]);
    return expense;
  }, []);

  const updateExpense = useCallback<ExpensesContextValue['updateExpense']>((id, patch) => {
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)),
    );
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const setMonthlyIncome = useCallback<ExpensesContextValue['setMonthlyIncome']>(
    (amount, ref = Date.now()) => {
      const k = monthKey(ref);
      setIncome((prev) => {
        const next = { ...prev };
        if (amount > 0) next[k] = amount;
        else delete next[k];
        return next;
      });
    },
    [],
  );

  const sorted = useMemo(
    () => [...expenses].sort((a, b) => b.spentAt - a.spentAt || b.createdAt - a.createdAt),
    [expenses],
  );

  const value = useMemo<ExpensesContextValue>(
    () => ({
      expenses: sorted,
      loading,
      getExpense,
      addExpense,
      updateExpense,
      deleteExpense,
      income,
      setMonthlyIncome,
    }),
    [sorted, loading, getExpense, addExpense, updateExpense, deleteExpense, income, setMonthlyIncome],
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses() {
  const ctx = useContext(ExpensesContext);
  if (!ctx) throw new Error('useExpenses must be used within an ExpensesProvider');
  return ctx;
}

/* ------------------------------------------------------------------ helpers */

/** `₹1,23,456.78` — manual Indian digit grouping (Hermes has no Intl NumberFormat). */
export function formatMoney(n: number, { sign = false } = {}): string {
  const negative = n < 0;
  const [intPart, fracPart] = Math.abs(n).toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
    : last3;
  const frac = fracPart === '00' ? '' : '.' + fracPart;
  const prefix = negative ? '−' : sign ? '+' : '';
  return `${prefix}₹${grouped}${frac}`;
}

export function isSameMonth(ts: number, ref: number = Date.now()): boolean {
  const a = new Date(ts);
  const b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Spend entries dated within the current calendar month. */
export function thisMonth(list: Expense[]): Expense[] {
  return list.filter((e) => isSameMonth(e.spentAt));
}

/** Spend entries dated within the previous calendar month. */
export function lastMonth(list: Expense[]): Expense[] {
  const ref = new Date();
  ref.setDate(1);
  ref.setMonth(ref.getMonth() - 1);
  return list.filter((e) => isSameMonth(e.spentAt, ref.getTime()));
}

export function currentMonthName(): string {
  return new Date().toLocaleDateString('en-GB', { month: 'long' });
}

/** Day-of-month today — i.e. how many days the current month total spans. */
export function daysElapsedThisMonth(): number {
  return new Date().getDate();
}

export function sumAmount(list: Expense[]): number {
  return list.reduce((acc, e) => acc + e.amount, 0);
}

/** Midnight (local) of the given day, as epoch ms. Defaults to today. */
export function startOfDay(d: number | Date = Date.now()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Stable per-day key (midnight ms as string). */
export function dayKey(ts: number): string {
  return String(startOfDay(ts));
}

/** `dayKey → total spent that day` — for the calendar's intensity dots. */
export function spendByDay(list: Expense[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of list) {
    const k = dayKey(e.spentAt);
    m.set(k, (m.get(k) ?? 0) + e.amount);
  }
  return m;
}

/** "Sat, 30 Aug" / "Sat, 30 Aug 2027" — a full day label for a picked date. */
export function fullDayLabel(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export type CategoryTotal = { key: CategoryKey; total: number };

/** Per-category totals, biggest first, zero-spend categories dropped. */
export function totalsByCategory(list: Expense[]): CategoryTotal[] {
  const map = new Map<CategoryKey, number>();
  for (const e of list) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  return [...map.entries()]
    .map(([key, total]) => ({ key, total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type DayGroup = { key: string; label: string; total: number; items: Expense[] };

const DAY_MS = 86_400_000;

function dayLabel(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Group a spend list (already newest-first) into day sections. */
export function groupByDay(list: Expense[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of list) {
    const d = new Date(e.spentAt);
    d.setHours(0, 0, 0, 0);
    const key = String(d.getTime());
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(e);
      last.total += e.amount;
    } else {
      groups.push({ key, label: dayLabel(e.spentAt), total: e.amount, items: [e] });
    }
  }
  return groups;
}
