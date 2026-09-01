import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { MonthCalendar } from '@/components/month-calendar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_RADIUS,
  geofencePermissionState,
  isGeofencingEnabled,
  RADIUS_OPTIONS,
  radiusLabel,
} from '@/lib/geofencing';
import { resolveSharedLocation } from '@/lib/maps-link';
import { activeChipKey, dayStartOf, DUE_CHIPS, formatDue, morningOf } from '@/lib/reminder-dates';
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
  useEffect(() => {
    return () => {
      const current = ref.current;
      if (!current) return;
      const discard = isNew
        ? !current.title.trim() && !current.notes.trim()
        : isBlankReminder(current);
      if (discard) deleteReminder(current.id);
    };
  }, [deleteReminder, isNew]);

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
  const [showCal, setShowCal] = useState(false);

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
          radius: reminder.location?.radius,
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

  const currentChip = activeChipKey(reminder.dueAt);
  const loc = reminder.location;

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
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.six }]}
          keyboardShouldPersistTaps="handled">
          <TextInput
            value={reminder.title}
            onChangeText={(title) => updateReminder(reminder.id, { title })}
            placeholder="Remind me to…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text }]}
            multiline
          />

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

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            WHEN
          </ThemedText>
          <View style={styles.chips}>
            {DUE_CHIPS.map((chip) => {
              const active = currentChip === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => {
                    setShowCal(false);
                    updateReminder(reminder.id, { dueAt: chip.resolve() });
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#fff' : theme.textSecondary }}>
                    {chip.label}
                  </ThemedText>
                </Pressable>
              );
            })}

            {(() => {
              const custom = reminder.dueAt != null && currentChip === '';
              const active = custom || showCal;
              return (
                <Pressable
                  onPress={() => setShowCal((v) => !v)}
                  style={[
                    styles.chip,
                    styles.dateChip,
                    {
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={active ? '#fff' : theme.textSecondary}
                  />
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#fff' : theme.textSecondary }}>
                    {custom ? formatDue(reminder.dueAt!) : 'Pick a date'}
                  </ThemedText>
                </Pressable>
              );
            })()}
          </View>

          {showCal && (
            <View style={[styles.calendar, { backgroundColor: theme.backgroundElement }]}>
              <MonthCalendar
                selected={reminder.dueAt != null ? dayStartOf(reminder.dueAt) : null}
                onSelect={(ts) => {
                  updateReminder(reminder.id, { dueAt: morningOf(ts) });
                  setShowCal(false);
                }}
              />
            </View>
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            LOCATION
          </ThemedText>

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
                  onPress={() =>
                    router.push({ pathname: '/map', params: { pickFor: reminder.id } })
                  }
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
                onPress={() =>
                  router.push({ pathname: '/map', params: { pickFor: reminder.id } })
                }
                accessibilityRole="button"
                accessibilityLabel="Pick a location on the map"
                style={({ pressed }) => [
                  styles.locOption,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <View style={[styles.locDisc, { backgroundColor: theme.accent + '1F' }]}>
                  <Ionicons name="location-outline" size={20} color={theme.accent} />
                </View>
                <ThemedText type="smallBold">Pick on map</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.locOptionSub}>
                  Search or drop a pin
                </ThemedText>
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
                    borderColor: linkOpen ? theme.accent : theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <View style={[styles.locDisc, { backgroundColor: theme.accent + '1F' }]}>
                  <Ionicons name="link" size={20} color={theme.accent} />
                </View>
                <ThemedText type="smallBold">Paste link</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.locOptionSub}>
                  From Google Maps
                </ThemedText>
              </Pressable>
            </View>
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

          {loc && (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                NUDGE ME WITHIN
              </ThemedText>
              <View style={styles.chips}>
                {RADIUS_OPTIONS.map((m) => {
                  const active = (loc.radius ?? DEFAULT_RADIUS) === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => updateReminder(reminder.id, { location: { ...loc, radius: m } })}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.accent : theme.backgroundElement,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: active ? '#fff' : theme.textSecondary }}>
                        {radiusLabel(m)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => router.push('/settings/permissions')}
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

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <TextInput
            value={reminder.notes}
            onChangeText={(notes) => updateReminder(reminder.id, { notes })}
            placeholder="Notes…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.notesInput, { color: theme.text }]}
            multiline
            textAlignVertical="top"
          />
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
  titleInput: { fontSize: 26, fontWeight: '700', paddingVertical: Spacing.two },
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
  sectionLabel: { letterSpacing: 1, marginTop: Spacing.four, marginBottom: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  calendar: {
    borderRadius: 14,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  locDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // no-location: two side-by-side method cards
  locGrid: { flexDirection: 'row', gap: Spacing.two },
  locOption: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  locOptionSub: { textAlign: 'center' },

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
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.four },
  notesInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
});
