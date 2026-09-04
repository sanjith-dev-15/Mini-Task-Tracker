import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useThemeContext } from '@/lib/theme';

type Props = ViewProps & {
  /** 'regular' frosted panel (default) or 'clear' for a lighter tint. */
  glass?: 'regular' | 'clear';
  /** Optional glass tint / fallback background colour. */
  tint?: string;
  radius?: number;
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
  children,
  ...rest
}: Props) {
  const { scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const liquid = isLiquidGlassAvailable();

  if (liquid) {
    return (
      <GlassView
        glassEffectStyle={glass}
        tintColor={tint}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
        {...rest}>
        {children}
      </GlassView>
    );
  }

  const fallbackBg =
    tint ?? (isDark ? 'rgba(28,28,32,0.66)' : 'rgba(255,255,255,0.66)');
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
