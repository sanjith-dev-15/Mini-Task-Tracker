import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type GlassAlertAction = {
  label: string;
  onPress: () => void;
  /** 'cancel' → muted fill, 'destructive' → red fill, else accent fill. */
  style?: 'default' | 'cancel' | 'destructive';
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Optional glyph shown in a tinted disc above the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tint for the icon disc + destructive actions (defaults to danger). */
  tone?: 'danger' | 'accent';
  actions: GlassAlertAction[];
  onRequestClose: () => void;
};

/**
 * A liquid-glass confirmation dialog — real glass on iOS 26+, a frosted card
 * elsewhere (see {@link GlassSurface}). A drop-in for `Alert.alert` where the
 * native dialog would break the app's look.
 */
export function GlassAlert({
  visible,
  title,
  message,
  icon,
  tone = 'danger',
  actions,
  onRequestClose,
}: Props) {
  const theme = useTheme();
  const toneColor = tone === 'accent' ? theme.accent : theme.danger;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <Animated.View
          entering={FadeInDown.duration(220).springify().damping(20)}
          pointerEvents="box-none">
          <GlassSurface glass="regular" radius={28} style={styles.card}>
            {icon && (
              <View style={[styles.iconDisc, { backgroundColor: toneColor + '1F' }]}>
                <Ionicons name={icon} size={26} color={toneColor} />
              </View>
            )}

            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
            {message ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
                {message}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              {actions.map((action) => {
                const cancel = action.style === 'cancel';
                const destructive = action.style === 'destructive';
                return (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    onPress={action.onPress}
                    style={({ pressed }) => [
                      styles.btn,
                      {
                        backgroundColor: cancel
                          ? theme.backgroundElement
                          : destructive
                            ? theme.danger
                            : theme.accent,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: cancel ? theme.text : '#fff' }}>
                      {action.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  iconDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
