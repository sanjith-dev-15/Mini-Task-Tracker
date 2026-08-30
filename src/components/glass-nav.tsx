import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeContext } from '@/lib/theme';

type NavItem = {
  label: string;
  route: '/' | '/notes' | '/settings';
  match: (pathname: string) => boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const ITEMS: NavItem[] = [
  { label: 'Home', route: '/', match: (p) => p === '/', icon: 'home-outline', iconActive: 'home' },
  {
    label: 'Notes',
    route: '/notes',
    match: (p) => p.startsWith('/notes'),
    icon: 'reader-outline',
    iconActive: 'reader',
  },
  {
    label: 'Settings',
    route: '/settings',
    match: (p) => p === '/settings',
    icon: 'settings-outline',
    iconActive: 'settings',
  },
];

/**
 * Global floating pill navigation. Rendered once in the root layout so it shows
 * on every screen. Liquid glass on iOS 26+, translucent pill elsewhere.
 */
export function GlassNav() {
  const { colors, scheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isDark = scheme === 'dark';
  const liquid = isLiquidGlassAvailable();
  const fallbackBg = isDark ? 'rgba(24,24,27,0.82)' : 'rgba(255,255,255,0.82)';

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <GlassView
        glassEffectStyle="regular"
        style={[
          styles.bar,
          {
            backgroundColor: liquid ? 'transparent' : fallbackBg,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          },
        ]}>
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const tint = active ? colors.accent : colors.textSecondary;
          return (
            <Pressable
              key={item.route}
              hitSlop={8}
              style={styles.item}
              onPress={() => {
                if (!active) router.navigate(item.route);
              }}>
              <Ionicons name={active ? item.iconActive : item.icon} size={22} color={tint} />
              <ThemedText style={[styles.label, { color: tint }]}>{item.label}</ThemedText>
            </Pressable>
          );
        })}
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 8,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 10 },
    }),
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 2,
    minWidth: 74,
  },
  label: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
});
