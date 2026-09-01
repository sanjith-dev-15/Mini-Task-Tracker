import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, StyleSheet } from 'react-native';

import { ReminderMap } from '@/components/reminder-map';
import { ThemedView } from '@/components/themed-view';
import { useReminders, type ReminderLocation } from '@/lib/reminders';

/**
 * Full-screen map.
 * - Default: opened from the expand button on the Home map — pins + search,
 *   long-press / "Add reminder here" spins up a new reminder.
 * - `pickFor=<reminderId>`: opened from a reminder editor's LOCATION row — the
 *   next place you choose is written straight onto that reminder and we pop back.
 */
export default function MapScreen() {
  const { pickFor } = useLocalSearchParams<{ pickFor?: string }>();
  const { reminders, createReminder, updateReminder, getReminder } = useReminders();
  const picking = pickFor != null;

  const openReminder = (id: string) =>
    router.push({ pathname: '/reminder/[id]', params: { id } });

  // In pick mode we were pushed from the editor, so pop back to it. Otherwise
  // we're only reachable from the Home map — return there.
  const close = useCallback(
    () => (picking ? router.back() : router.replace('/')),
    [picking],
  );

  const choose = (coord: ReminderLocation) => {
    if (pickFor) {
      updateReminder(pickFor, { location: coord });
      router.back();
    } else {
      // `fresh` → the editor drops it on exit unless it's named (see [id].tsx).
      router.push({
        pathname: '/reminder/[id]',
        params: { id: createReminder({ location: coord }).id, fresh: '1' },
      });
    }
  };

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [close]),
  );

  // In pick mode, show only the reminder being edited (so its current pin is
  // visible and the camera starts there); tapping it does nothing.
  const pickReminder = pickFor ? getReminder(pickFor) : undefined;
  const pinned = picking ? (pickReminder ? [pickReminder] : []) : reminders;

  return (
    <ThemedView style={styles.screen}>
      <ReminderMap
        fullBleed
        searchable
        pickMode={picking}
        style={StyleSheet.absoluteFill}
        reminders={pinned}
        onPressPin={picking ? () => {} : openReminder}
        onLongPressMap={choose}
        onClose={close}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
