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
  route: '/' | '/notes' | '/expenses';
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
    label: 'Expenses',
    route: '/expenses',
    match: (p) => p.startsWith('/expenses'),
    icon: 'wallet-outline',
    iconActive: 'wallet',
  },
];

const SPRING = { duration: 300, easing: Easing.out(Easing.cubic) };

// <GlassNav> is rendered per-screen (inside the drawer's screenLayout, so the
// sidebar scrim covers it). These module-level caches let the sliding chip carry
// its position across those per-screen remounts.
const layoutCache: Record<string, LayoutRectangle> = {};
let lastChip: { x: number; w: number } | null = null;

/**
 * Global floating pill navigation. Liquid glass on iOS 26+, translucent pill
 * elsewhere.
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

  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>(() => ({
    ...layoutCache,
  }));
  const activeRoute = ITEMS.find((i) => i.match(pathname))?.route;
  const activeLayout = activeRoute ? layouts[activeRoute] : undefined;

  const x = useSharedValue(lastChip?.x ?? 0);
  const w = useSharedValue(lastChip?.w ?? 0);
  const shown = useSharedValue(lastChip ? 1 : 0);
  const seeded = useRef(false);

  useEffect(() => {
    if (!activeLayout) return;
    if (!seeded.current) {
      seeded.current = true;
      if (lastChip == null) {
        // First ever mount — snap into place.
        x.value = activeLayout.x;
        w.value = activeLayout.width;
      }
      shown.value = withTiming(1, { duration: 150 });
    }
    x.value = withTiming(activeLayout.x, SPRING);
    w.value = withTiming(activeLayout.width, SPRING);
    lastChip = { x: activeLayout.x, w: activeLayout.width };
  }, [activeLayout, w, x, shown]);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: shown.value,
  }));

  const onItemLayout = (route: string) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
    const l = e.nativeEvent.layout;
    layoutCache[route] = l;
    setLayouts((prev) => {
      const cur = prev[route];
      if (cur && cur.x === l.x && cur.y === l.y && cur.width === l.width && cur.height === l.height) {
        return prev;
      }
      return { ...prev, [route]: l };
    });
  };

  // Hidden where a screen owns the whole view or has its own back nav: the
  // full-screen map, the add-expense sheet, every Settings sub-page. (Rendered
  // inside the drawer's screen layer, so the drawer scrim covers it when open.)
  if (
    pathname === '/map' ||
    pathname === '/expenses/new' ||
    pathname.startsWith('/settings/')
  ) {
    return null;
  }

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
