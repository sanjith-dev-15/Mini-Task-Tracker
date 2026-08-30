import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useCallback, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { grantLabel, PERMISSIONS, type PermissionInfo } from '@/lib/permissions';
import { useThemeContext, type ThemeMode } from '@/lib/theme';

const APPEARANCE_OPTIONS: {
  mode: ThemeMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'light', label: 'Light mode', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark mode', icon: 'moon-outline' },
  { mode: 'system', label: 'System default', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { mode, setMode, colors } = useThemeContext();

  const appName = Constants.expoConfig?.name ?? 'App';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={colors.text} />
        <ThemedText type="subtitle">Settings</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.five }]}>
        <Section title="Appearance">
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {APPEARANCE_OPTIONS.map((option, index) => (
              <Pressable
                key={option.mode}
                onPress={() => setMode(option.mode)}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}>
                <Ionicons name={option.icon} size={20} color={colors.text} style={styles.rowIcon} />
                <ThemedText style={styles.rowLabel}>{option.label}</ThemedText>
                {mode === option.mode && (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Permissions">
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionIntro}>
            Everything {appName} asks the system for, and why. Nothing here leaves your device.
          </ThemedText>
          {PERMISSIONS.map((info) => (
            <PermissionCard key={info.key} info={info} />
          ))}
        </Section>

        <Section title="About">
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>App name</ThemedText>
              <ThemedText themeColor="textSecondary">{appName}</ThemedText>
            </View>
            <View
              style={[
                styles.row,
                { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}>
              <ThemedText style={styles.rowLabel}>Version</ThemedText>
              <ThemedText themeColor="textSecondary">{version}</ThemedText>
            </View>
          </View>
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function PermissionCard({ info }: { info: PermissionInfo }) {
  const { colors } = useThemeContext();

  return (
    <View style={[styles.permCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.permHead}>
        <Ionicons name={info.icon} size={20} color={colors.text} />
        <ThemedText style={styles.permTitle}>{info.title}</ThemedText>
        <View style={[styles.badge, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {grantLabel(info)}
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" style={styles.permText}>
        {info.purpose}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.permText}>
        {info.detail}
      </ThemedText>

      {info.key === 'location' && <LocationControl />}

      <ThemedText type="small" themeColor="textSecondary" style={styles.permAndroid}>
        {info.android.join(' · ')}
      </ThemedText>
    </View>
  );
}

type LocState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

function LocationControl() {
  const { colors } = useThemeContext();
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
    granted: { text: 'Allowed', color: colors.accent, action: 'Manage in system settings' },
    undetermined: { text: 'Not asked yet', color: colors.textSecondary, action: 'Allow location' },
    denied: { text: 'Denied', color: colors.danger, action: 'Open system settings' },
    unavailable: { text: 'Not available in this build', color: colors.textSecondary, action: null },
  };
  const m = meta[state];

  return (
    <View style={[styles.locRow, { borderTopColor: colors.border }]}>
      <View style={styles.locStatus}>
        <View style={[styles.dot, { backgroundColor: m.color }]} />
        <ThemedText type="small" style={{ color: m.color }}>
          {m.text}
        </ThemedText>
      </View>
      {m.action && (
        <Pressable onPress={onPress} hitSlop={8} disabled={busy}>
          <ThemedText type="smallBold" style={{ color: colors.accent, opacity: busy ? 0.5 : 1 }}>
            {m.action}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.three,
    paddingBottom: Spacing.two,
  },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 1, paddingHorizontal: Spacing.one },
  sectionIntro: { paddingHorizontal: Spacing.one, marginBottom: Spacing.half },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  rowIcon: { width: 24 },
  rowLabel: { flex: 1 },

  permCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  permHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  permTitle: { flex: 1, fontWeight: '600' },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  permText: { marginTop: 2 },
  permAndroid: { marginTop: Spacing.two, fontSize: 11, opacity: 0.8 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
