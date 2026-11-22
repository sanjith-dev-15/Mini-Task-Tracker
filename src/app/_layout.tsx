import { DarkTheme, DefaultTheme, Tabs, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { ArrivalModal } from '@/components/arrival-modal';
import { GlassNav } from '@/components/glass-nav';
import { PermissionGate } from '@/components/permission-gate';
import { UpdatePrompt } from '@/components/update-prompt';
import { AuthProvider } from '@/lib/auth';
import { ExpensesProvider } from '@/lib/expenses';
// Registers the geofencing background task + notification handler at module load.
import { syncGeofences } from '@/lib/geofencing';
import { NotesProvider } from '@/lib/notes';
import { RemindersProvider, useReminders } from '@/lib/reminders';
import { useBankSmsAutoImport } from '@/lib/sms-auto-import';
import { ThemeProvider, useThemeContext } from '@/lib/theme';

// Keep the native splash up until <AnimatedSplash> takes over.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout.
 * - Global providers: safe area, gestures, theme, notes store.
 * - Top-level sections (Home, Notes, Expenses, Settings) are switched with the
 *   floating <GlassNav> pill; the navigator's own tab bar is hidden.
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
          <AuthProvider>
            <NotesProvider>
              <RemindersProvider>
                <ExpensesProvider>
                  <GeofenceSync />
                  <BankSmsSync />
                  <ThemedRoot />
                  <PermissionGate ready={splashDone} />
                  <UpdatePrompt ready={splashDone} />
                </ExpensesProvider>
              </RemindersProvider>
            </NotesProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </GestureHandlerRootView>
  );
}

/** Keeps the registered geofences in step with located reminders. */
function GeofenceSync() {
  const { reminders } = useReminders();
  useEffect(() => {
    syncGeofences(reminders).catch(() => {});
  }, [reminders]);
  return null;
}

/** Adds bank debit SMS to Expenses as they arrive (when turned on in Import from SMS). */
function BankSmsSync() {
  useBankSmsAutoImport();
  return null;
}

/**
 * Wraps every top-level screen with the floating <GlassNav> pill, so it sits in
 * the screen layer (under modals) rather than floating above everything.
 */
function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screenFrame}>
      {children}
      <GlassNav />
    </View>
  );
}

function ThemedRoot() {
  const { scheme, colors } = useThemeContext();
  const isDark = scheme === 'dark';

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Tabs
        initialRouteName="(tabs)"
        backBehavior="initialRoute"
        tabBar={() => null}
        screenLayout={({ children }) => <ScreenFrame>{children}</ScreenFrame>}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}>
        <Tabs.Screen name="(tabs)" options={{ title: 'Mini Task Tracker' }} />
        <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
        <Tabs.Screen name="expenses" options={{ title: 'Expenses' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="reminder" options={{ title: 'Reminder' }} />
        <Tabs.Screen name="map" options={{ title: 'Map' }} />
      </Tabs>
      <ArrivalModal />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

const styles = StyleSheet.create({
  screenFrame: { flex: 1 },
});
