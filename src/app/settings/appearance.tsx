import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/navigation';
import { MODAL_OPACITY_LEVELS, useThemeContext, type ThemeMode } from '@/lib/theme';

const OPACITY_HINT: Record<number, string> = {
  1: 'Most see-through',
  2: 'Default glass',
  3: 'Easier to read',
  4: 'Mostly solid',
  5: 'Solid',
};

const OPTIONS: {
  mode: ThemeMode;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'light', label: 'Light', hint: 'Always light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', hint: 'Always dark', icon: 'moon-outline' },
  { mode: 'system', label: 'System default', hint: 'Follows your device', icon: 'phone-portrait-outline' },
];

export default function AppearanceScreen() {
  const theme = useTheme();
  const { mode, setMode, modalOpacity, setModalOpacity } = useThemeContext();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={() => goBack('/settings')}
          accessibilityLabel="Back to Settings"
        />
        <ThemedText type="subtitle">Appearance</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {OPTIONS.map((option, index) => (
            <Pressable
              key={option.mode}
              onPress={() => setMode(option.mode)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
                pressed && { backgroundColor: theme.backgroundElement },
              ]}>
              <Ionicons name={option.icon} size={20} color={theme.text} style={styles.rowIcon} />
              <View style={styles.flex}>
                <ThemedText>{option.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {option.hint}
                </ThemedText>
              </View>
              {mode === option.mode && (
                <Ionicons name="checkmark" size={20} color={theme.accent} />
              )}
            </Pressable>
          ))}
        </View>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          POPUP OPACITY
        </ThemedText>
        <View
          style={[
            styles.card,
            styles.opacityCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            Make popups and menus more solid if their text is hard to read.
          </ThemedText>

          {/* Live preview: a glass card over colour, like a real popup. */}
          <View style={styles.preview}>
            <View style={[styles.blob, styles.blobA]} />
            <View style={[styles.blob, styles.blobB]} />
            <View style={[styles.blob, styles.blobC]} />
            <GlassSurface modal glass="regular" radius={18} style={styles.previewCard}>
              <ThemedText type="smallBold">Reminder</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                This is how popup text will look.
              </ThemedText>
            </GlassSurface>
          </View>

          <View style={styles.levels}>
            {MODAL_OPACITY_LEVELS.map((level) => {
              const active = modalOpacity === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setModalOpacity(level)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Popup opacity level ${level}`}
                  style={({ pressed }) => [
                    styles.level,
                    {
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={active ? styles.levelActive : undefined}>
                    {level}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.levelHint}>
            Level {modalOpacity} · {OPACITY_HINT[modalOpacity]}
          </ThemedText>
        </View>
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
  },
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
  rowIcon: { width: 24 },
  sectionLabel: { letterSpacing: 1, paddingHorizontal: Spacing.one, marginTop: Spacing.four, marginBottom: Spacing.two },
  opacityCard: { padding: Spacing.three, gap: Spacing.three },
  preview: {
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  blobA: { backgroundColor: '#F26722', left: -10, top: -30 },
  blobB: { backgroundColor: '#3C87F7', right: 10, bottom: -40 },
  blobC: { backgroundColor: '#30A46C', left: '40%', top: 20, width: 80, height: 80 },
  previewCard: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
  levels: { flexDirection: 'row', gap: Spacing.two },
  level: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelActive: { color: '#fff' },
  levelHint: { textAlign: 'center' },
});
