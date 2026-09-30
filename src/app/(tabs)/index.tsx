import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassAlert } from '@/components/glass-alert';
import { OptionsMenu } from '@/components/options-menu';
import { ReminderMap } from '@/components/reminder-map';
import { ReminderRow } from '@/components/reminder-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  useReminders,
  type Reminder,
  type ReminderSortMode,
  type ReminderViewMode,
} from '@/lib/reminders';

const WIDE_BREAKPOINT = 720;

const VIEW_OPTIONS: {
  mode: ReminderViewMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'grid', label: 'Grid', icon: 'grid-outline' },
  { mode: 'grid3', label: 'Grid · 3 columns', icon: 'apps-outline' },
  { mode: 'compact', label: 'Compact', icon: 'list-outline' },
  { mode: 'detail', label: 'Detail', icon: 'reorder-four-outline' },
  { mode: 'notes', label: 'With notes', icon: 'document-text-outline' },
];

const SORT_OPTIONS: {
  mode: ReminderSortMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'due', label: 'Due date', icon: 'alarm-outline' },
  { mode: 'updated', label: 'Last edited', icon: 'time-outline' },
  { mode: 'created', label: 'Date created', icon: 'calendar-outline' },
  { mode: 'title', label: 'Title (A–Z)', icon: 'text-outline' },
];

/**
 * Home — route "/". The app dashboard: a map (pins for located reminders) and
 * the reminders list. Side-by-side on wide screens, stacked in portrait.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    reminders,
    loading,
    createReminder,
    toggleDone,
    deleteReminder,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
  } = useReminders();

  // The ⋯ menu drops down from wherever its button currently sits.
  const menuBtn = useRef<View>(null);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const openMenu = () =>
    menuBtn.current?.measureInWindow((_x, y, _w, h) => setMenuTop(y + h + Spacing.one));

  const wide = width >= WIDE_BREAKPOINT;
  const mapHeight = Math.min(Math.round(height * 0.32), 300);

  const openReminder = (id: string) =>
    router.push({ pathname: '/reminder/[id]', params: { id } });
  // `fresh` tells the editor to discard the reminder on exit unless it's given
  // a title/notes — so an abandoned "new reminder" leaves nothing behind.
  const openNew = () =>
    router.push({ pathname: '/reminder/[id]', params: { id: createReminder().id, fresh: '1' } });
  const addAt = (coord: { lat: number; lng: number }) =>
    router.push({
      pathname: '/reminder/[id]',
      params: { id: createReminder({ location: coord }).id, fresh: '1' },
    });

  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const pending = reminders.filter((r) => !r.done).length;

  const columns = viewMode === 'grid3' ? 3 : viewMode === 'grid' ? 2 : 1;
  const grid = columns > 1;
  // Pad the last grid row with empty cells so its cards keep their width.
  const fillers = grid ? (columns - (reminders.length % columns)) % columns : 0;
  const rows: (Reminder | null)[] = fillers
    ? [...reminders, ...Array<null>(fillers).fill(null)]
    : reminders;

  const list = (
    <FlatList
      // Switching column count needs a fresh list instance.
      key={`cols-${columns}`}
      numColumns={columns}
      columnWrapperStyle={grid ? styles.gridRow : undefined}
      style={styles.flex}
      data={rows}
      keyExtractor={(r, i) => r?.id ?? `filler-${i}`}
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
      renderItem={({ item }) =>
        item == null ? (
          <View style={styles.flex} />
        ) : (
          <ReminderRow
            reminder={item}
            onPress={() => openReminder(item.id)}
            onEdit={() => openReminder(item.id)}
            onDelete={() => setPendingDelete({ id: item.id, title: item.title })}
            onToggle={() => toggleDone(item.id)}
            variant={viewMode}
          />
        )
      }
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
          <View style={styles.listHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.listTitle}>
              REMINDERS
            </ThemedText>
            <Pressable
              ref={menuBtn}
              onPress={openMenu}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="View and sort options"
              style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.5 }]}>
              <Ionicons name="ellipsis-vertical" size={18} color={theme.text} />
            </Pressable>
          </View>
          {list}
        </View>
      </View>

      <OptionsMenu
        visible={menuTop != null}
        top={menuTop ?? 0}
        onClose={() => setMenuTop(null)}
        sections={[
          {
            title: 'VIEW',
            options: VIEW_OPTIONS.map((opt) => ({
              key: opt.mode,
              label: opt.label,
              icon: opt.icon,
              active: viewMode === opt.mode,
              onPress: () => setViewMode(opt.mode),
            })),
          },
          {
            title: 'SORT BY',
            options: SORT_OPTIONS.map((opt) => ({
              key: opt.mode,
              label: opt.label,
              icon: opt.icon,
              active: sortMode === opt.mode,
              onPress: () => setSortMode(opt.mode),
            })),
          },
        ]}
      />

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

      <GlassAlert
        visible={pendingDelete != null}
        icon="trash-outline"
        title="Delete reminder?"
        message={pendingDelete?.title.trim() || 'Untitled reminder'}
        onRequestClose={() => setPendingDelete(null)}
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setPendingDelete(null) },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (pendingDelete) deleteReminder(pendingDelete.id);
              setPendingDelete(null);
            },
          },
        ]}
      />
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
  listPaneStacked: { marginTop: Spacing.two },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.one,
    marginBottom: Spacing.one,
  },
  listTitle: { flex: 1, letterSpacing: 1 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  listPaneWide: { flex: 0, width: 360 },
  listContent: { gap: Spacing.two, flexGrow: 1 },
  gridRow: { gap: Spacing.two },
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
