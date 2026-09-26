import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearArrival, pendingArrivals } from '@/lib/geofencing';
import { useReminders } from '@/lib/reminders';

function reminderIdOf(n: Notifications.Notification): string | undefined {
  const id = n.request.content.data?.reminderId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * "You've arrived" pop-up for location reminders. Shows the reminder's title,
 * place and saved notes when its geofence fires:
 * - live, if the app is open (the notification handler skips the banner and
 *   just plays the sound — see geofencing.ts);
 * - on the next open / return to the app, if it fired in the background;
 * - when the user taps the notification.
 * Several arrivals queue up and show one after another.
 */
export function ArrivalModal() {
  const theme = useTheme();
  const { getReminder, updateReminder, loading } = useReminders();
  const [queue, setQueue] = useState<string[]>([]);

  const enqueue = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setQueue((q) => [...q, ...ids.filter((id) => !q.includes(id))]);
  }, []);

  useEffect(() => {
    const loadPending = () => pendingArrivals().then(enqueue);
    loadPending();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadPending();
    });
    const received = Notifications.addNotificationReceivedListener((n) => {
      const id = reminderIdOf(n);
      if (id) enqueue([id]);
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = reminderIdOf(r.notification);
      if (id) enqueue([id]);
    });
    return () => {
      appState.remove();
      received.remove();
      tapped.remove();
    };
  }, [enqueue]);

  // Skip anything deleted or already done since it fired.
  const isLive = useCallback(
    (id: string) => {
      const r = getReminder(id);
      return r != null && !r.done;
    },
    [getReminder],
  );
  const live = loading ? [] : queue.filter(isLive);

  // Drop the stale ones from storage so they don't come back next launch.
  useEffect(() => {
    if (loading) return;
    queue.filter((id) => !isLive(id)).forEach((id) => clearArrival(id).catch(() => {}));
  }, [queue, loading, isLive]);

  const currentId = live[0];
  const reminder = currentId ? getReminder(currentId) : undefined;

  const close = () => {
    if (!currentId) return;
    clearArrival(currentId).catch(() => {});
    // Also clear its entry from the notification shade.
    Notifications.getPresentedNotificationsAsync()
      .then((list) =>
        list
          .filter((n) => reminderIdOf(n) === currentId)
          .forEach((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
      )
      .catch(() => {});
    setQueue((q) => q.filter((id) => id !== currentId));
  };

  const markDone = () => {
    if (currentId) updateReminder(currentId, { done: true });
    close();
  };

  const open = () => {
    const id = currentId;
    close();
    if (id) router.push({ pathname: '/reminder/[id]', params: { id } });
  };

  const notes = reminder?.notes.trim();

  return (
    <Modal
      visible={reminder != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {reminder && (
          <Animated.View
            key={reminder.id}
            entering={FadeInDown.duration(220).springify().damping(20)}
            pointerEvents="box-none"
            style={styles.cardWrap}>
            <GlassSurface glass="regular" radius={28} style={styles.card}>
              <View style={[styles.iconDisc, { backgroundColor: theme.accent + '1F' }]}>
                <Ionicons name="location" size={26} color={theme.accent} />
              </View>

              <ThemedText type="subtitle" style={styles.center}>
                {reminder.title.trim() || 'Reminder nearby'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {reminder.location?.label
                  ? `You're near ${reminder.location.label}`
                  : "You're near this reminder's location"}
              </ThemedText>

              {notes ? (
                <ScrollView
                  style={[styles.notes, { backgroundColor: theme.backgroundElement }]}
                  contentContainerStyle={styles.notesContent}>
                  <ThemedText>{notes}</ThemedText>
                </ScrollView>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={open}
                  style={({ pressed }) => [
                    styles.btn,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <ThemedText type="smallBold">Open</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={markDone}
                  style={({ pressed }) => [
                    styles.btn,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    Mark done
                  </ThemedText>
                </Pressable>
              </View>
              <Pressable onPress={close} hitSlop={8} style={styles.later}>
                <ThemedText type="small" themeColor="textSecondary">
                  {live.length > 1 ? `Later · ${live.length - 1} more` : 'Later'}
                </ThemedText>
              </Pressable>
            </GlassSurface>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardWrap: { width: '100%', maxWidth: 360 },
  card: {
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  iconDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  center: { textAlign: 'center' },
  notes: {
    alignSelf: 'stretch',
    maxHeight: 220,
    borderRadius: 14,
    marginTop: Spacing.two,
  },
  notesContent: { padding: Spacing.three },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  later: { marginTop: Spacing.one, paddingVertical: Spacing.one },
});
