import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { enableGeofencingByDefault } from '@/lib/geofencing';
import {
  applicableRuntimeKeys,
  askPermission,
  isSettingsScreenPermission,
  PERMISSIONS,
  readPermission,
  type PermResult,
  type RuntimeKey,
} from '@/lib/permissions';
import { useReminders } from '@/lib/reminders';

/** Away from the app at least this long → "Not now" expires and we ask again. */
const REASK_AFTER_MS = 30_000;

type Statuses = Partial<Record<RuntimeKey, PermResult>>;

async function readAll(): Promise<Statuses> {
  const entries = await Promise.all(
    applicableRuntimeKeys().map(async (k) => [k, await readPermission(k)] as const),
  );
  return Object.fromEntries(entries);
}

const isMissing =(r: PermResult | undefined) =>
  r != null && r.status !== 'granted' && r.status !== 'unavailable';

/**
 * Asks for every runtime permission the app uses (location, "all the time"
 * location, notifications and — on Android — display over other apps and
 * unrestricted battery). Pops up each time the app is opened while any of them
 * is still missing, and stays away once they're all granted.
 */
export function PermissionGate({ ready }: { ready: boolean }) {
  const theme = useTheme();
  const { reminders, loading } = useReminders();
  const [statuses, setStatuses] = useState<Statuses>({});
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<RuntimeKey | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const keys = applicableRuntimeKeys();

  const refresh = useCallback(() => {
    readAll()
      .then((all) => {
        setStatuses(all);
        setChecked(true);
      })
      .catch(() => {});
  }, []);

  // Once the location chain is granted, switch location reminders on.
  useEffect(() => {
    if (loading || !checked) return;
    enableGeofencingByDefault(reminders).catch(() => {});
  }, [loading, checked, statuses, reminders]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        backgroundedAt.current = Date.now();
      } else if (s === 'active') {
        const away = backgroundedAt.current;
        backgroundedAt.current = null;
        // Opening the app again → ask again. Short trips (a permission dialog,
        // a system settings page) just refresh the list.
        if (away != null && Date.now() - away >= REASK_AFTER_MS) setDismissed(false);
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const missing = keys.filter((k) => isMissing(statuses[k]));
  const visible = ready && checked && !dismissed && missing.length > 0;

  const allow = async (key: RuntimeKey) => {
    if (busy) return;
    const current = statuses[key];
    // Android won't show the dialog again — only system settings can grant it.
    if (current && !current.canAsk && !isSettingsScreenPermission(key)) {
      Linking.openSettings().catch(() => {});
      return;
    }
    setBusy(key);
    try {
      const r = await askPermission(key);
      setStatuses((s) => ({ ...s, [key]: r }));
      if (!isSettingsScreenPermission(key) && r.status !== 'granted' && !r.canAsk) {
        Linking.openSettings().catch(() => {});
      }
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const next = missing[0];
  const nextInfo = PERMISSIONS.find((p) => p.key === next);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setDismissed(true)}>
      <View style={styles.scrim}>
        <Animated.View
          entering={FadeInDown.duration(220).springify().damping(20)}
          style={styles.cardWrap}>
          <GlassSurface glass="regular" radius={28} style={styles.card}>
            <View style={[styles.iconDisc, { backgroundColor: theme.accent + '1F' }]}>
              <Ionicons name="shield-checkmark" size={26} color={theme.accent} />
            </View>
            <ThemedText type="subtitle" style={styles.center}>
              Allow permissions
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Goku needs these so location reminders can pop up when you arrive — even when the
              app is closed.
            </ThemedText>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {keys.map((key) => {
                const info = PERMISSIONS.find((p) => p.key === key);
                const r = statuses[key];
                if (!info || !r || r.status === 'unavailable') return null;
                const granted = r.status === 'granted';
                return (
                  <View
                    key={key}
                    style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons
                      name={info.icon}
                      size={20}
                      color={granted ? theme.textSecondary : theme.text}
                    />
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold">{info.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {info.purpose}
                      </ThemedText>
                    </View>
                    {granted ? (
                      <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                    ) : busy === key ? (
                      <ActivityIndicator size="small" color={theme.textSecondary} />
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Allow ${info.title}`}
                        onPress={() => allow(key)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.pill,
                          { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                        ]}>
                        <ThemedText type="smallBold" style={styles.onAccent}>
                          Allow
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {next && nextInfo && (
              <Pressable
                accessibilityRole="button"
                onPress={() => allow(next)}
                disabled={busy != null}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: theme.accent, opacity: pressed || busy ? 0.85 : 1 },
                ]}>
                <ThemedText type="smallBold" style={styles.onAccent}>
                  {isSettingsScreenPermission(next) ||
                  (statuses[next] && !statuses[next]!.canAsk) ||
                  next === 'background-location'
                    ? `Open settings · ${nextInfo.title}`
                    : `Allow ${nextInfo.title}`}
                </ThemedText>
              </Pressable>
            )}
            <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.later}>
              <ThemedText type="small" themeColor="textSecondary">
                Not now
              </ThemedText>
            </Pressable>
          </GlassSurface>
        </Animated.View>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cardWrap: { width: '100%', maxWidth: 380 },
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
  list: { alignSelf: 'stretch', maxHeight: 360, marginTop: Spacing.two },
  listContent: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
  },
  rowText: { flex: 1, gap: 2 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  onAccent: { color: '#fff' },
  btn: {
    alignSelf: 'stretch',
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  later: { marginTop: Spacing.one, paddingVertical: Spacing.one },
});
