import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { folderLabel, useScans } from '@/lib/scans';
import { useThemeContext } from '@/lib/theme';

const MODE_LABEL: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export default function SettingsIndex() {
  const theme = useTheme();
  const { mode } = useThemeContext();
  const { saveDir } = useScans();
  const insets = useSafeAreaInsets();

  const appName = Constants.expoConfig?.name ?? 'App';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={theme.text} />
        <ThemedText type="subtitle">Settings</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <NavRow
            icon="color-palette-outline"
            label="Appearance"
            value={MODE_LABEL[mode]}
            onPress={() => router.push('/settings/appearance')}
          />
          <NavRow
            icon="shield-checkmark-outline"
            label="Permissions"
            onPress={() => router.push('/settings/permissions')}
            divider
          />
          <NavRow
            icon="folder-outline"
            label="Scan storage"
            value={folderLabel(saveDir) ?? 'In app only'}
            onPress={() => router.push('/settings/storage')}
            divider
          />
        </View>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          ABOUT
        </ThemedText>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.flex}>App name</ThemedText>
            <ThemedText themeColor="textSecondary">{appName}</ThemedText>
          </View>
          <View
            style={[
              styles.infoRow,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
            ]}>
            <ThemedText style={styles.flex}>Version</ThemedText>
            <ThemedText themeColor="textSecondary">{version}</ThemedText>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function NavRow({
  icon,
  label,
  value,
  onPress,
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}>
      <Ionicons name={icon} size={20} color={theme.text} style={styles.navIcon} />
      <ThemedText style={styles.flex}>{label}</ThemedText>
      {value && (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      )}
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
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
    gap: Spacing.two,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  navIcon: { width: 24 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  sectionLabel: { letterSpacing: 1, paddingHorizontal: Spacing.one, marginTop: Spacing.four },
});
