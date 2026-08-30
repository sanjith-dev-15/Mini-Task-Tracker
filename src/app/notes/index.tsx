import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notePreview, useNotes, type Note } from '@/lib/notes';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
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

export default function NotesListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { notes, loading, createNote, deleteNote } = useNotes();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => notes.filter((n) => matches(n, query)), [notes, query]);

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

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.inner, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.topRow}>
          <DrawerToggleButton tintColor={theme.text} />
          <Pressable
            accessibilityLabel="New note"
            onPress={openNew}
            hitSlop={10}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>

        <ThemedText type="title" style={styles.heading}>
          Notes
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subheading}>
          {notes.length === 0
            ? 'Nothing yet'
            : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        </ThemedText>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />

        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + Spacing.six + Spacing.four },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {loading
                ? 'Loading…'
                : query
                  ? 'No notes match your search.'
                  : 'Tap + to write your first note.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <NoteCard
              note={item}
              onPress={() => openNote(item.id)}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      </View>
    </ThemedView>
  );
}

function NoteCard({
  note,
  onPress,
  onLongPress,
}: {
  note: Note;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const doneCount = note.todos.filter((t) => t.done).length;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="subtitle" numberOfLines={1}>
        {note.title.trim() || notePreview(note)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.cardPreview}>
        {note.title.trim() ? notePreview(note) : note.body.trim() || ' '}
      </ThemedText>
      <View style={styles.cardMeta}>
        <ThemedText type="small" themeColor="textSecondary">
          {relativeTime(note.updatedAt)}
        </ThemedText>
        {note.todos.length > 0 && (
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {doneCount}/{note.todos.length} done
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { marginTop: Spacing.one },
  subheading: { marginTop: Spacing.half, marginBottom: Spacing.three },
  search: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    marginBottom: Spacing.three,
  },
  list: { gap: Spacing.two, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardPreview: { minHeight: 18 },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
