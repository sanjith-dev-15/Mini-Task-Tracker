import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { notePreview, useNotes, type Note, type NoteViewMode } from '@/lib/notes';

function noteDate(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Full multi-line preview text for a note: its body, or its to-do lines. */
function noteBody(note: Note): string {
  const body = note.body.trim();
  if (body) return body;
  if (note.todos.length) return note.todos.map((t) => t.text).join('\n');
  return '';
}

function matches(note: Note, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    note.title.toLowerCase().includes(needle) ||
    note.body.toLowerCase().includes(needle) ||
    note.todos.some((t) => t.text.toLowerCase().includes(needle))
  );
}

const VIEW_OPTIONS: {
  mode: NoteViewMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'grid', label: 'Grid', icon: 'grid-outline' },
  { mode: 'title', label: 'Title', icon: 'list-outline' },
  { mode: 'detail', label: 'Detail', icon: 'reorder-four-outline' },
  { mode: 'content', label: 'Content', icon: 'document-text-outline' },
];

export default function NotesListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { notes, loading, createNote, deleteNote, viewMode, setViewMode } = useNotes();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => notes.filter((n) => matches(n, query)), [notes, query]);

  // Two-column masonry split for grid mode.
  const gridColumns = useMemo(() => {
    const cols: Note[][] = [[], []];
    filtered.forEach((n, i) => cols[i % 2].push(n));
    return cols;
  }, [filtered]);

  const openNote = (noteId: string) =>
    router.push({ pathname: '/notes/[id]', params: { id: noteId } });

  const openNew = () => {
    const note = createNote();
    openNote(note.id);
  };

  const confirmDelete = (note: Note) => {
    Alert.alert('Delete note?', note.title || notePreview(note), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
    ]);
  };

  const bottomPad = insets.bottom + Spacing.six + Spacing.six;

  const emptyText = loading
    ? 'Loading…'
    : query
      ? 'No notes match your search.'
      : 'Tap + to write your first note.';

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={theme.text} />
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Notes
        </ThemedText>
        {notes.length > 0 && (
          <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {notes.length}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.page}>
        <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={17} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        <View style={[styles.viewSwitch, { backgroundColor: theme.backgroundElement }]}>
          {VIEW_OPTIONS.map((opt) => {
            const active = viewMode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${opt.label} view`}
                onPress={() => setViewMode(opt.mode)}
                style={[
                  styles.viewSwitchItem,
                  active && { backgroundColor: theme.card },
                ]}>
                <Ionicons
                  name={opt.icon}
                  size={15}
                  color={active ? theme.accent : theme.textSecondary}
                />
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  style={[
                    styles.viewSwitchLabel,
                    { color: active ? theme.text : theme.textSecondary },
                  ]}>
                  {opt.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.page, styles.listArea]}>
        {filtered.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            {emptyText}
          </ThemedText>
        ) : viewMode === 'grid' ? (
          <ScrollView
            contentContainerStyle={[styles.gridScroll, { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {gridColumns.map((col, ci) => (
              <View key={ci} style={styles.gridColumn}>
                {col.map((note) => (
                  <GridCard
                    key={note.id}
                    note={note}
                    onPress={() => openNote(note.id)}
                    onLongPress={() => confirmDelete(note)}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            key={viewMode}
            data={filtered}
            keyExtractor={(n) => n.id}
            contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const props = {
                note: item,
                onPress: () => openNote(item.id),
                onLongPress: () => confirmDelete(item),
              };
              if (viewMode === 'title') return <TitleRow {...props} />;
              if (viewMode === 'content') return <ContentRow {...props} />;
              return <DetailCard {...props} />;
            }}
          />
        )}
      </View>

      <Pressable
        accessibilityLabel="New note"
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

type CardProps = {
  note: Note;
  onPress: () => void;
  onLongPress: () => void;
};

function useCardText(note: Note) {
  const title = note.title.trim() || notePreview(note);
  const body = noteBody(note);
  const done = note.todos.filter((t) => t.done).length;
  return { title, body, done, total: note.todos.length };
}

/** Grid: a content-preview tile with the title + date underneath, centered. */
function GridCard({ note, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const { title, body } = useCardText(note);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.gridTile, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={14}>
          {body || 'No additional text'}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" numberOfLines={2} style={styles.gridTitle}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.gridDate}>
        {noteDate(note.updatedAt)}
      </ThemedText>
    </Pressable>
  );
}

/** Detail: one wide card with title, date and a body preview stacked inside. */
function DetailCard({ note, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const { title, body, done, total } = useCardText(note);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.detailCard,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="subtitle" numberOfLines={1}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailDate}>
        {noteDate(note.updatedAt)}
      </ThemedText>
      {body ? (
        <ThemedText type="body" themeColor="textSecondary" numberOfLines={6}>
          {body}
        </ThemedText>
      ) : null}
      {total > 0 && (
        <ThemedText type="smallBold" style={{ color: theme.accent, marginTop: Spacing.two }}>
          {done}/{total} done
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Content: a small preview thumbnail on the left, big title + date on the right. */
function ContentRow({ note, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const { title, body } = useCardText(note);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [styles.contentRow, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.contentThumb, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={12}
          style={styles.contentThumbText}>
          {body || 'No additional text'}
        </ThemedText>
      </View>
      <View style={styles.contentMain}>
        <ThemedText numberOfLines={3} style={styles.contentTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.contentDate}>
          {noteDate(note.updatedAt)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Title: a single compact row. */
function TitleRow({ note, onPress, onLongPress }: CardProps) {
  const theme = useTheme();
  const { title } = useCardText(note);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.titleRow,
        { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText type="body" numberOfLines={1} style={styles.titleRowText}>
        {title}
      </ThemedText>
      <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
    </Pressable>
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
  headerTitle: { flex: 1 },
  countPill: {
    minWidth: 26,
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  searchInput: { flex: 1, fontSize: 16, height: '100%' },
  viewSwitch: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    marginBottom: Spacing.three,
  },
  viewSwitchItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.two,
    borderRadius: 9,
  },
  viewSwitchLabel: { fontSize: 12, flexShrink: 1 },
  listArea: { flex: 1 },
  empty: { textAlign: 'center', marginTop: Spacing.six },

  list: { gap: Spacing.two, flexGrow: 1 },

  // Grid
  gridScroll: { flexDirection: 'row', gap: Spacing.three },
  gridColumn: { flex: 1, gap: Spacing.four },
  gridItem: { gap: Spacing.two },
  gridTile: {
    minHeight: 150,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    overflow: 'hidden',
  },
  gridTitle: { textAlign: 'center', fontWeight: '700' },
  gridDate: { textAlign: 'center' },

  // Detail
  detailCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  detailDate: { marginTop: Spacing.half, marginBottom: Spacing.two },

  // Content
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  contentThumb: {
    width: 96,
    height: 132,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    overflow: 'hidden',
  },
  contentThumbText: { fontSize: 7, lineHeight: 9 },
  contentMain: { flex: 1, gap: Spacing.one },
  contentTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  contentDate: { fontSize: 15 },

  // Title
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRowText: { flex: 1 },

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
