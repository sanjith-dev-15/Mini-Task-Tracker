import { Stack } from 'expo-router';

/** Settings section: a menu (`index`) that pushes Appearance and Permissions. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
