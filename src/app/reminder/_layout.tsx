import { Stack } from 'expo-router';

/**
 * Navigator for a single Reminder. Pushed from the Home screen (map pins +
 * the reminders list). A plain stack: just the editor (`[id]`).
 */
export default function ReminderLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
