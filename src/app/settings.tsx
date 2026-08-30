import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { DrawerToggleButton } from 'expo-router/drawer';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
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
});
