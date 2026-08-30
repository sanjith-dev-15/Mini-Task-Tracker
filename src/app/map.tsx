import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, StyleSheet } from 'react-native';

import { ReminderMap } from '@/components/reminder-map';
import { ThemedView } from '@/components/themed-view';
import { useReminders } from '@/lib/reminders';

/** Full-screen map — opened from the expand button on the Home map. */
export default function MapScreen() {
  const { reminders, createReminder } = useReminders();

  const openReminder = (id: string) =>
    router.push({ pathname: '/reminder/[id]', params: { id } });

  // Only reachable from the Home map, so both the close button and the
  // hardware back button return there (not to whatever was last in the drawer).
  const close = useCallback(() => router.replace('/'), []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [close]),
  );

  return (
    <ThemedView style={styles.screen}>
      <ReminderMap
        fullBleed
        searchable
        style={StyleSheet.absoluteFill}
        reminders={reminders}
        onPressPin={openReminder}
        onLongPressMap={(coord) => openReminder(createReminder({ location: coord }).id)}
        onClose={close}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
