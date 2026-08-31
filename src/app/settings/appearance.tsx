import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemeContext, type ThemeMode } from '@/lib/theme';

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
  const { mode, setMode } = useThemeContext();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={() => router.back()}
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
});
