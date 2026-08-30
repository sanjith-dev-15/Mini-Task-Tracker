import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { createId, useNotes, type Note, type TodoItem } from '@/lib/notes';

function isBlank(note: Note): boolean {
  return (
    !note.title.trim() &&
    !note.body.trim() &&
    note.todos.every((t) => !t.text.trim())
  );
}

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getNote, updateNote, deleteNote } = useNotes();

  const note = getNote(id);
  const noteRef = useRef<Note | undefined>(note);
  noteRef.current = note;

  // Discard the note on exit if the user never typed anything.
  useEffect(() => {
    return () => {
      const current = noteRef.current;
      if (current && isBlank(current)) deleteNote(current.id);
    };
  }, [deleteNote]);

  if (!note) {
    return (
      <ThemedView style={[styles.screen, styles.centered]}>
        <ThemedText themeColor="textSecondary">This note no longer exists.</ThemedText>
        <Pressable onPress={() => router.replace('/notes')} style={styles.linkBtn}>
          <ThemedText style={{ color: theme.accent }}>Back to notes</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const setTodos = (todos: TodoItem[]) => updateNote(note.id, { todos });

  const addTodo = () =>
    setTodos([...note.todos, { id: createId(), text: '', done: false }]);

  const updateTodo = (todoId: string, patch: Partial<TodoItem>) =>
    setTodos(note.todos.map((t) => (t.id === todoId ? { ...t, ...patch } : t)));

  const removeTodo = (todoId: string) =>
    setTodos(note.todos.filter((t) => t.id !== todoId));

  const confirmDelete = () => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteNote(note.id);
          router.replace('/notes');
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <ThemedText style={[styles.chevron, { color: theme.accent }]}>‹ Notes</ThemedText>
        </Pressable>
        <Pressable onPress={confirmDelete} hitSlop={12} style={styles.headerBtn}>
          <ThemedText style={{ color: theme.danger }}>Delete</ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.five }]}
          keyboardShouldPersistTaps="handled">
          <TextInput
            value={note.title}
            onChangeText={(title) => updateNote(note.id, { title })}
            placeholder="Title"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text }]}
            multiline
          />

          <TextInput
            value={note.body}
            onChangeText={(body) => updateNote(note.id, { body })}
            placeholder="Start writing…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.bodyInput, { color: theme.text }]}
            multiline
            textAlignVertical="top"
          />

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.checklistLabel}>
            CHECKLIST
          </ThemedText>

          {note.todos.map((todo) => (
            <View key={todo.id} style={styles.todoRow}>
              <Pressable
                onPress={() => updateTodo(todo.id, { done: !todo.done })}
                hitSlop={8}
                style={[
                  styles.checkbox,
                  { borderColor: todo.done ? theme.accent : theme.border, backgroundColor: todo.done ? theme.accent : 'transparent' },
                ]}>
                {todo.done && <ThemedText style={styles.checkmark}>✓</ThemedText>}
              </Pressable>
              <TextInput
                value={todo.text}
                onChangeText={(text) => updateTodo(todo.id, { text })}
                placeholder="List item"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.todoInput,
                  {
                    color: todo.done ? theme.textSecondary : theme.text,
                    textDecorationLine: todo.done ? 'line-through' : 'none',
                  },
                ]}
              />
              <Pressable onPress={() => removeTodo(todo.id)} hitSlop={8}>
                <ThemedText style={{ color: theme.textSecondary }}>✕</ThemedText>
              </Pressable>
            </View>
          ))}

          <Pressable onPress={addTodo} style={styles.addRow} hitSlop={8}>
            <ThemedText style={{ color: theme.accent }}>+ Add item</ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  linkBtn: { padding: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerBtn: { paddingVertical: Spacing.one },
  chevron: { fontSize: 17, fontWeight: '500' },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  titleInput: { fontSize: 28, fontWeight: '700', paddingVertical: Spacing.two },
  bodyInput: { fontSize: 16, lineHeight: 24, minHeight: 140, paddingTop: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.three },
  checklistLabel: { letterSpacing: 1, marginBottom: Spacing.two },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  todoInput: { flex: 1, fontSize: 16 },
  addRow: { paddingVertical: Spacing.two, marginTop: Spacing.one },
});
