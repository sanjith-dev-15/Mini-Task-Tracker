import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';

import { useTheme } from '@/hooks/use-theme';

/**
 * Bottom-tab navigator for the "Mini Task Tracker" section (sidebar item #2).
 * Tabs: Home (`/`) and Tasks (`/tasks`). App-wide Settings lives in the sidebar.
 * The header shows a ☰ button that opens the sidebar.
 */
export default function TabsLayout() {
  const colors = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerLeft: () => <DrawerToggleButton tintColor={colors.text} />,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
