import { Ionicons } from '@expo/vector-icons';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { LayoutRectangle, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeContext } from '@/lib/theme';

type NavItem = {
  label: string;
  route: '/' | '/expenses';
  match: (pathname: string) => boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const ITEMS: NavItem[] = [
  {
    label: 'Home',
    route: '/',
    match: (p) => p === '/',
    icon: 'home-outline',
    iconActive: 'home',
  },
  {
    label: 'Expenses',
    route: '/expenses',
    match: (p) => p.startsWith('/expenses'),
    icon: 'wallet-outline',
    iconActive: 'wallet',
  },
];

// Liquid motion: the edge heading toward the new tab leads on a stiff spring,
// the trailing edge follows on a softer one — so the chip stretches like a
// droplet mid-flight, then settles with a small overshoot.
const LEAD = { damping: 17, stiffness: 320, mass: 0.8 };
const TRAIL = { damping: 15, stiffness: 150, mass: 1 };
/** How much the chip swells while it's moving / being dragged. */
const LIFT = 1.1;

// <GlassNav> is rendered per-screen (inside the drawer's screenLayout, so the
// sidebar scrim covers it). These module-level caches let the sliding chip carry
// its position across those per-screen remounts.
const layoutCache: Record<string, LayoutRectangle> = {};
let lastChip: { x: number; w: number } | null = null;

/** Springs the chip's edges to `[l, r]` with the leading edge ahead. */
function glide(left: SharedValue<number>, right: SharedValue<number>, l: number, r: number) {
  const toRight = l > left.value;
  left.value = withSpring(l, toRight ? TRAIL : LEAD);
  right.value = withSpring(r, toRight ? LEAD : TRAIL);
}

/**
 * Global floating pill navigation. Liquid glass on iOS 26+, translucent pill
 * elsewhere.
 *
 * The active tab sits inside its own rounded glass capsule. Switching tabs makes
 * it flow across like liquid (stretch, swell, settle); it can also be dragged
 * between tabs and lets go on the nearest one — like iOS 26's tab bar.
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

  const left = useSharedValue(lastChip?.x ?? 0);
  const right = useSharedValue(lastChip ? lastChip.x + lastChip.w : 0);
  const lift = useSharedValue(1);
  const shown = useSharedValue(lastChip ? 1 : 0);
  const seeded = useRef(false);
  // Tab under the finger while dragging the chip.
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRoute) {
      // A screen without a tab (Notes, Settings) — nothing to highlight.
      shown.value = withTiming(0, { duration: 150 });
      seeded.current = false;
      return;
    }
    if (!activeLayout) return;
    const l = activeLayout.x;
    const r = activeLayout.x + activeLayout.width;
    if (!seeded.current) {
      seeded.current = true;
      if (lastChip == null) {
        // First ever mount — snap into place.
        left.value = l;
        right.value = r;
      }
      shown.value = withTiming(1, { duration: 150 });
    }
    if (left.value !== l || right.value !== r) {
      glide(left, right, l, r);
      lift.value = withSequence(
        withTiming(LIFT, { duration: 140 }),
        withSpring(1, { damping: 11, stiffness: 220 }),
      );
    }
    lastChip = { x: l, w: activeLayout.width };
  }, [activeRoute, activeLayout, left, right, lift, shown]);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: left.value }, { scale: lift.value }],
    width: Math.max(0, right.value - left.value),
    opacity: shown.value,
  }));

  /** Tab whose centre is closest to `x` (bar coordinates). */
  const nearest = (x: number) => {
    let best: NavItem | null = null;
    let dist = Infinity;
    for (const item of ITEMS) {
      const l = layouts[item.route];
      if (!l) continue;
      const d = Math.abs(l.x + l.width / 2 - x);
      if (d < dist) {
        dist = d;
        best = item;
      }
    }
    return best;
  };

  // Drag the chip across the bar; it follows the finger and lands on the
  // nearest tab. Taps still go to the Pressables (pan needs 8 px to start).
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .onStart(() => {
      shown.set(withTiming(1, { duration: 120 }));
      lift.set(withSpring(LIFT, { damping: 14, stiffness: 260 }));
    })
    .onUpdate((e) => {
      const width = activeLayout?.width ?? right.value - left.value;
      const l = e.x - width / 2;
      glide(left, right, l, l + width);
      const over = nearest(e.x)?.route ?? null;
      if (over !== hover) setHover(over);
    })
    .onFinalize((e) => {
      lift.set(withSpring(1, { damping: 11, stiffness: 220 }));
      setHover(null);
      const target = nearest(e.x);
      const l = target ? layouts[target.route] : activeLayout;
      if (!l) return;
      glide(left, right, l.x, l.x + l.width);
      if (target && target.route !== activeRoute) router.navigate(target.route);
      else if (!activeRoute) shown.set(withTiming(0, { duration: 150 }));
    });

  const onItemLayout = (route: string) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
    const l = e.nativeEvent.layout;
    layoutCache[route] = l;
    setLayouts((prev) => {
      const cur = prev[route];
      if (
        cur &&
        cur.x === l.x &&
        cur.y === l.y &&
        cur.width === l.width &&
        cur.height === l.height
      ) {
        return prev;
      }
      return { ...prev, [route]: l };
    });
  };

  // Hidden where a screen owns the whole view or has its own back nav: the
  // full-screen map, the add-expense sheet, the reminder editor, every Settings
  // sub-page. (Rendered inside the drawer's screen layer, so the drawer scrim
  // covers it when open.)
  if (
    pathname === '/map' ||
    pathname === '/expenses/new' ||
    pathname.startsWith('/reminder/') ||
    pathname.startsWith('/settings/')
  ) {
    return null;
  }

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]} pointerEvents="box-none">
      <GestureDetector gesture={drag}>
        <View collapsable={false}>
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
                  {
                    top: activeLayout?.y ?? 8,
                    height: activeLayout?.height ?? 44,
                  },
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
                const active = hover ? hover === item.route : item.match(pathname);
                const tint = active ? colors.accent : colors.textSecondary;
                return (
                  <Pressable
                    key={item.route}
                    hitSlop={8}
                    onLayout={onItemLayout(item.route)}
                    style={styles.item}
                    onPress={() => {
                      if (!item.match(pathname)) router.navigate(item.route);
                    }}>
                    <TabIcon
                      name={active ? item.iconActive : item.icon}
                      color={tint}
                      active={active}
                    />
                    <ThemedText style={[styles.label, { color: tint }]}>{item.label}</ThemedText>
                  </Pressable>
                );
              })}
            </GlassView>
          </GlassContainer>
        </View>
      </GestureDetector>
    </View>
  );
}

/** Tab glyph that pops (squeeze → springy overshoot) when it becomes active. */
function TabIcon({
  name,
  color,
  active,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  active: boolean;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!active) return;
    scale.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withSpring(1, { damping: 7, stiffness: 320 }),
    );
  }, [active, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
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
