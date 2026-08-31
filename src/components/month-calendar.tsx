import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startOfDay } from '@/lib/expenses';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Props = {
  /** Currently selected day (midnight ms), or null for none. */
  selected: number | null;
  onSelect: (ts: number) => void;
  /** `dayKey → amount` — draws an intensity dot under days with spend. */
  spendByDay?: Map<string, number>;
  /** Block days after today. */
  maxToday?: boolean;
};

/** A compact, dependency-free month grid. Sunday-first. */
export function MonthCalendar({ selected, onSelect, spendByDay, maxToday }: Props) {
  const theme = useTheme();
  const today = startOfDay();
  const cur = new Date(today);

  const [view, setView] = useState(() => {
    const d = new Date(selected ?? today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const first = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const offset = first.getDay();
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const maxSpend = spendByDay && spendByDay.size ? Math.max(...spendByDay.values()) : 1;

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const canNext =
    !maxToday ||
    view.year < cur.getFullYear() ||
    (view.year === cur.getFullYear() && view.month < cur.getMonth());

  const shift = (delta: number) =>
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.nav}>
          <Ionicons name="chevron-back" size={18} color={theme.text} />
        </Pressable>
        <ThemedText type="smallBold">{monthLabel}</ThemedText>
        <Pressable
          onPress={() => canNext && shift(1)}
          disabled={!canNext}
          hitSlop={10}
          style={styles.nav}>
          <Ionicons name="chevron-forward" size={18} color={canNext ? theme.text : theme.border} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>
            {w}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <View key={i} style={styles.cell} />;
          const ts = new Date(view.year, view.month, d).setHours(0, 0, 0, 0);
          const future = maxToday === true && ts > today;
          const isSelected = selected != null && ts === selected;
          const isToday = ts === today;
          const spend = spendByDay?.get(String(ts)) ?? 0;

          return (
            <Pressable
              key={i}
              disabled={future}
              onPress={() => onSelect(ts)}
              style={styles.cell}>
              <View style={[styles.day, isSelected && { backgroundColor: theme.accent }]}>
                <ThemedText
                  type="small"
                  style={{
                    color: isSelected
                      ? '#fff'
                      : future
                        ? theme.border
                        : isToday
                          ? theme.accent
                          : theme.text,
                    fontWeight: isToday || isSelected ? '700' : '500',
                  }}>
                  {d}
                </ThemedText>
              </View>
              {spend > 0 && !isSelected && (
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: theme.accent,
                      opacity: 0.3 + 0.7 * Math.min(1, spend / maxSpend),
                    },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  nav: { padding: Spacing.one },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  day: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, position: 'absolute', bottom: 4 },
});
