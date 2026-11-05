import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RADIUS_OPTIONS, radiusLabel } from '@/lib/geofencing';

const SPRING = { damping: 18, stiffness: 230, mass: 0.9 };
const PAD = Spacing.one + 2;
const GAP = Spacing.one;

/**
 * "Alert range" for a location reminder: how close you need to get before it
 * rings. One row of distances with a highlight that glides between them, like
 * the When picker.
 */
export function RangePicker({
  radius,
  onChange,
  hasLocation,
}: {
  radius: number;
  onChange: (radius: number) => void;
  /** Without a place yet, the choice is kept and applied once one is picked. */
  hasLocation: boolean;
}) {
  const theme = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const index = Math.max(0, RADIUS_OPTIONS.indexOf(radius as (typeof RADIUS_OPTIONS)[number]));
  const n = RADIUS_OPTIONS.length;
  const cell = rowWidth > 0 ? (rowWidth - PAD * 2 - GAP * (n - 1)) / n : 0;

  const x = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (cell <= 0) return;
    const to = PAD + index * (cell + GAP);
    if (shown.value === 0) {
      x.value = to;
      shown.value = withTiming(1, { duration: 150 });
    } else {
      x.value = withSpring(to, SPRING);
    }
  }, [cell, index, x, shown]);

  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: shown.value,
  }));

  return (
    <View>
      <View style={styles.head}>
        <Ionicons name="radio-outline" size={16} color={theme.textSecondary} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          Alert range
        </ThemedText>
      </View>

      <View
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        <Animated.View
          pointerEvents="none"
          style={[styles.highlight, { width: cell, backgroundColor: theme.accent }, highlight]}
        />
        {RADIUS_OPTIONS.map((m, i) => {
          const active = i === index;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Alert within ${radiusLabel(m)}`}
              onPress={() => onChange(m)}
              style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.7 : 1 }]}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: active ? '#fff' : theme.text }}>
                {radiusLabel(m)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
        {hasLocation
          ? `Rings when you're within ${radiusLabel(radius)} of the place.`
          : `Pick a place above — it'll ring within ${radiusLabel(radius)} of it.`}
      </ThemedText>
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
    flexDirection: 'row',
    gap: GAP,
    padding: PAD,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  highlight: {
    position: 'absolute',
    left: 0,
    top: PAD,
    bottom: PAD,
    borderRadius: 13,
  },
  cell: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { marginTop: Spacing.two, paddingHorizontal: Spacing.one },
});
