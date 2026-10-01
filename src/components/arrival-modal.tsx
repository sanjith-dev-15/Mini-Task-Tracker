import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { arrivalOverlayContent, clearArrival, pendingArrivals } from '@/lib/geofencing';
import { useReminders } from '@/lib/reminders';
import { useThemeContext } from '@/lib/theme';
import {
  addOverlayDoneListener,
  canDrawOverlays,
  hideOverlay,
  overlaySupported,
  showOverlay,
  takeOverlayDone,
} from '../../modules/reminder-overlay';

function reminderIdOf(n: Notifications.Notification): string | undefined {
  const id = n.request.content.data?.reminderId;
  return typeof id === 'string' ? id : undefined;
}

/** The arrival was already shown as the over-other-apps card. */
function shownAsOverlay(n: Notifications.Notification): boolean {
  return n.request.content.data?.overlay === true;
}

/** Remove a reminder's alert from the notification shade. */
function dismissNotificationsFor(id: string) {
  Notifications.getPresentedNotificationsAsync()
    .then((list) =>
      list
        .filter((n) => reminderIdOf(n) === id)
        .forEach((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    )
    .catch(() => {});
}

/**
 * "You've arrived" pop-up for location reminders. On Android with "Display
 * over other apps" granted, the geofence task draws the card over any app
 * (modules/reminder-overlay) and this in-app modal stays out of the way —
 * it only applies the overlay's "Mark done" taps. Otherwise it shows the
 * reminder's title, place and saved notes:
 * - live, if the app is open (the notification handler skips the banner and
 *   just plays the sound — see geofencing.ts);
 * - on the next open / return to the app, if it fired in the background;
 * - when the user taps the notification.
 * Several arrivals queue up and show one after another.
 */
export function ArrivalModal() {
  const theme = useTheme();
  const { scheme } = useThemeContext();
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
      if (id && !shownAsOverlay(n)) enqueue([id]);
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = reminderIdOf(r.notification);
      if (!id) return;
      if (shownAsOverlay(r.notification)) {
        // The card is (or was) already on screen — go straight to the reminder.
        hideOverlay(id);
        router.push({ pathname: '/reminder/[id]', params: { id } });
      } else {
        enqueue([id]);
      }
    });
    return () => {
      appState.remove();
      received.remove();
      tapped.remove();
    };
  }, [enqueue]);

  // Apply "Mark done" taps from the overlay — live if the app is running,
  // otherwise on the next launch / return to the app.
  useEffect(() => {
    if (loading) return;
    const applyDone = () => {
      for (const id of takeOverlayDone()) {
        const r = getReminder(id);
        if (r && !r.done) updateReminder(id, { done: true });
        dismissNotificationsFor(id);
      }
    };
    applyDone();
    const done = addOverlayDoneListener(applyDone);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') applyDone();
    });
    return () => {
      done.remove();
      appState.remove();
    };
  }, [loading, getReminder, updateReminder]);

  // Skip anything deleted or already done since it fired.
  const isLive = useCallback(
    (id: string) => {
      const r = getReminder(id);
      return r != null && !r.done;
    },
    [getReminder],
  );
  // Android build with the overlay module: the card only ever shows over
  // other apps, never inside this one. Arrivals wait in the queue until
  // "Display over other apps" is granted (the PermissionGate asks for it),
  // then go to the overlay. The in-app modal is the iOS / old-build fallback.
  const overlayOn = canDrawOverlays();
  const live = loading || overlaySupported ? [] : queue.filter(isLive);
  const forwarded = useRef(new Set<string>());

  useEffect(() => {
    if (loading || !overlayOn) return;
    for (const id of queue) {
      const r = getReminder(id);
      if (!r || r.done || forwarded.current.has(id)) continue;
      forwarded.current.add(id);
      showOverlay(arrivalOverlayContent(r, scheme === 'dark'));
      clearArrival(id).catch(() => {});
    }
  }, [queue, loading, overlayOn, getReminder, scheme]);

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
    dismissNotificationsFor(currentId);
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
      // Stays up until Open, Mark done or Later — back / tapping outside do nothing.
      onRequestClose={() => {}}>
      <View style={styles.scrim}>
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
