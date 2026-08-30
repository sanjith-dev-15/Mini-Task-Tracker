import { Stack } from 'expo-router';

/**
 * Navigator for the Notes section (sidebar item #1).
 * A simple stack: the list (`index`) pushes the editor (`[id]`).
 */
export default function NotesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
