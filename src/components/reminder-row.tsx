import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDue, isOverdue } from '@/lib/reminder-dates';
import type { Reminder } from '@/lib/reminders';

export function ReminderRow({
  reminder,
  onPress,
  onLongPress,
  onToggle,
}: {
  reminder: Reminder;
  onPress: () => void;
  onLongPress: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { done, dueAt, location, title } = reminder;
  const overdue = isOverdue(dueAt, done);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        style={[
          styles.checkbox,
          {
            borderColor: done ? theme.accent : theme.border,
            backgroundColor: done ? theme.accent : 'transparent',
          },
        ]}>
        {done && <Ionicons name="checkmark" size={14} color="#fff" />}
      </Pressable>

      <View style={styles.body}>
        <ThemedText
          numberOfLines={1}
          themeColor={done ? 'textSecondary' : 'text'}
          style={done ? styles.strike : undefined}>
          {title.trim() || 'Untitled reminder'}
        </ThemedText>

        {(dueAt != null || location != null) && (
          <View style={styles.meta}>
            {dueAt != null && (
              <ThemedText
                type="small"
                style={{ color: overdue ? theme.danger : theme.textSecondary }}>
                {formatDue(dueAt)}
              </ThemedText>
            )}
            {location != null && (
              <View style={styles.locChip}>
                <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {location.label ?? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`}
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  strike: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '70%' },
});
