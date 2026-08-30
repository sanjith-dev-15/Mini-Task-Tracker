import { Ionicons } from '@expo/vector-icons';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { LayoutRectangle, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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

const SPRING = { duration: 300, easing: Easing.out(Easing.cubic) };

/**
 * Global floating pill navigation. Rendered once in the root layout so it shows
 * on every screen. Liquid glass on iOS 26+, translucent pill elsewhere.
 *
 * The active tab sits inside its own rounded glass capsule that slides
 * smoothly to whichever tab you switch to — a second glass layer on iOS 26
 * (so it morphs against the bar), a tinted translucent chip everywhere else.
 */
export function GlassNav() {
  const { colors, scheme } = useThemeContext();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isDark = scheme === 'dark';
  const liquid = isLiquidGlassAvailable();
  const fallbackBg = isDark ? 'rgba(24,24,27,0.82)' : 'rgba(255,255,255,0.82)';
  const chipBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)';
  const chipBorder = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';

  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const activeRoute = ITEMS.find((i) => i.match(pathname))?.route;
  const activeLayout = activeRoute ? layouts[activeRoute] : undefined;

  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const shown = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (!activeLayout) return;
    if (first.current) {
      x.value = activeLayout.x;
      w.value = activeLayout.width;
      shown.value = withTiming(1, { duration: 150 });
      first.current = false;
    } else {
      x.value = withTiming(activeLayout.x, SPRING);
      w.value = withTiming(activeLayout.width, SPRING);
    }
  }, [activeLayout, w, x, shown]);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: shown.value,
  }));

  const onItemLayout = (route: string) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
    const l = e.nativeEvent.layout;
    setLayouts((prev) => {
      const cur = prev[route];
      if (cur && cur.x === l.x && cur.y === l.y && cur.width === l.width && cur.height === l.height) {
        return prev;
      }
      return { ...prev, [route]: l };
    });
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <GlassContainer spacing={18}>
        <GlassView
          glassEffectStyle="regular"
          style={[
            styles.bar,
            {
              backgroundColor: liquid ? 'transparent' : fallbackBg,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
          ]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.chip,
              { top: activeLayout?.y ?? 8, height: activeLayout?.height ?? 44 },
              chipStyle,
            ]}>
            {liquid ? (
              <GlassView
                glassEffectStyle="clear"
                isInteractive
                tintColor={colors.accent + '26'}
                style={styles.chipFill}
              />
            ) : (
              <View
                style={[
                  styles.chipFill,
                  styles.chipFallback,
                  { backgroundColor: chipBg, borderColor: chipBorder },
                ]}
              />
            )}
          </Animated.View>

          {ITEMS.map((item) => {
            const active = item.match(pathname);
            const tint = active ? colors.accent : colors.textSecondary;
            return (
              <Pressable
                key={item.route}
                hitSlop={8}
                onLayout={onItemLayout(item.route)}
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
      </GlassContainer>
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
    minWidth: 64,
  },
  chip: {
    position: 'absolute',
    left: 0,
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipFill: {
    flex: 1,
    borderRadius: 22,
  },
  chipFallback: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
});
