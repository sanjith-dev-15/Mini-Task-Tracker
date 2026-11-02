import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MonthCalendar } from '@/components/month-calendar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { activeChipKey, dayStartOf, DUE_CHIPS, formatDue, morningOf } from '@/lib/reminder-dates';

type Cell = 'today' | 'tomorrow' | 'weekend' | 'week' | 'none' | 'date';

/** Glyph per quick-pick tile; "+1 week" draws "+1" as text instead. */
const TILE_ICONS: Partial<Record<Cell, keyof typeof Ionicons.glyphMap>> = {
  today: 'today-outline',
  tomorrow: 'sunny-outline',
  weekend: 'calendar-outline',
};

const SPRING = { damping: 18, stiffness: 230, mass: 0.9 };

type CellLayout = LayoutRectangle & { row: number };

/**
 * "When" picker for a reminder: a grid of quick picks (Today / Tomorrow / This
 * weekend / +1 week) over None / Pick a date. One highlight glides between
 * whichever cell is selected, across both rows; Pick a date opens a calendar.
 */
export function WhenPicker({
  dueAt,
  onChange,
}: {
  dueAt: number | null;
  onChange: (dueAt: number | null) => void;
}) {
  const theme = useTheme();
  const [showCal, setShowCal] = useState(false);

  const chip = activeChipKey(dueAt);
  const selected: Cell = chip === '' ? 'date' : (chip as Cell);
  const custom = selected === 'date';

  // Layouts: each row's y inside the card, each cell's box inside its row.
  const [rowY, setRowY] = useState<Record<number, number>>({});
  const [cells, setCells] = useState<Partial<Record<Cell, CellLayout>>>({});

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const shown = useSharedValue(0);
  const placed = useRef(false);

  const target = cells[selected];
  const targetRowY = target ? rowY[target.row] : undefined;

  useEffect(() => {
    if (!target || targetRowY == null) return;
    const ty = targetRowY + target.y;
    if (!placed.current) {
      // First layout — appear in place, no slide.
      placed.current = true;
      x.value = target.x;
      y.value = ty;
      w.value = target.width;
      h.value = target.height;
      shown.value = withTiming(1, { duration: 150 });
      return;
    }
    x.value = withSpring(target.x, SPRING);
    y.value = withSpring(ty, SPRING);
    w.value = withSpring(target.width, SPRING);
    h.value = withSpring(target.height, SPRING);
  }, [target, targetRowY, x, y, w, h, shown]);

  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    width: w.value,
    height: h.value,
    opacity: shown.value,
  }));

  const onRowLayout = (row: number) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
    const ly = e.nativeEvent.layout.y;
    setRowY((prev) => (prev[row] === ly ? prev : { ...prev, [row]: ly }));
  };

  const onCellLayout =
    (key: Cell, row: number) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
      const l = e.nativeEvent.layout;
      setCells((prev) => {
        const cur = prev[key];
        if (cur && cur.x === l.x && cur.y === l.y && cur.width === l.width && cur.height === l.height) {
          return prev;
        }
        return { ...prev, [key]: { ...l, row } };
      });
    };

  const pick = (value: number | null) => {
    setShowCal(false);
    onChange(value);
  };

  const quick = DUE_CHIPS.filter((c) => c.key !== 'none');

  return (
    <View>
      <View style={styles.head}>
        <Ionicons name="calendar-clear-outline" size={15} color={theme.textSecondary} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          When
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: theme.accent }, highlight]}
        />

        <View style={styles.tiles} onLayout={onRowLayout(0)}>
          {quick.map((c) => {
            const key = c.key as Cell;
            const active = selected === key;
            const tint = active ? '#fff' : theme.textSecondary;
            const icon = TILE_ICONS[key];
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.label}
                onLayout={onCellLayout(key, 0)}
                onPress={() => pick(c.resolve())}
                style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}>
                {icon ? (
                  <Ionicons name={icon} size={20} color={tint} />
                ) : (
                  <ThemedText style={[styles.plus, { color: tint }]}>+1</ThemedText>
                )}
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={[styles.tileLabel, { color: active ? '#fff' : theme.text }]}>
                  {key === 'week' ? 'Week' : c.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.rule, { backgroundColor: theme.border }]} />

        <View style={styles.foot} onLayout={onRowLayout(1)}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selected === 'none' }}
            onLayout={onCellLayout('none', 1)}
            onPress={() => pick(null)}
            style={({ pressed }) => [styles.footCell, { opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons
              name="remove-circle-outline"
              size={17}
              color={selected === 'none' ? '#fff' : theme.textSecondary}
            />
            <ThemedText
              type="smallBold"
              style={{ color: selected === 'none' ? '#fff' : theme.textSecondary }}>
              None
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: custom, expanded: showCal }}
            onLayout={onCellLayout('date', 1)}
            onPress={() => setShowCal((v) => !v)}
            style={({ pressed }) => [styles.footCell, { opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons
              name={showCal ? 'chevron-up' : 'calendar-outline'}
              size={17}
              color={custom ? '#fff' : showCal ? theme.accent : theme.textSecondary}
            />
            <ThemedText
              type="smallBold"
              style={{ color: custom ? '#fff' : showCal ? theme.accent : theme.textSecondary }}>
              {custom && dueAt != null ? formatDue(dueAt) : 'Pick a date'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {showCal && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(150)}
          style={[styles.calendar, { backgroundColor: theme.backgroundElement }]}>
          <MonthCalendar
            selected={dueAt != null ? dayStartOf(dueAt) : null}
            onSelect={(ts) => pick(morningOf(ts))}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  highlight: { position: 'absolute', left: 0, top: 0, borderRadius: 13 },
  tiles: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one + 2 },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two + 2,
    borderRadius: 14,
  },
  plus: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  tileLabel: { fontWeight: '600', textAlign: 'center' },
  // Behind the highlight, so it doesn't cut across it mid-slide.
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three, zIndex: -1 },
  foot: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one + 2 },
  footCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    height: 38,
    borderRadius: 12,
  },
  calendar: {
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
});
