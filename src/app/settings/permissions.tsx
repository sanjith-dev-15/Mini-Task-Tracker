import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
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
          Flip a switch to grant a permission. Android only lets the app ask once — after that the
          switch opens the app’s system settings, where you can also turn things back off. Nothing
          here leaves your device.
        </ThemedText>

        <LocationRemindersControl />

        {PERMISSIONS.map((info) => (
          <PermissionCard
            key={info.key}
            info={info}
            expanded={open === info.key}
            onExpand={() => toggle(info.key)}
          />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

/* ----------------------------------------------- raw OS permission plumbing */

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';
type PermResult = { status: PermStatus; canAsk: boolean };

/** Keys in `PERMISSIONS` that map to a runtime permission we can drive. */
const RUNTIME_KEYS = ['location', 'background-location', 'notifications'] as const;

function toResult(granted: boolean, canAskAgain: boolean | undefined): PermResult {
  const canAsk = canAskAgain ?? true;
  return { status: granted ? 'granted' : canAsk ? 'undetermined' : 'denied', canAsk };
}

async function readStatus(key: string): Promise<PermResult> {
  try {
    if (key === 'location') {
      const r = await Location.getForegroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'background-location') {
      const r = await Location.getBackgroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'notifications') {
      const r = await Notifications.getPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
  } catch {
    /* native module or manifest entry missing */
  }
  return { status: 'unavailable', canAsk: false };
}

async function askPermission(key: string): Promise<PermResult> {
  try {
    if (key === 'location') {
      const r = await Location.requestForegroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'background-location') {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!fg.granted) {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (!asked.granted) return toResult(false, asked.canAskAgain);
      }
      const r = await Location.requestBackgroundPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
    if (key === 'notifications') {
      const r = await Notifications.requestPermissionsAsync();
      return toResult(r.granted, r.canAskAgain);
    }
  } catch {
    /* native module or manifest entry missing */
  }
  return { status: 'unavailable', canAsk: false };
}

const STATUS_TEXT: Record<PermStatus, string> = {
  granted: 'Allowed',
  denied: 'Denied — turn on in system settings',
  undetermined: 'Not granted',
  unavailable: 'Needs an app rebuild',
};

/** State + actions for one runtime permission. */
function usePermission(key: string, active: boolean) {
  const [status, setStatus] = useState<PermStatus>('undetermined');
  const [canAsk, setCanAsk] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!active) return;
    readStatus(key)
      .then((r) => {
        setStatus(r.status);
        setCanAsk(r.canAsk);
      })
      .catch(() => {});
  }, [key, active]);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const promptSettings = (mode: 'grant' | 'revoke') =>
    Alert.alert(
      mode === 'grant' ? 'Allow in system settings' : 'Turn off in system settings',
      mode === 'grant'
        ? 'Android won’t let the app ask again. Enable it in the app’s system settings.'
        : 'The app can’t remove a permission it was given. Turn it off in the app’s system settings.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ],
    );

  const set = useCallback(
    async (next: boolean) => {
      if (busy) return;
      if (status === 'unavailable') {
        Alert.alert('Not available', 'Rebuild the app to use this permission.');
        return;
      }
      if (!next) {
        promptSettings('revoke');
        return;
      }
      if (!canAsk || status === 'denied') {
        promptSettings('grant');
        return;
      }
      setBusy(true);
      const r = await askPermission(key);
      setStatus(r.status);
      setCanAsk(r.canAsk);
      setBusy(false);
      if (r.status !== 'granted' && !r.canAsk) promptSettings('grant');
    },
    [busy, status, canAsk, key],
  );

  return { status, busy, set };
}

/* ------------------------------------------------------------- geofencing */

const GEO_HINT: Record<GeofenceState, string> = {
  ready: 'On — you’ll be notified when you reach a located reminder.',
  'needs-location': 'Needs location access.',
  'needs-background': 'Android needs the "Allow all the time" location setting — open system settings to change it.',
  'needs-notifications': 'Needs notification permission.',
  unavailable: 'Not available in this build — rebuild the app to use location reminders.',
};

/** Feature switch: arm/disarm geofenced reminders (walks the whole permission chain). */
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

  useFocusEffect(useCallback(() => refresh(), [refresh]));

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
        } else if (result === 'unavailable') {
          Alert.alert(
            'Rebuild needed',
            'Location reminders need a fresh build of the app before they can be turned on.',
          );
        }
      } else {
        await setGeofencingEnabled(false, reminders);
        setEnabled(false);
      }
    } catch (e) {
      console.warn('location reminders toggle failed', e);
    } finally {
      setBusy(false);
    }
  };

  const on = enabled && state === 'ready';

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[styles.card, styles.featureCard, { backgroundColor: theme.card, borderColor: theme.accent + '40' }]}>
      <View style={styles.rowHead}>
        <Ionicons name="notifications-circle" size={22} color={theme.accent} />
        <View style={styles.headText}>
          <ThemedText style={styles.title}>Location reminders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {busy ? 'Working…' : on ? GEO_HINT.ready : enabled ? GEO_HINT[state] : 'Off'}
          </ThemedText>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <Switch value={on} onValueChange={onToggle} trackColor={{ true: theme.accent }} />
        )}
      </View>
      {enabled && state !== 'ready' && !busy && (
        <Pressable onPress={() => Linking.openSettings()} style={styles.cardAction}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Open system settings
          </ThemedText>
        </Pressable>
      )}
    </Animated.View>
  );
}

/* --------------------------------------------------------- permission card */

function PermissionCard({
  info,
  expanded,
  onExpand,
}: {
  info: PermissionInfo;
  expanded: boolean;
  onExpand: () => void;
}) {
  const theme = useTheme();
  const runtime = (RUNTIME_KEYS as readonly string[]).includes(info.key);
  const { status, busy, set } = usePermission(info.key, runtime);

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.rowHead}>
        <Pressable onPress={onExpand} style={styles.headMain} hitSlop={6}>
          <Ionicons name={info.icon} size={20} color={theme.text} />
          <View style={styles.headText}>
            <ThemedText style={styles.title}>{info.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {runtime ? STATUS_TEXT[status] : grantLabel(info)}
            </ThemedText>
          </View>
        </Pressable>

        {runtime ? (
          busy ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Switch
              value={status === 'granted'}
              onValueChange={set}
              trackColor={{ true: theme.accent }}
            />
          )
        ) : (
          <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {grantLabel(info)}
            </ThemedText>
          </View>
        )}

        <Pressable onPress={onExpand} hitSlop={8}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={[styles.cardBody, { borderTopColor: theme.border }]}>
          <ThemedText type="small">{info.purpose}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {info.detail}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.android}>
            {info.android.join(' · ')}
          </ThemedText>
        </Animated.View>
      )}
    </Animated.View>
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
  featureCard: { borderWidth: 1 },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  headMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headText: { flex: 1, gap: 1 },
  title: { fontWeight: '600' },
  cardAction: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
  },
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
});
