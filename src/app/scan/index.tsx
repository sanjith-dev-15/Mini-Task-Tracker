import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildScanPdf, useScans, type Scan } from '@/lib/scans';

/** Launch the ML Kit document scanner. Returns page image URIs, or null. */
async function launchScanner(): Promise<string[] | null> {
  try {
    // Lazy require: the Turbo Module only exists in a native build (not web/Expo Go).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentScanner = require('react-native-document-scanner-plugin').default;
    const { scannedImages, status } = await DocumentScanner.scanDocument({
      croppedImageQuality: 80,
    });
    if (status === 'success' && Array.isArray(scannedImages) && scannedImages.length) {
      return scannedImages as string[];
    }
    return null;
  } catch (e) {
    console.warn('Document scanner failed', e);
    Alert.alert('Scanner unavailable', 'The document scanner could not start on this device.');
    return null;
  }
}

function scanDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ScanScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { scans, loading, addScan, renameScan, deleteScan, saveDir, autoExport, exportToDevice } =
    useScans();

  const [pending, setPending] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<Scan | null>(null);
  const [renameText, setRenameText] = useState('');

  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    const pages = await launchScanner();
    setScanning(false);
    if (pages) setPending((prev) => [...prev, ...pages]);
  };

  const removePage = (index: number) =>
    setPending((prev) => prev.filter((_, i) => i !== index));

  const discard = () => {
    setPending([]);
    setTitle('');
  };

  const save = async () => {
    if (saving || pending.length === 0) return;
    setSaving(true);
    try {
      const { uri, pageCount } = await buildScanPdf(pending);
      const saved = await addScan(uri, pageCount, title);
      discard();

      let extra = '';
      if (autoExport && saveDir) {
        const res = await exportToDevice(saved);
        extra = res.ok ? `\nSaved to ${res.folder}.` : '\nCould not save to the folder.';
      }
      Alert.alert(
        'Saved',
        `“${saved.title}” · ${pageCount} page${pageCount === 1 ? '' : 's'}${extra}`,
        [
          { text: 'Done', style: 'cancel' },
          { text: 'Save to device', onPress: () => saveToDevice(saved) },
          { text: 'Share', onPress: () => share(saved.uri) },
        ],
        { cancelable: true },
      );
    } catch (e) {
      console.warn('Failed to build PDF', e);
      Alert.alert('Could not save', 'Building the PDF failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const share = async (uri: string) => {
    if (!(await Sharing.isAvailableAsync())) return;
    Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }).catch(() => {});
  };

  const saveToDevice = async (item: Scan) => {
    const res = await exportToDevice(item);
    if (res.ok) Alert.alert('Saved to device', `“${item.title}” was saved to ${res.folder}.`);
    else if (res.reason === 'no-folder')
      Alert.alert('No folder chosen', 'Pick a folder to save PDFs to your device.');
    else Alert.alert('Could not save', 'Writing the file to the folder failed.');
  };

  const scanRowMenu = (item: Scan) => {
    Alert.alert(
      item.title,
      `${item.pageCount} page${item.pageCount === 1 ? '' : 's'} · ${scanDate(item.createdAt)}`,
      [
        { text: 'Save to device', onPress: () => saveToDevice(item) },
        { text: 'Rename', onPress: () => renamePrompt(item) },
        { text: 'Delete', style: 'destructive', onPress: () => deleteScan(item.id) },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const renamePrompt = (item: Scan) => {
    setRenameText(item.title);
    setRenaming(item);
  };

  const commitRename = () => {
    if (renaming && renameText.trim()) renameScan(renaming.id, renameText);
    setRenaming(null);
  };

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={[styles.screen, styles.centered]}>
        <Ionicons name="scan-outline" size={32} color={theme.textSecondary} />
        <ThemedText themeColor="textSecondary">Document scanning is available in the app.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={theme.text} />
        <ThemedText type="subtitle">Scan</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six + Spacing.six }]}
        keyboardShouldPersistTaps="handled">
        {pending.length === 0 ? (
          <Pressable
            onPress={scan}
            style={({ pressed }) => [
              styles.startCard,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            {scanning ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={30} color={theme.accent} />
            )}
            <ThemedText type="subtitle">Scan a document</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.startHint}>
              Capture pages one after another, then save them as a PDF.
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.working}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
              {pending.length} PAGE{pending.length === 1 ? '' : 'S'}
            </ThemedText>

            <View style={styles.grid}>
              {pending.map((uri, index) => (
                <View key={`${uri}-${index}`} style={[styles.thumb, { borderColor: theme.border }]}>
                  <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
                  <View style={[styles.pageBadge, { backgroundColor: theme.card }]}>
                    <ThemedText type="smallBold">{index + 1}</ThemedText>
                  </View>
                  <Pressable
                    onPress={() => removePage(index)}
                    hitSlop={6}
                    style={[styles.removeBtn, { backgroundColor: theme.danger }]}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={scan}
                style={({ pressed }) => [
                  styles.thumb,
                  styles.addTile,
                  { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                {scanning ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <Ionicons name="add" size={24} color={theme.accent} />
                    <ThemedText type="small" themeColor="textSecondary">
                      Add pages
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </View>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Scan name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.titleInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />

            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.accent, opacity: pressed || saving ? 0.8 : 1 },
              ]}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="document" size={18} color="#fff" />
                  <ThemedText type="smallBold" style={styles.saveText}>
                    Save as PDF
                  </ThemedText>
                </>
              )}
            </Pressable>

            <Pressable onPress={discard} style={styles.discardBtn} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.danger }}>
                Discard
              </ThemedText>
            </Pressable>
          </View>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          SAVED SCANS
        </ThemedText>
        <FlatList
          scrollEnabled={false}
          data={scans}
          keyExtractor={(s) => s.id}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {loading ? 'Loading…' : 'Saved PDFs will appear here.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => share(item.uri)}
              onLongPress={() => scanRowMenu(item)}
              delayLongPress={300}
              style={({ pressed }) => [
                styles.scanRow,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Ionicons name="document-text" size={22} color={theme.accent} />
              <View style={styles.scanInfo}>
                <ThemedText numberOfLines={1}>{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.pageCount} page{item.pageCount === 1 ? '' : 's'} · {scanDate(item.createdAt)}
                </ThemedText>
              </View>
              <Pressable onPress={() => scanRowMenu(item)} hitSlop={10}>
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
              </Pressable>
            </Pressable>
          )}
        />
      </ScrollView>

      {pending.length === 0 && (
        <Pressable
          accessibilityLabel="Scan a document"
          onPress={scan}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.accent,
              bottom: insets.bottom + Spacing.six + Spacing.three,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons name="scan" size={26} color="#fff" />
        </Pressable>
      )}

      <Modal visible={renaming != null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.modalScrim} onPress={() => setRenaming(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Rename scan</ThemedText>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={commitRename}
              placeholder="Scan name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.titleInput,
                { backgroundColor: theme.backgroundElement, color: theme.text, marginTop: Spacing.three },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenaming(null)} hitSlop={8} style={styles.modalBtn}>
                <ThemedText themeColor="textSecondary">Cancel</ThemedText>
              </Pressable>
              <Pressable onPress={commitRename} hitSlop={8} style={styles.modalBtn}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Save
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
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
  },
  startCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  startHint: { textAlign: 'center' },
  working: { gap: Spacing.two },
  sectionLabel: { letterSpacing: 1, marginTop: Spacing.four, marginBottom: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: {
    width: '31%',
    aspectRatio: 0.72,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImg: { flex: 1 },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  pageBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  removeBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    marginTop: Spacing.two,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 14,
    marginTop: Spacing.two,
  },
  saveText: { color: '#fff' },
  discardBtn: { alignSelf: 'center', paddingVertical: Spacing.two },
  empty: { paddingVertical: Spacing.three },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  scanInfo: { flex: 1, gap: 2 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
  modalBtn: { paddingVertical: Spacing.one },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
