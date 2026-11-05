import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassAlert } from '@/components/glass-alert';
import { GlassIconButton } from '@/components/glass-icon-button';
import { RangePicker } from '@/components/range-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenPicker } from '@/components/when-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_RADIUS,
  geofencePermissionState,
  isGeofencingEnabled,
} from '@/lib/geofencing';
import { resolveSharedLocation } from '@/lib/maps-link';
import { isBlankReminder, useReminders, type Reminder } from '@/lib/reminders';

export default function ReminderEditorScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const isNew = fresh === '1';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getReminder, updateReminder, deleteReminder } = useReminders();

  const reminder = getReminder(id);
  const ref = useRef<Reminder | undefined>(reminder);
  useEffect(() => {
    ref.current = reminder;
  });

  // Discard on exit if the user never gave it anything worth keeping. A
  // just-created reminder (opened with `fresh`) needs a title or notes to
  // survive — a bare location picked on the map but never named doesn't count.
  const discardIfEmpty = useCallback(() => {
    const current = ref.current;
    if (!current) return;
    const discard = isNew
      ? !current.title.trim() && !current.notes.trim()
      : isBlankReminder(current);
    if (discard) deleteReminder(current.id);
  }, [deleteReminder, isNew]);

  // Effect cleanups also run when an effect re-subscribes (e.g. a hot reload)
  // while the editor is still on screen — only discard once it's really left.
  const navigation = useNavigation();
  const discardIfLeft = useCallback(() => {
    if (!navigation.isFocused()) discardIfEmpty();
  }, [navigation, discardIfEmpty]);

  useEffect(() => discardIfLeft, [discardIfLeft]);

  // The drawer keeps this screen mounted after you leave it, so also check on
  // blur — except for trips that come back here (map picker, settings).
  const keepOnBlur = useRef(false);
  useFocusEffect(
    useCallback(() => {
      keepOnBlur.current = false;
      return () => {
        if (!keepOnBlur.current) discardIfLeft();
      };
    }, [discardIfLeft]),
  );
  const pickOnMap = () => {
    keepOnBlur.current = true;
    router.push({ pathname: '/map', params: { pickFor: id } });
  };

  // Whether "location reminders" is actually armed (toggle on + all perms).
  const [geoActive, setGeoActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([isGeofencingEnabled(), geofencePermissionState()])
        .then(([enabled, state]) => alive && setGeoActive(enabled && state === 'ready'))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleMissing, setTitleMissing] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const locationY = useRef(0);
  const titleRef = useRef<TextInput>(null);

  // Alert range picked before there's a place to attach it to; applied once
  // a location is set (map picker or pasted link).
  const [pendingRadius, setPendingRadius] = useState<number>(DEFAULT_RADIUS);
  const located = reminder?.location;
  useEffect(() => {
    if (reminder && located && located.radius == null && pendingRadius !== DEFAULT_RADIUS) {
      updateReminder(reminder.id, { location: { ...located, radius: pendingRadius } });
    }
  }, [reminder, located, pendingRadius, updateReminder]);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState(false);

  // Close the editor and land on the Home tab, wherever we were opened from.
  const goHome = useCallback(() => router.replace('/'), []);

  const applyLink = async () => {
    const text = linkText.trim();
    if (!text || linkBusy || !reminder) return;
    Keyboard.dismiss();
    setLinkBusy(true);
    setLinkError(false);
    try {
      const found = await resolveSharedLocation(text);
      if (!found) {
        setLinkError(true);
        return;
      }
      updateReminder(reminder.id, {
        location: {
          lat: found.lat,
          lng: found.lng,
          label: found.label ?? reminder.location?.label,
          radius: reminder.location?.radius ?? pendingRadius,
        },
      });
      setLinkText('');
      setLinkOpen(false);
    } catch {
      setLinkError(true);
    } finally {
      setLinkBusy(false);
    }
  };

  if (!reminder) {
    return (
      <ThemedView style={[styles.screen, styles.centered]}>
        <ThemedText themeColor="textSecondary">This reminder no longer exists.</ThemedText>
        <Pressable onPress={() => router.replace('/')} style={styles.linkBtn}>
          <ThemedText style={{ color: theme.accent }}>Back to Home</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const loc = reminder.location;
  const locationMissing = locationRequired && !loc;

  // Edits save as you type; this checks the two things every reminder needs —
  // what (title) and where (location) — then leaves.
  const setReminder = () => {
    const noTitle = !reminder.title.trim();
    setTitleMissing(noTitle);
    setLocationRequired(!loc);
    if (noTitle) {
      titleRef.current?.focus();
      return;
    }
    if (!loc) {
      Keyboard.dismiss();
      scrollRef.current?.scrollTo({ y: Math.max(0, locationY.current - Spacing.four), animated: true });
      return;
    }
    Keyboard.dismiss();
    goHome();
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-back"
          color={theme.text}
          onPress={goHome}
          accessibilityLabel="Back to Home"
        />
        <GlassIconButton
          name="trash-outline"
          color={theme.danger}
          onPress={() => setConfirmingDelete(true)}
          accessibilityLabel="Delete reminder"
        />
      </View>

      <GlassAlert
        visible={confirmingDelete}
        icon="trash-outline"
        title="Delete reminder?"
        message="This cannot be undone."
        onRequestClose={() => setConfirmingDelete(false)}
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setConfirmingDelete(false) },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              setConfirmingDelete(false);
              deleteReminder(reminder.id);
              goHome();
            },
          },
        ]}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.bellWrap}>
              <Ionicons name="notifications" size={40} color={theme.accent} />
              <View style={[styles.wave, styles.waveL, { backgroundColor: theme.accent }]} />
              <View style={[styles.wave, styles.waveR, { borderColor: theme.accent }]} />
            </View>
            <View style={styles.heroText}>
              <ThemedText style={styles.heroTitle}>Remind me to…</ThemedText>
              <ThemedText themeColor="textSecondary">Set a reminder for anything ✨</ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.field,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: titleMissing ? theme.danger : theme.border,
              },
            ]}>
            <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
            <TextInput
              ref={titleRef}
              value={reminder.title}
              onChangeText={(title) => {
                updateReminder(reminder.id, { title });
                if (title.trim()) setTitleMissing(false);
              }}
              placeholder="e.g. Drink water, Finish project…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.titleInput, { color: theme.text }]}
              autoFocus={isNew}
              multiline
            />
          </View>
          {titleMissing && (
            <ThemedText type="small" style={[styles.fieldError, { color: theme.danger }]}>
              Add what you want to be reminded about.
            </ThemedText>
          )}

          {!isNew && (
          <Pressable
            onPress={() => updateReminder(reminder.id, { done: !reminder.done })}
            style={styles.doneRow}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: reminder.done ? theme.accent : theme.border,
                  backgroundColor: reminder.done ? theme.accent : 'transparent',
                },
              ]}>
              {reminder.done && <Ionicons name="checkmark" size={15} color="#fff" />}
            </View>
            <ThemedText themeColor={reminder.done ? 'textSecondary' : 'text'}>
              {reminder.done ? 'Completed' : 'Mark complete'}
            </ThemedText>
          </Pressable>
          )}

          <WhenPicker
            dueAt={reminder.dueAt}
            onChange={(dueAt) => updateReminder(reminder.id, { dueAt })}
          />

          <View
            style={styles.whenHead}
            onLayout={(e) => {
              locationY.current = e.nativeEvent.layout.y;
            }}>
            <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              Location <ThemedText type="smallBold" style={{ color: theme.danger }}>*</ThemedText>
            </ThemedText>
          </View>

          {loc ? (
            <View
              style={[
                styles.locCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.locCardHead}>
                <View style={[styles.locDisc, { backgroundColor: theme.accent + '1F' }]}>
                  <Ionicons name="location" size={18} color={theme.accent} />
                </View>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={2}>{loc.label ?? 'Dropped pin'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => updateReminder(reminder.id, { location: null })}
                  hitSlop={10}
                  accessibilityLabel="Remove location">
                  <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.locCardActions, { borderTopColor: theme.border }]}>
                <Pressable
                  onPress={pickOnMap}
                  style={({ pressed }) => [
                    styles.locCardAction,
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <Ionicons name="map-outline" size={15} color={theme.accent} />
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Change on map
                  </ThemedText>
                </Pressable>
                <View style={[styles.locCardSep, { backgroundColor: theme.border }]} />
                <Pressable
                  onPress={() => {
                    setLinkError(false);
                    setLinkOpen((v) => !v);
                  }}
                  style={({ pressed }) => [
                    styles.locCardAction,
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <Ionicons
                    name={linkOpen ? 'chevron-up' : 'link-outline'}
                    size={15}
                    color={theme.accent}
                  />
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Paste link
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.locGrid}>
              <Pressable
                onPress={pickOnMap}
                accessibilityRole="button"
                accessibilityLabel="Pick a location on the map"
                style={({ pressed }) => [
                  styles.locOption,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: locationMissing ? theme.danger : theme.border,
                    borderWidth: locationMissing ? 1.5 : StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Ionicons name="location" size={22} color={theme.accent} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    Pick on map
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" numberOfLines={2} style={styles.locOptionSub}>
                    Search or drop a pin
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </Pressable>

              <Pressable
                onPress={() => {
                  setLinkError(false);
                  setLinkOpen((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityLabel="Paste a Google Maps link"
                style={({ pressed }) => [
                  styles.locOption,
                  {
                    backgroundColor: linkOpen ? theme.accent + '14' : theme.backgroundElement,
                    borderColor: linkOpen
                      ? theme.accent
                      : locationMissing
                        ? theme.danger
                        : theme.border,
                    borderWidth: locationMissing && !linkOpen ? 1.5 : StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Ionicons name="link" size={22} color={theme.accent} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    Paste link
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" numberOfLines={2} style={styles.locOptionSub}>
                    From Google Maps
                  </ThemedText>
                </View>
                <Ionicons
                  name={linkOpen ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>
          )}
          {locationMissing && (
            <ThemedText type="small" style={[styles.fieldError, { color: theme.danger }]}>
              Choose where you want to be reminded.
            </ThemedText>
          )}

          {linkOpen && (
            <View style={styles.mapsLinkBox}>
              <View
                style={[
                  styles.mapsLinkField,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: linkError ? theme.danger : theme.border,
                  },
                ]}>
                <Ionicons
                  name="link-outline"
                  size={15}
                  color={theme.textSecondary}
                  style={styles.mapsLinkFieldIcon}
                />
                <TextInput
                  value={linkText}
                  onChangeText={(t) => {
                    setLinkText(t);
                    setLinkError(false);
                  }}
                  placeholder="maps.app.goo.gl/…  or  12.3456, 78.9012"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.mapsLinkInput, { color: theme.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  multiline
                />
                {linkText.length > 0 && !linkBusy && (
                  <Pressable
                    onPress={() => {
                      setLinkText('');
                      setLinkError(false);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Clear">
                    <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={applyLink}
                disabled={linkBusy || !linkText.trim()}
                style={[
                  styles.mapsLinkBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: linkBusy || !linkText.trim() ? 0.4 : 1,
                  },
                ]}>
                {linkBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <ThemedText type="smallBold" style={{ color: '#fff' }}>
                      Use this location
                    </ThemedText>
                  </>
                )}
              </Pressable>

              <View style={styles.mapsLinkNote}>
                <Ionicons
                  name={linkError ? 'alert-circle-outline' : 'information-circle-outline'}
                  size={13}
                  color={linkError ? theme.danger : theme.textSecondary}
                  style={styles.mapsLinkFieldIcon}
                />
                <ThemedText
                  type="small"
                  style={[styles.flex, { color: linkError ? theme.danger : theme.textSecondary }]}>
                  {linkError
                    ? 'Couldn’t read a location from that. In Google Maps tap Share and paste the whole link — or paste “latitude, longitude”.'
                    : 'In Google Maps: Share → Copy link, then paste here for a precise pin.'}
                </ThemedText>
              </View>
            </View>
          )}

          <RangePicker
            radius={loc?.radius ?? pendingRadius}
            hasLocation={loc != null}
            onChange={(radius) => {
              setPendingRadius(radius);
              if (loc) updateReminder(reminder.id, { location: { ...loc, radius } });
            }}
          />

          {loc && (
            <>
              <Pressable
                onPress={() => {
                  keepOnBlur.current = true;
                  router.push('/settings/permissions');
                }}
                style={styles.geoHint}>
                <Ionicons
                  name={geoActive ? 'notifications' : 'notifications-off-outline'}
                  size={14}
                  color={geoActive ? theme.accent : theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                  {geoActive
                    ? `You'll get a notification when you arrive here.`
                    : `Turn on location reminders to be notified here →`}
                </ThemedText>
              </Pressable>
            </>
          )}

          <View style={styles.whenHead}>
            <Ionicons name="document-text-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              Notes{' '}
              <ThemedText type="small" themeColor="textSecondary">
                (Optional)
              </ThemedText>
            </ThemedText>
          </View>
          <TextInput
            value={reminder.notes}
            onChangeText={(notes) => updateReminder(reminder.id, { notes })}
            placeholder="Add any extra details…"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.notesInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            accessibilityRole="button"
            onPress={setReminder}
            style={({ pressed }) => [
              styles.setBtn,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}>
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            <ThemedText style={styles.setLabel}>
              {isNew ? 'Set Reminder' : 'Save Reminder'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  linkBtn: { padding: Spacing.two },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  heroText: { flex: 1, gap: 2 },
  bellWrap: { width: 60, height: 48, justifyContent: 'center', paddingLeft: 8 },
  wave: { position: 'absolute' },
  waveL: { left: 0, top: 12, width: 4, height: 9, borderRadius: 2, transform: [{ rotate: '-35deg' }] },
  waveR: {
    right: 2,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  heroTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    minHeight: 60,
  },
  titleInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.three },
  fieldError: { marginTop: Spacing.one, paddingHorizontal: Spacing.one },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Icon + label section heading (Notes)
  whenHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  locDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // no-location: two compact side-by-side rows (icon · text · chevron)
  locGrid: { flexDirection: 'row', gap: Spacing.two },
  locOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + 4,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
  },
  locOptionSub: { fontSize: 12, lineHeight: 16 },

  // has-location: detail card with an action bar
  locCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  locCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  locCardActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locCardAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.two + 2,
  },
  locCardSep: { width: StyleSheet.hairlineWidth },

  mapsLinkBox: { gap: Spacing.two, marginTop: Spacing.two },
  mapsLinkField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  mapsLinkFieldIcon: { marginTop: 2 },
  mapsLinkInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    padding: 0,
    minHeight: 20,
    maxHeight: 88,
  },
  mapsLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    height: 46,
    borderRadius: 12,
  },
  mapsLinkNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.one,
  },
  geoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  notesInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 96,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  setBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 58,
    borderRadius: 999,
    marginTop: Spacing.five,
    backgroundColor: '#3C87F7',
    experimental_backgroundImage: 'linear-gradient(90deg, #6AA8FA 0%, #2F6FE6 100%)',
  },
  setLabel: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
