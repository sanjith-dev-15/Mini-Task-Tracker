import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Home screen — route "/".
 * Phase 1: placeholder. Phase 2 adds the greeting, today's task counts,
 * and a short list of today's tasks.
 */
export default function HomeScreen() {
  return (
    <ThemedView style={styles.screen}>
      <ThemedText type="subtitle">Home</ThemedText>
      <ThemedText themeColor="textSecondary">Coming in Phase 2</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
});
