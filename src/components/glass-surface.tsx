import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { MODAL_FALLBACK_ALPHA, MODAL_LIQUID_ALPHA, useThemeContext } from '@/lib/theme';

type Props = ViewProps & {
  /** 'regular' frosted panel (default) or 'clear' for a lighter tint. */
  glass?: 'regular' | 'clear';
  /** Optional glass tint / fallback background colour. */
  tint?: string;
  radius?: number;
  /**
   * Set on modal / popup cards so they follow the user's "Modal opacity"
   * setting (Settings → Appearance). Ignored when `tint` is given.
   */
  modal?: boolean;
};

/**
 * A frosted panel. Real liquid glass on iOS 26+, and a translucent bordered
 * card everywhere else — designed to sit over the tinted "bloom" blobs on the
 * expenses screens so the fallback still reads as glass-over-colour.
 */

export function GlassSurface({
  style,
  glass = 'regular',
  tint,
  radius = 20,
  modal = false,
  children,
  ...rest
}: Props) {
  const { scheme, modalOpacity } = useThemeContext();
  const isDark = scheme === 'dark';
  const liquid = isLiquidGlassAvailable();
  const base = isDark ? '28,28,32' : '255,255,255';

  if (liquid) {
    const backingAlpha = modal && !tint ? MODAL_LIQUID_ALPHA[modalOpacity] : 0;
    return (
      <GlassView
        glassEffectStyle={glass}
        tintColor={tint}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
        {...rest}>
        {backingAlpha > 0 && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(${base},${backingAlpha})` }]}
          />
        )}
        {children}
      </GlassView>
    );
  }

  const alpha = modal ? MODAL_FALLBACK_ALPHA[modalOpacity] : 0.66;
  const fallbackBg = tint ?? `rgba(${base},${alpha})`;
  const border = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: fallbackBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: border,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
