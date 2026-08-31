import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { activeChipKey, DUE_CHIPS } from '@/lib/reminder-dates';
import { isBlankReminder, useReminders, type Reminder } from '@/lib/reminders';

export default function ReminderEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getReminder, updateReminder, deleteReminder } = useReminders();

  const reminder = getReminder(id);
  const ref = useRef<Reminder | undefined>(reminder);
  useEffect(() => {
    ref.current = reminder;
  });

  // Discard on exit if the user never gave it anything worth keeping.
  useEffect(() => {
    return () => {
      const current = ref.current;
      if (current && isBlankReminder(current)) deleteReminder(current.id);
    };
  }, [deleteReminder]);

  // Close the editor and land on the Home tab, wherever we were opened from.
  const goHome = useCallback(() => router.replace('/'), []);

  if (!reminder) {
    return (
      <ThemedView style={[styles.screen, styles.centered]}>
        <ThemedText themeColor="textSecondary">This reminder no longer exists.</ThemedText>
        <Pressable onPress={() => router.replace('/')} style={styles.linkBtn}>
          <ThemedText style={{ color: theme.accent }}>Back to Home</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const confirmDelete = () => {
    Alert.alert('Delete reminder?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteReminder(reminder.id);
          goHome();
        },
      },
    ]);
  };

  const currentChip = activeChipKey(reminder.dueAt);
  const loc = reminder.location;

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={goHome}
          accessibilityLabel="Back to Home"
        />
        <GlassIconButton
          name="trash-outline"
          color={theme.danger}
          onPress={confirmDelete}
          accessibilityLabel="Delete reminder"
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}
          keyboardShouldPersistTaps="handled">
          <TextInput
            value={reminder.title}
            onChangeText={(title) => updateReminder(reminder.id, { title })}
            placeholder="Remind me to…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text }]}
            multiline
          />

          <Pressable
            onPress={() => updateReminder(reminder.id, { done: !reminder.done })}
            style={styles.doneRow}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: reminder.done ? theme.accent : theme.border,
                  backgroundColor: reminder.done ? theme.accent : 'transparent',
                },
              ]}>
              {reminder.done && <Ionicons name="checkmark" size={15} color="#fff" />}
            </View>
            <ThemedText themeColor={reminder.done ? 'textSecondary' : 'text'}>
              {reminder.done ? 'Completed' : 'Mark complete'}
            </ThemedText>
          </Pressable>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            WHEN
          </ThemedText>
          <View style={styles.chips}>
            {DUE_CHIPS.map((chip) => {
              const active = currentChip === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => updateReminder(reminder.id, { dueAt: chip.resolve() })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#fff' : theme.textSecondary }}>
                    {chip.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            LOCATION
          </ThemedText>
          <View style={[styles.locBox, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons
              name={loc ? 'location' : 'location-outline'}
              size={18}
              color={loc ? theme.accent : theme.textSecondary}
            />
            <ThemedText themeColor={loc ? 'text' : 'textSecondary'} style={styles.flex}>
              {loc
                ? (loc.label ?? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`)
                : 'No location — long-press the map on Home to pin one'}
            </ThemedText>
            {loc && (
              <Pressable
                onPress={() => updateReminder(reminder.id, { location: null })}
                hitSlop={10}
                accessibilityLabel="Remove location">
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <TextInput
            value={reminder.notes}
            onChangeText={(notes) => updateReminder(reminder.id, { notes })}
            placeholder="Notes…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.notesInput, { color: theme.text }]}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  linkBtn: { padding: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  titleInput: { fontSize: 26, fontWeight: '700', paddingVertical: Spacing.two },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: { letterSpacing: 1, marginTop: Spacing.four, marginBottom: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  locBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    padding: Spacing.three,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.four },
  notesInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
});
