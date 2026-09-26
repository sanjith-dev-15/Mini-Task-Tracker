import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type OptionsMenuOption = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
};

export type OptionsMenuSection = {
  title: string;
  options: OptionsMenuOption[];
};

/**
 * The three-dot overflow menu (liquid glass) — sections of options with a
 * checkmark on the active one. Picking an option closes the menu.
 * `top` is the window y the menu drops down from; it hugs the right edge.
 */
export function OptionsMenu({
  visible,
  top,
  sections,
  onClose,
}: {
  visible: boolean;
  top: number;
  sections: OptionsMenuSection[];
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.anchor, { top }]}>
          <GlassSurface glass="regular" radius={20} style={styles.menu}>
            {sections.map((section, i) => (
              <Fragment key={section.title}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
                  {section.title}
                </ThemedText>
                {section.options.map((opt) => (
                  <MenuRow
                    key={opt.key}
                    icon={opt.icon}
                    label={opt.label}
                    active={opt.active}
                    onPress={() => {
                      opt.onPress();
                      onClose();
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
      <Ionicons name={icon} size={18} color={active ? theme.accent : theme.textSecondary} />
      <ThemedText style={[styles.itemLabel, active && { color: theme.accent }]}>{label}</ThemedText>
      {active && <Ionicons name="checkmark" size={17} color={theme.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' },
  anchor: {
    position: 'absolute',
    right: Spacing.three,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  menu: {
    minWidth: 236,
    paddingVertical: Spacing.two,
  },
  section: {
    letterSpacing: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    opacity: 0.9,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  itemPressed: { backgroundColor: 'rgba(128,128,128,0.16)' },
  itemLabel: { flex: 1, fontSize: 15 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
    marginHorizontal: Spacing.three,
    opacity: 0.6,
  },
});
