import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Tasks screen — route "/tasks".
 * Phase 1: placeholder. Later phases add the task list, add-task UI,
 * toggle/delete, and the empty state.
 */
export default function TasksScreen() {
  return (
    <ThemedView style={styles.screen}>
      <ThemedText type="subtitle">Tasks</ThemedText>
      <ThemedText themeColor="textSecondary">Coming in Phase 2</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
});
