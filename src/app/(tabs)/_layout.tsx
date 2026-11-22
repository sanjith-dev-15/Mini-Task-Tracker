import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * Bottom-tab navigator for the "Mini Task Tracker" (Home) section.
 * The tab bar is hidden — navigation is handled by the global <GlassNav> pill
 * rendered in the root layout.
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
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
    </Tabs>
  );
}
