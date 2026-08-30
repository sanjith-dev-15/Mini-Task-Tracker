/** Date helpers for reminders: quick "due" chips + human-readable formatting. */

const DAY = 86_400_000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 9am on the given day offset from today. */
function atMorning(dayOffset: number): number {
  const d = startOfToday();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export type DueChip = { key: string; label: string; resolve: () => number | null };

export const DUE_CHIPS: DueChip[] = [
  { key: 'today', label: 'Today', resolve: () => atMorning(0) },
  { key: 'tomorrow', label: 'Tomorrow', resolve: () => atMorning(1) },
  {
    key: 'weekend',
    label: 'This weekend',
    resolve: () => {
      const today = startOfToday();
      const dow = today.getDay(); // 0 Sun … 6 Sat
      const daysUntilSat = (6 - dow + 7) % 7;
      return atMorning(daysUntilSat === 0 ? 0 : daysUntilSat);
    },
  },
  { key: 'week', label: '+1 week', resolve: () => atMorning(7) },
  { key: 'none', label: 'None', resolve: () => null },
];

/** Which chip (if any) a timestamp currently corresponds to. */
export function activeChipKey(dueAt: number | null): string {
  if (dueAt == null) return 'none';
  for (const chip of DUE_CHIPS) {
    if (chip.key !== 'none' && chip.resolve() === dueAt) return chip.key;
  }
  return '';
}

/** "Today" / "Tomorrow" / "Mon" / "3 Sep" / "3 Sep 2027". */
export function formatDue(ts: number): string {
  const due = new Date(ts);
  const today = startOfToday();
  const diffDays = Math.round((due.setHours(0, 0, 0, 0) - today.getTime()) / DAY);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
  }
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Past due and not yet done. */
export function isOverdue(dueAt: number | null, done: boolean): boolean {
  return dueAt != null && !done && dueAt < Date.now();
}
