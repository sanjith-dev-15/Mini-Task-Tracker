import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReminderMap } from '@/components/reminder-map';
import { ReminderRow } from '@/components/reminder-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReminders } from '@/lib/reminders';

const WIDE_BREAKPOINT = 720;

/**
 * Home — route "/". The app dashboard: a map (pins for located reminders) and
 * the reminders list. Side-by-side on wide screens, stacked in portrait.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { reminders, loading, createReminder, toggleDone } = useReminders();

  const wide = width >= WIDE_BREAKPOINT;
  const mapHeight = Math.min(Math.round(height * 0.32), 300);

  const openReminder = (id: string) =>
    router.push({ pathname: '/reminder/[id]', params: { id } });
  const openNew = () => openReminder(createReminder().id);
  const addAt = (coord: { lat: number; lng: number }) =>
    openReminder(createReminder({ location: coord }).id);

  const pending = reminders.filter((r) => !r.done).length;

  const list = (
    <FlatList
      style={styles.flex}
      data={reminders}
      keyExtractor={(r) => r.id}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + Spacing.six + Spacing.six },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          {loading ? 'Loading…' : 'Tap + to add your first reminder.'}
        </ThemedText>
      }
      renderItem={({ item }) => (
        <ReminderRow
          reminder={item}
          onPress={() => openReminder(item.id)}
          onLongPress={() => openReminder(item.id)}
          onToggle={() => toggleDone(item.id)}
        />
      )}
    />
  );

  const map = (
    <ReminderMap
      reminders={reminders}
      onPressPin={openReminder}
      onLongPressMap={addAt}
      onExpand={() => router.push('/map')}
      style={wide ? styles.flex : { height: mapHeight }}
    />
  );

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={theme.text} />
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Home
        </ThemedText>
        {reminders.length > 0 && (
          <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {pending ? `${pending} left` : 'All done'}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={[styles.page, styles.flex, wide && styles.row]}>
        {map}
        <View
          style={[styles.flex, wide ? styles.listPaneWide : styles.listPaneStacked]}>
          {list}
        </View>
      </View>

      <Pressable
        accessibilityLabel="New reminder"
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + Spacing.six + Spacing.three,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </ThemedView>
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
  headerTitle: { flex: 1 },
  countPill: {
    height: 22,
    borderRadius: 11,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  row: { flexDirection: 'row', gap: Spacing.three },
  listPaneStacked: { marginTop: Spacing.three },
  listPaneWide: { flex: 0, width: 360 },
  listContent: { gap: Spacing.two, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: Spacing.six },
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
