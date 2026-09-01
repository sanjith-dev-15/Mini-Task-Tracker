import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'notes:v1';
const VIEW_KEY = 'notes:view';
const SORT_KEY = 'notes:sort';

/** How the notes list is laid out. */
export type NoteViewMode = 'grid' | 'title' | 'detail' | 'content';

const VIEW_MODES: NoteViewMode[] = ['grid', 'title', 'detail', 'content'];

/** Order the notes list is sorted in. */
export type NoteSortMode = 'updated' | 'created' | 'title';

const SORT_MODES: NoteSortMode[] = ['updated', 'created', 'title'];

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  todos: TodoItem[];
  createdAt: number;
  updatedAt: number;
};

export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyNote(): Note {
  const now = Date.now();
  return { id: createId(), title: '', body: '', todos: [], createdAt: now, updatedAt: now };
}

/** Text preview used in the list when a note has no title. */
export function notePreview(note: Note): string {
  const fromBody = note.body.trim().split('\n')[0];
  if (fromBody) return fromBody;
  const firstTodo = note.todos[0]?.text.trim();
  if (firstTodo) return firstTodo;
  return 'No additional text';
}

type NotesContextValue = {
  notes: Note[];
  loading: boolean;
  getNote: (id: string) => Note | undefined;
  createNote: () => Note;
  updateNote: (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => void;
  deleteNote: (id: string) => void;
  viewMode: NoteViewMode;
  setViewMode: (mode: NoteViewMode) => void;
  sortMode: NoteSortMode;
  setSortMode: (mode: NoteSortMode) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<NoteViewMode>('detail');
  const [sortMode, setSortModeState] = useState<NoteSortMode>('updated');
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [raw, savedView, savedSort] = await AsyncStorage.multiGet([
          STORAGE_KEY,
          VIEW_KEY,
          SORT_KEY,
        ]);
        if (raw[1]) {
          const parsed = JSON.parse(raw[1]) as Note[];
          if (Array.isArray(parsed)) setNotes(parsed);
        }
        if (savedView[1] && VIEW_MODES.includes(savedView[1] as NoteViewMode)) {
          setViewModeState(savedView[1] as NoteViewMode);
        }
        if (savedSort[1] && SORT_MODES.includes(savedSort[1] as NoteSortMode)) {
          setSortModeState(savedSort[1] as NoteSortMode);
        }
      } catch (e) {
        console.warn('Failed to load notes', e);
      } finally {
        hydrated.current = true;
        setLoading(false);
      }
    })();
  }, []);

  const setViewMode = useCallback((mode: NoteViewMode) => {
    setViewModeState(mode);
    AsyncStorage.setItem(VIEW_KEY, mode).catch(() => {});
  }, []);

  const setSortMode = useCallback((mode: NoteSortMode) => {
    setSortModeState(mode);
    AsyncStorage.setItem(SORT_KEY, mode).catch(() => {});
  }, []);

  // Persist whenever notes change (after the initial hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notes)).catch((e) =>
      console.warn('Failed to save notes', e),
    );
  }, [notes]);

  const getNote = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  const createNote = useCallback(() => {
    const note = emptyNote();
    setNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const updateNote = useCallback<NotesContextValue['updateNote']>((id, patch) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
    );
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...notes];
    if (sortMode === 'created') {
      arr.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortMode === 'title') {
      arr.sort((a, b) =>
        (a.title.trim() || notePreview(a)).localeCompare(b.title.trim() || notePreview(b), undefined, {
          sensitivity: 'base',
        }),
      );
    } else {
      arr.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return arr;
  }, [notes, sortMode]);

  const value = useMemo<NotesContextValue>(
    () => ({
      notes: sorted,
      loading,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      viewMode,
      setViewMode,
      sortMode,
      setSortMode,
    }),
    [
      sorted,
      loading,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      viewMode,
      setViewMode,
      sortMode,
      setSortMode,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a NotesProvider');
  return ctx;
}
