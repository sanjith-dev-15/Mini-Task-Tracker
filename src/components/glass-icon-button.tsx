import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Pressable, StyleSheet } from 'react-native';

import { useThemeContext } from '@/lib/theme';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  iconSize?: number;
};

/**
 * A circular icon button with a liquid-glass background — real glass on iOS 26+,
 * a translucent bordered circle everywhere else.
 */
export function GlassIconButton({
  name,
  color,
  onPress,
  accessibilityLabel,
  size = 40,
  iconSize = 20,
}: Props) {
  const { scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const liquid = isLiquidGlassAvailable();
  const fallbackBg = isDark ? 'rgba(40,40,44,0.72)' : 'rgba(255,255,255,0.72)';
  const border = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <GlassView
        glassEffectStyle="regular"
        style={[
          styles.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: border,
            backgroundColor: liquid ? 'transparent' : fallbackBg,
          },
        ]}>
        <Ionicons name={name} size={iconSize} color={color} />
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
