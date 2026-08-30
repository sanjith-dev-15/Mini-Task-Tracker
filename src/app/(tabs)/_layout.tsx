import { Tabs } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';

import { useTheme } from '@/hooks/use-theme';

/**
 * Bottom-tab navigator for the "Mini Task Tracker" section (sidebar item #2).
 * The tab bar is hidden — navigation is handled by the global <GlassNav> pill
 * rendered in the root layout. The header keeps the ☰ button for the sidebar.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabsLayout() {
  const colors = useTheme();

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerLeft: () => <DrawerToggleButton tintColor={colors.text} />,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
    </Tabs>
  );
}
