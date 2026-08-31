import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { grantLabel, PERMISSIONS, type PermissionInfo } from '@/lib/permissions';

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
