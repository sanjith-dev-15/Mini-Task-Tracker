import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGlassAlert } from '@/components/glass-alert';
import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/navigation';
import {
  deleteArea,
  formatBytes,
  OFFLINE_COLOR,
  resumeArea,
  useOfflineAreas,
  type OfflineArea,
} from '@/lib/offline-maps';

/** Downloaded map areas: progress, size, resume and delete. */
export default function OfflineMapsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { areas, loaded } = useOfflineAreas();
  const { alert, showAlert } = useGlassAlert();

  // Opened from the map's "Offline maps" button → back returns to the map;
  // otherwise back to the Settings menu.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromMap = from === 'map';
  const back = useCallback(
    () => (fromMap ? router.navigate('/map') : goBack('/settings')),
    [fromMap],
  );
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [back]),
  );

  const totalBytes = areas.reduce((sum, a) => sum + a.bytes, 0);

  const confirmDelete = (area: OfflineArea) =>
    showAlert({
      title: 'Delete offline map?',
      message: `${area.name} will need internet again to show on the map.`,
      icon: 'trash-outline',
      actions: [
        { label: 'Cancel', style: 'cancel', onPress: () => {} },
        { label: 'Delete', style: 'destructive', onPress: () => deleteArea(area) },
      ],
    });

  const resume = (area: OfflineArea) =>
    resumeArea(area).catch(() =>
      showAlert({
        title: "Couldn't resume",
        message: 'Check your internet connection and try again.',
        icon: 'cloud-offline-outline',
        actions: [{ label: 'OK', onPress: () => {} }],
      }),
    );

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={back}
          accessibilityLabel={fromMap ? 'Back to map' : 'Back to Settings'}
        />
        <ThemedText type="subtitle">Offline maps</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Downloaded areas show the street map with no internet, and are outlined in purple on the
          map. Satellite view and place search still need a connection.
        </ThemedText>

        {!loaded ? (
          <ActivityIndicator color={theme.accent} style={styles.loading} />
        ) : areas.length === 0 ? (
          <View style={[styles.card, styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="cloud-download-outline" size={28} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              No offline maps yet. Open the full-screen map, move to the area you want, and tap the
              download button.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/map')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Ionicons name="map-outline" size={16} color="#fff" />
              <ThemedText type="smallBold" style={styles.white}>
                Open map
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {areas.map((area, i) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  divider={i > 0}
                  onDelete={() => confirmDelete(area)}
                  onResume={() => resume(area)}
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.total}>
              Using {formatBytes(totalBytes)} on this device
            </ThemedText>
          </>
        )}
      </ScrollView>
      {alert}
    </ThemedView>
  );
}

function AreaRow({
  area,
  divider,
  onDelete,
  onResume,
}: {
  area: OfflineArea;
  divider: boolean;
  onDelete: () => void;
  onResume: () => void;
}) {
  const theme = useTheme();
  const pct = Math.floor(area.percentage);
  const status =
    area.state === 'complete'
      ? `${formatBytes(area.bytes)} · Saved ${new Date(area.createdAt).toLocaleDateString()}`
      : area.state === 'downloading'
        ? `Downloading… ${pct}%`
        : area.state === 'error'
          ? `Stopped at ${pct}% — ${area.error ?? 'download failed'}`
          : `Paused at ${pct}%`;

  return (
    <View
      style={[
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}>
      <Ionicons
        name={area.state === 'complete' ? 'map' : 'cloud-download-outline'}
        size={20}
        color={area.state === 'error' ? theme.danger : OFFLINE_COLOR}
        style={styles.rowIcon}
      />
      <View style={styles.flex}>
        <ThemedText numberOfLines={1}>{area.name}</ThemedText>
        <ThemedText
          type="small"
          numberOfLines={2}
          style={{ color: area.state === 'error' ? theme.danger : theme.textSecondary }}>
          {status}
        </ThemedText>
        {area.state !== 'complete' && (
          <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: OFFLINE_COLOR }]} />
          </View>
        )}
      </View>

      {(area.state === 'paused' || area.state === 'error') && (
        <Pressable
          accessibilityLabel={`Resume downloading ${area.name}`}
          onPress={onResume}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="refresh" size={20} color={theme.accent} />
        </Pressable>
      )}
      <Pressable
        accessibilityLabel={`Delete ${area.name}`}
        onPress={onDelete}
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
        <Ionicons name="trash-outline" size={20} color={theme.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  center: { textAlign: 'center' },
  white: { color: '#fff' },
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
  loading: { marginTop: Spacing.four },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  empty: { alignItems: 'center', padding: Spacing.four, gap: Spacing.two },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowIcon: { width: 24 },
  iconBtn: { padding: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 2 },
  total: { textAlign: 'center', marginTop: Spacing.one },
});
