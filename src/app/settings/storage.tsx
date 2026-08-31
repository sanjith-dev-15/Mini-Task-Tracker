import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { folderLabel, useScans } from '@/lib/scans';

export default function ScanStorageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { saveDir, autoExport, setAutoExport, chooseSaveDir, clearSaveDir } = useScans();
  const [busy, setBusy] = useState(false);

  const label = folderLabel(saveDir);

  const pick = async () => {
    if (busy) return;
    setBusy(true);
    const dir = await chooseSaveDir();
    setBusy(false);
    if (!dir) Alert.alert('No folder chosen', 'Pick a folder to let the app save PDFs there.');
  };

  const clear = () => {
    Alert.alert('Remove folder?', 'New scans will only be kept inside the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: clearSaveDir },
    ]);
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={() => router.back()}
          accessibilityLabel="Back to Settings"
        />
        <ThemedText type="subtitle">Scan storage</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Scans are always kept inside the app. You can also pick a folder on this device to save a
          copy of each PDF as a normal file.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.row}>
            <Ionicons name="folder-outline" size={20} color={theme.text} style={styles.rowIcon} />
            <View style={styles.flex}>
              <ThemedText>Save folder</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {label ?? 'Not set'}
              </ThemedText>
            </View>
          </View>

          <Pressable
            onPress={pick}
            disabled={busy}
            style={({ pressed }) => [
              styles.row,
              styles.divider,
              { borderTopColor: theme.border },
              pressed && { backgroundColor: theme.backgroundElement },
            ]}>
            <Ionicons name="folder-open-outline" size={20} color={theme.accent} style={styles.rowIcon} />
            <ThemedText style={[styles.flex, { color: theme.accent }]}>
              {label ? 'Choose a different folder' : 'Choose folder'}
            </ThemedText>
          </Pressable>

          {saveDir && (
            <Pressable
              onPress={clear}
              style={({ pressed }) => [
                styles.row,
                styles.divider,
                { borderTopColor: theme.border },
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              <Ionicons name="close-circle-outline" size={20} color={theme.danger} style={styles.rowIcon} />
              <ThemedText style={[styles.flex, { color: theme.danger }]}>Remove folder</ThemedText>
            </Pressable>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.row}>
            <Ionicons name="save-outline" size={20} color={theme.text} style={styles.rowIcon} />
            <View style={styles.flex}>
              <ThemedText>Auto-save to folder</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Copy every scan to the folder when you save it.
              </ThemedText>
            </View>
            <Switch
              value={autoExport && saveDir != null}
              disabled={saveDir == null}
              onValueChange={setAutoExport}
              trackColor={{ true: theme.accent }}
            />
          </View>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Android asks you to pick the folder — that grant is how the app gets to write there. No
          other storage permission is used.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
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
    gap: Spacing.three,
  },
  intro: { paddingHorizontal: Spacing.one },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 24 },
  note: { paddingHorizontal: Spacing.one },
});
