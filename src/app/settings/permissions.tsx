import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  geofencePermissionState,
  isGeofencingEnabled,
  requestGeofencePermissions,
  setGeofencingEnabled,
  type GeofenceState,
} from '@/lib/geofencing';
import { grantLabel, PERMISSIONS, type PermissionInfo } from '@/lib/permissions';
import { useReminders } from '@/lib/reminders';

export default function PermissionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={() => router.back()}
          accessibilityLabel="Back to Settings"
        />
        <ThemedText type="subtitle">Permissions</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Everything the app asks the system for, and why. Tap one for the details. Nothing here
          leaves your device.
        </ThemedText>

        <LocationRemindersControl />

        {PERMISSIONS.map((info) => (
          <PermissionCard
            key={info.key}
            info={info}
            expanded={open === info.key}
            onToggle={() => toggle(info.key)}
          />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const GEO_HINT: Record<GeofenceState, string> = {
  ready: 'On — you’ll be notified when you reach a located reminder.',
  'needs-location': 'Needs location access.',
  'needs-background': 'Android needs the "Allow all the time" location setting — open system settings to change it.',
  'needs-notifications': 'Needs notification permission.',
};

/** The one interactive switch on this screen: arm/disarm geofenced reminders. */
function LocationRemindersControl() {
  const theme = useTheme();
  const { reminders } = useReminders();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<GeofenceState>('needs-location');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([isGeofencingEnabled(), geofencePermissionState()])
      .then(([en, st]) => {
        setEnabled(en);
        setState(st);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const result = await requestGeofencePermissions();
        setState(result);
        if (result === 'ready') {
          await setGeofencingEnabled(true, reminders);
          setEnabled(true);
        } else if (result === 'needs-background') {
          Alert.alert(
            'One more step',
            'Set this app’s location access to "Allow all the time" in system settings, then try again.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
      } else {
        await setGeofencingEnabled(false, reminders);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const on = enabled && state === 'ready';

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.geoHead}>
        <Ionicons name="notifications-circle-outline" size={22} color={theme.text} />
        <View style={styles.geoText}>
          <ThemedText style={styles.cardTitle}>Location reminders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {busy ? 'Working…' : on ? GEO_HINT.ready : enabled ? GEO_HINT[state] : 'Off'}
          </ThemedText>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <Switch
            value={on}
            onValueChange={onToggle}
            trackColor={{ true: theme.accent }}
          />
        )}
      </View>
      {enabled && state !== 'ready' && !busy && (
        <Pressable onPress={() => Linking.openSettings()} style={styles.geoAction}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Open system settings
          </ThemedText>
        </Pressable>
      )}
    </Animated.View>
  );
}

function PermissionCard({
  info,
  expanded,
  onToggle,
}: {
  info: PermissionInfo;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.cardHead, pressed && { opacity: 0.6 }]}>
        <Ionicons name={info.icon} size={20} color={theme.text} />
        <ThemedText style={styles.cardTitle}>{info.title}</ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {grantLabel(info)}
          </ThemedText>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textSecondary}
        />
      </Pressable>

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={[styles.cardBody, { borderTopColor: theme.border }]}>
          <ThemedText type="small">{info.purpose}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {info.detail}
          </ThemedText>

          {info.key === 'location' && <LocationControl />}

          <ThemedText type="small" themeColor="textSecondary" style={styles.android}>
            {info.android.join(' · ')}
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
  );
}

type LocState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

function LocationControl() {
  const theme = useTheme();
  const [state, setState] = useState<LocState>('undetermined');
  const [canAsk, setCanAsk] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await Location.getForegroundPermissionsAsync();
      setState(res.granted ? 'granted' : res.canAskAgain ? 'undetermined' : 'denied');
      setCanAsk(res.canAskAgain);
    } catch {
      setState('unavailable');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onPress = async () => {
    if (busy) return;
    if (state === 'undetermined' && canAsk) {
      setBusy(true);
      try {
        const res = await Location.requestForegroundPermissionsAsync();
        setState(res.granted ? 'granted' : res.canAskAgain ? 'undetermined' : 'denied');
        setCanAsk(res.canAskAgain);
      } catch {
        setState('unavailable');
      } finally {
        setBusy(false);
      }
    } else {
      Linking.openSettings();
    }
  };

  const meta: Record<LocState, { text: string; color: string; action: string | null }> = {
    granted: { text: 'Allowed', color: theme.accent, action: 'Manage in system settings' },
    undetermined: { text: 'Not asked yet', color: theme.textSecondary, action: 'Allow location' },
    denied: { text: 'Denied', color: theme.danger, action: 'Open system settings' },
    unavailable: { text: 'Not available in this build', color: theme.textSecondary, action: null },
  };
  const m = meta[state];

  return (
    <View style={[styles.locRow, { borderTopColor: theme.border }]}>
      <View style={styles.locStatus}>
        <View style={[styles.dot, { backgroundColor: m.color }]} />
        <ThemedText type="small" style={{ color: m.color }}>
          {m.text}
        </ThemedText>
      </View>
      {m.action &&
        (busy ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <Pressable onPress={onPress} hitSlop={8}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {m.action}
            </ThemedText>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  intro: { paddingHorizontal: Spacing.one, marginBottom: Spacing.one },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  geoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  geoText: { flex: 1, gap: 2 },
  geoAction: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardTitle: { flex: 1, fontWeight: '600' },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  android: { fontSize: 11, opacity: 0.8 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
