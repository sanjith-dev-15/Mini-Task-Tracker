import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  canInstallPackages,
  checkForUpdate,
  downloadUpdate,
  install,
  isSnoozed,
  openInstallSettings,
  snooze,
  updaterSupported,
  type Download,
  type UpdateInfo,
} from '@/lib/app-update';

/** Re-check on foreground at most this often. */
const RECHECK_MS = 30 * 60 * 1000;

type Phase =
  | { kind: 'available' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready'; uri: string; needsPermission: boolean }
  | { kind: 'error'; message: string };

const manualListeners = new Set<() => void>();

/** Settings ▸ "Check for updates": checks now, ignoring "Later", and reports the result. */
export function requestUpdateCheck() {
  manualListeners.forEach((fn) => fn());
}

/**
 * "Software Update" sheet. Checks GitHub for a newer build on launch and when
 * the app returns to the foreground, then downloads the APK with a progress bar
 * and opens Android's installer.
 */
export function UpdatePrompt({ ready }: { ready: boolean }) {
  const theme = useTheme();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'available' });
  const download = useRef<Download | null>(null);
  const lastCheck = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async (manual: boolean) => {
    if (busy.current || download.current) return;
    busy.current = true;
    lastCheck.current = Date.now();
    try {
      const next = await checkForUpdate();
      if (!next) {
        if (manual) {
          Alert.alert(
            updaterSupported ? 'Up to date' : 'Not available',
            updaterSupported
              ? 'You have the latest version of Goku.'
              : 'This build can’t update itself. Install the latest APK once to enable updates.',
          );
        }
        return;
      }
      if (!manual && (await isSnoozed(next.versionCode))) return;
      setInfo(next);
      setPhase({ kind: 'available' });
    } catch {
      if (manual) Alert.alert('Couldn’t check for updates', 'Check your connection and try again.');
    } finally {
      busy.current = false;
    }
  }, []);

  // Automatic check once the splash is gone, then on foreground.
  useEffect(() => {
    // Dev builds (build 1, debug key) can't install CI builds over themselves.
    if (!ready || !updaterSupported || __DEV__) return;
    // Give the launch a moment to settle (splash, permission prompt) first.
    const t = setTimeout(() => check(false), 3000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastCheck.current > RECHECK_MS) check(false);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [ready, check]);

  useEffect(() => {
    const fn = () => check(true);
    manualListeners.add(fn);
    return () => {
      manualListeners.delete(fn);
    };
  }, [check]);

  // Back from the "Install unknown apps" screen → install straight away if allowed.
  useEffect(() => {
    if (phase.kind !== 'ready' || !phase.needsPermission) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && canInstallPackages()) {
        setPhase({ ...phase, needsPermission: false });
        install(phase.uri);
      }
    });
    return () => sub.remove();
  }, [phase]);

  const close = () => {
    download.current?.cancel();
    download.current = null;
    setInfo(null);
  };

  const later = () => {
    if (info) snooze(info.versionCode).catch(() => {});
    close();
  };

  const start = async () => {
    if (!info || download.current) return;
    setPhase({ kind: 'downloading', progress: 0 });
    const d = downloadUpdate(info, (p) =>
      setPhase((cur) => (cur.kind === 'downloading' ? { kind: 'downloading', progress: p } : cur)),
    );
    download.current = d;
    try {
      const uri = await d.done;
      if (download.current !== d || !uri) return; // cancelled
      download.current = null;
      const ok = install(uri);
      setPhase({ kind: 'ready', uri, needsPermission: !ok });
    } catch (e) {
      if (download.current !== d) return;
      download.current = null;
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Download failed' });
    }
  };

  if (!info) return null;

  const label = `Goku ${info.versionName} (build ${info.versionCode})`;
  const subtitle =
    phase.kind === 'downloading'
      ? `Downloading ${label}…`
      : phase.kind === 'ready'
        ? phase.needsPermission
          ? 'Allow Goku to install updates'
          : `${label} is ready to install`
        : phase.kind === 'error'
          ? phase.message
          : `${label} is available · you have build ${info.current}`;
  const progress =
    phase.kind === 'downloading' ? phase.progress : phase.kind === 'ready' ? 1 : null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={later}>
      <View style={styles.scrim}>
        <Animated.View
          entering={FadeInDown.duration(220).springify().damping(20)}
          style={styles.cardWrap}>
          <GlassSurface modal glass="regular" radius={28} style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.center}>
                Software Update
              </ThemedText>
              <ThemedText
                type="small"
                themeColor={phase.kind === 'error' ? undefined : 'textSecondary'}
                style={[styles.center, phase.kind === 'error' && { color: theme.danger }]}>
                {subtitle}
              </ThemedText>
            </View>

            {progress != null && (
              <View style={styles.progressRow}>
                <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                  <View
                    style={[
                      styles.fill,
                      { backgroundColor: theme.accent, width: `${Math.round(progress * 100)}%` },
                    ]}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.percent}>
                  {Math.round(progress * 100)}%
                </ThemedText>
              </View>
            )}

            {info.notes.length > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.backgroundElement }]} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  What’s new
                </ThemedText>
                <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
                  {info.notes.map((n, i) => (
                    <View key={i} style={styles.note}>
                      <Ionicons name="sparkles" size={14} color={theme.accent} style={styles.bullet} />
                      <ThemedText type="small" style={styles.noteText}>
                        {n}
                      </ThemedText>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.actions}>
              {phase.kind === 'downloading' ? (
                <Btn label="Cancel" muted onPress={close} />
              ) : phase.kind === 'ready' ? (
                <>
                  <Btn label="Close" muted onPress={close} />
                  {phase.needsPermission ? (
                    <Btn label="Open settings" onPress={openInstallSettings} />
                  ) : (
                    <Btn label="Install" onPress={() => install(phase.uri)} />
                  )}
                </>
              ) : (
                <>
                  <Btn label="Later" muted onPress={later} />
                  <Btn label={phase.kind === 'error' ? 'Retry' : 'Update'} onPress={start} />
                </>
              )}
            </View>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Btn({ label, muted, onPress }: { label: string; muted?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: muted ? theme.backgroundElement : theme.accent,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: muted ? theme.text : '#fff' }}>
        {label}
      </ThemedText>
    </Pressable>
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
  card: { padding: Spacing.four, gap: Spacing.two },
  header: { alignItems: 'center', gap: Spacing.one },
  center: { textAlign: 'center' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  percent: { minWidth: 36, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two },
  notes: { maxHeight: 220 },
  notesContent: { gap: Spacing.two },
  note: { flexDirection: 'row', gap: Spacing.two },
  bullet: { marginTop: 3 },
  noteText: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
