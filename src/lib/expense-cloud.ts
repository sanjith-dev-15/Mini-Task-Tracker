import { getApp } from '@react-native-firebase/app';
import { doc, getDoc, getFirestore, setDoc } from '@react-native-firebase/firestore';

import type { Expense } from '@/lib/expenses';

/**
 * Cloud mirror of the expense store — one document per signed-in user. Kept
 * intentionally simple (whole-document read/write, no realtime listener):
 * pull once on sign-in and merge, then push on every local change. Good
 * enough for cross-device backup/restore; not a live multi-device sync.
 */
export type ExpenseCloudDoc = {
  expenses: Expense[];
  income: Record<string, number>;
  savedAt: number;
};

function expenseDocRef(uid: string) {
  return doc(getFirestore(getApp()), 'users', uid, 'expenseData', 'main');
}

export async function pullExpenseCloud(uid: string): Promise<ExpenseCloudDoc | null> {
  const snap = await getDoc(expenseDocRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<ExpenseCloudDoc> | undefined;
  if (!data) return null;
  return {
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    income: data.income && typeof data.income === 'object' ? data.income : {},
    savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
  };
}

export async function pushExpenseCloud(
  uid: string,
  data: { expenses: Expense[]; income: Record<string, number> },
): Promise<void> {
  await setDoc(expenseDocRef(uid), { ...data, savedAt: Date.now() });
}

/** Union by id; the newer `updatedAt` wins when both sides have an entry. */
export function mergeExpenses(local: Expense[], remote: Expense[]): Expense[] {
  const byId = new Map<string, Expense>();
  for (const e of remote) byId.set(e.id, e);
  for (const e of local) {
    const existing = byId.get(e.id);
    if (!existing || e.updatedAt >= existing.updatedAt) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/** Shallow-merge income-by-month maps; local wins on a shared key. */
export function mergeIncome(
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  return { ...remote, ...local };
}
