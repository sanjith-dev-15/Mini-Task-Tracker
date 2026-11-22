import { Stack } from 'expo-router';

/**
 * Settings section: a menu (`index`) that pushes Appearance, Permissions and
 * Offline maps. The menu is always the bottom of the stack — even when a
 * sub-page is opened directly (e.g. Offline maps from the map) — so the Settings
 * tab in the nav pill always lands back on it.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
