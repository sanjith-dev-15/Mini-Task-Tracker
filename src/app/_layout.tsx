import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router';
import {
  Drawer,
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { GlassNav } from '@/components/glass-nav';
import { Spacing } from '@/constants/theme';
import { NotesProvider } from '@/lib/notes';
import { RemindersProvider } from '@/lib/reminders';
import { ScansProvider } from '@/lib/scans';
import { ThemeProvider, useThemeContext } from '@/lib/theme';

// Keep the native splash up until <AnimatedSplash> takes over.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout.
 * - Global providers: safe area, gestures, theme, notes store.
 * - The sidebar (Drawer): Notes + Mini Task Tracker at the top, Settings pinned
 *   to the bottom (see `SidebarContent`).
 * The app opens on the Mini Task Tracker Home tab (see `unstable_settings`).
 */
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NotesProvider>
            <RemindersProvider>
              <ScansProvider>
                <ThemedRoot />
              </ScansProvider>
            </RemindersProvider>
          </NotesProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </GestureHandlerRootView>
  );
}

function ThemedRoot() {
  const { scheme, colors } = useThemeContext();
  const isDark = scheme === 'dark';

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Drawer
        drawerContent={(props) => <SidebarContent {...props} />}
        initialRouteName="(tabs)"
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          drawerStyle: { backgroundColor: colors.card, width: 260 },
          drawerType: 'front',
        }}>
        <Drawer.Screen name="notes" options={{ title: 'Notes' }} />
        <Drawer.Screen name="(tabs)" options={{ title: 'Mini Task Tracker' }} />
        <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
        <Drawer.Screen
          name="reminder"
          options={{ title: 'Reminder', drawerItemStyle: { display: 'none' } }}
        />
        <Drawer.Screen
          name="map"
          options={{ title: 'Map', drawerItemStyle: { display: 'none' } }}
        />
        <Drawer.Screen
          name="scan"
          options={{ title: 'Scan', drawerItemStyle: { display: 'none' } }}
        />
      </Drawer>
      <GlassNav />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

const SIDEBAR_ITEMS: {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'notes', label: 'Notes', icon: 'document-text-outline' },
  { name: '(tabs)', label: 'Mini Task Tracker', icon: 'checkbox-outline' },
];

function SidebarContent(props: DrawerContentComponentProps) {
  const { colors } = useThemeContext();
  const { state, navigation } = props;
  const currentRoute = state.routes[state.index]?.name;

  const renderItem = (name: string, label: string, icon: keyof typeof Ionicons.glyphMap) => (
    <DrawerItem
      key={name}
      label={label}
      focused={currentRoute === name}
      activeTintColor={colors.accent}
      inactiveTintColor={colors.textSecondary}
      activeBackgroundColor={colors.backgroundSelected}
      icon={({ color, size }) => <Ionicons name={icon} size={size} color={color} />}
      onPress={() => navigation.navigate(name)}
    />
  );

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
      <View>{SIDEBAR_ITEMS.map((item) => renderItem(item.name, item.label, item.icon))}</View>

      <View style={[styles.drawerFooter, { borderTopColor: colors.border }]}>
        {renderItem('settings', 'Settings', 'settings-outline')}
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  drawerContent: { flex: 1 },
  drawerFooter: {
    marginTop: 'auto',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one,
  },
});
