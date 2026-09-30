import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDue, isOverdue } from '@/lib/reminder-dates';
import type { Reminder, ReminderViewMode } from '@/lib/reminders';

/**
 * One reminder in the Home list.
 * - `compact`: title only, tighter row.
 * - `detail` (default): title + due date / place.
 * - `notes`: detail plus a preview of the saved notes.
 * - `grid` / `grid3`: a card for a two- / three-column grid (see {@link ReminderTile}).
 */
export function ReminderRow(props: RowProps) {
  if (props.variant === 'grid' || props.variant === 'grid3') return <ReminderTile {...props} />;
  return <ListRow {...props} />;
}

type RowProps = {
  reminder: Reminder;
  variant?: ReminderViewMode;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
};

function Checkbox({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const theme = useTheme();
  return (
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
  );
}

function locationText(location: NonNullable<Reminder['location']>): string {
  return location.label ?? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`;
}

/** Grid card: checkbox + delete on top, then title, due, place and a notes preview. */
function ReminderTile({ reminder, variant, onPress, onDelete, onToggle }: RowProps) {
  const theme = useTheme();
  const { done, dueAt, location, title } = reminder;
  const overdue = isOverdue(dueAt, done);
  const notes = reminder.notes.trim();
  // Three-across tiles are narrow: tighter padding, smaller text, shorter preview.
  const small = variant === 'grid3';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        small && styles.tileSmall,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.tileTop}>
        <Checkbox done={done} onToggle={onToggle} />
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete reminder"
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.5 }]}>
          <Ionicons name="trash-outline" size={small ? 14 : 16} color={theme.danger} />
        </Pressable>
      </View>

      <ThemedText
        type="smallBold"
        numberOfLines={small ? 3 : 2}
        themeColor={done ? 'textSecondary' : 'text'}
        style={[styles.tileTitle, small && styles.tileTitleSmall, done && styles.strike]}>
        {title.trim() || 'Untitled reminder'}
      </ThemedText>

      {dueAt != null && (
        <ThemedText
          type="small"
          numberOfLines={1}
          style={[
            { color: overdue ? theme.danger : theme.textSecondary },
            small && styles.smallText,
          ]}>
          {formatDue(dueAt)}
        </ThemedText>
      )}
      {location != null && (
        <View style={[styles.locChip, styles.tileLoc]}>
          <Ionicons name="location-outline" size={small ? 11 : 12} color={theme.textSecondary} />
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={1}
            style={[styles.flex, small && styles.smallText]}>
            {locationText(location)}
          </ThemedText>
        </View>
      )}
      {notes ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={small ? 2 : 4}
          style={[styles.notes, small && styles.smallText]}>
          {notes}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function ListRow({
  reminder,
  variant = 'detail',
  onPress,
  onEdit,
  onDelete,
  onToggle,
}: RowProps) {
  const theme = useTheme();
  const { done, dueAt, location, title } = reminder;
  const overdue = isOverdue(dueAt, done);
  const compact = variant === 'compact';
  const notes = variant === 'notes' ? reminder.notes.trim() : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Checkbox done={done} onToggle={onToggle} />

      <View style={styles.body}>
        <ThemedText
          numberOfLines={1}
          themeColor={done ? 'textSecondary' : 'text'}
          style={done ? styles.strike : undefined}>
          {title.trim() || 'Untitled reminder'}
        </ThemedText>

        {!compact && (dueAt != null || location != null) && (
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
                  {locationText(location)}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {notes ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.notes}>
            {notes}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit reminder"
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.5 }]}>
          <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete reminder"
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.5 }]}>
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
      </View>
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
  rowCompact: { paddingVertical: Spacing.two },
  tile: {
    flex: 1,
    minHeight: 132,
    gap: Spacing.one,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  tileSmall: { minHeight: 112, padding: Spacing.two + 2, borderRadius: 14 },
  tileTitle: { fontSize: 15 },
  tileTitleSmall: { fontSize: 13, lineHeight: 17 },
  smallText: { fontSize: 12, lineHeight: 16 },
  tileLoc: { maxWidth: '100%' },
  flex: { flex: 1 },
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
  notes: { marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '70%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  actionBtn: { padding: 4 },
});
