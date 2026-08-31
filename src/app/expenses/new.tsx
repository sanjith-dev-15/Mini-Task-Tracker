import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { GlassSurface } from '@/components/glass-surface';
import { MonthCalendar } from '@/components/month-calendar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, categoryOf, type CategoryKey } from '@/lib/expense-categories';
import { fullDayLabel, startOfDay, useExpenses } from '@/lib/expenses';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
const DAY_MS = 86_400_000;

/** Midnight `offsetDays` from today. */
function dayFromToday(offsetDays = 0): number {
  return startOfDay(startOfDay() + offsetDays * DAY_MS);
}

/** Group the integer part (Indian style) while the user is still typing. */
function formatAmountInput(s: string): string {
  if (!s) return '0';
  const [intRaw, frac] = s.split('.');
  const int = intRaw || '0';
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return s.includes('.') ? `${grouped}.${frac}` : grouped;
}

export default function ExpenseFormScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getExpense, addExpense, updateExpense, deleteExpense } = useExpenses();

  const existing = id ? getExpense(id) : undefined;
  const editing = existing != null;

  const [amountStr, setAmountStr] = useState(() =>
    existing && existing.amount ? String(existing.amount) : '',
  );
  const [category, setCategory] = useState<CategoryKey>(() => existing?.category ?? 'food');
  const [title, setTitle] = useState(() => existing?.title ?? '');
  const [spentAt, setSpentAt] = useState(() =>
    existing ? startOfDay(existing.spentAt) : dayFromToday(),
  );
  const [showCal, setShowCal] = useState(false);

  const amount = parseFloat(amountStr || '0') || 0;
  const canSave = amount > 0;

  if (id && !existing) {
    return (
      <ThemedView style={[styles.screen, styles.centered]}>
        <ThemedText themeColor="textSecondary">This expense no longer exists.</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <ThemedText style={{ color: theme.accent }}>Go back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const press = (k: (typeof KEYS)[number]) => {
    setAmountStr((s) => {
      if (k === 'back') return s.slice(0, -1);
      if (k === '.') return s.includes('.') ? s : s === '' ? '0.' : s + '.';
      if (s === '0') return k;
      const frac = s.split('.')[1];
      if (frac && frac.length >= 2) return s;
      if (s.replace('.', '').length >= 9) return s;
      return s + k;
    });
  };

  const save = () => {
    if (!canSave) return;
    const patch = { amount, category, title: title.trim(), spentAt };
    if (existing) updateExpense(existing.id, patch);
    else addExpense(patch);
    router.back();
  };

  const confirmDelete = () =>
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (existing) deleteExpense(existing.id);
          router.back();
        },
      },
    ]);

  const isToday = spentAt === dayFromToday();
  const isYesterday = spentAt === dayFromToday(-1);
  const showDateLabel = !isToday && !isYesterday;

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-down"
          color={theme.text}
          onPress={() => router.back()}
          accessibilityLabel="Close"
        />
        <ThemedText type="subtitle">{editing ? 'Edit expense' : 'New expense'}</ThemedText>
        {editing ? (
          <GlassIconButton
            name="trash-outline"
            color={theme.danger}
            onPress={confirmDelete}
            accessibilityLabel="Delete expense"
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.amountWrap}>
        <ThemedText style={[styles.currency, { color: theme.textSecondary }]}>₹</ThemedText>
        <ThemedText
          style={[styles.amount, { color: canSave ? theme.text : theme.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatAmountInput(amountStr)}
        </ThemedText>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => {
            const active = category === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setCategory(cat.key)}
                style={[
                  styles.catChip,
                  {
                    borderColor: active ? cat.color : theme.border,
                    backgroundColor: active ? cat.color + '1A' : 'transparent',
                  },
                ]}>
                <Ionicons
                  name={cat.icon}
                  size={17}
                  color={active ? cat.color : theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={[styles.flex, { color: active ? theme.text : theme.textSecondary }]}>
                  {cat.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.titleBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="create-outline" size={17} color={theme.textSecondary} />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What was it for? (optional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.titleInput, { color: theme.text }]}
            returnKeyType="done"
          />
        </View>

        <View style={styles.dateRow}>
          {(
            [
              ['Today', isToday && !showCal, () => { setSpentAt(dayFromToday()); setShowCal(false); }],
              ['Yesterday', isYesterday && !showCal, () => { setSpentAt(dayFromToday(-1)); setShowCal(false); }],
              [
                showDateLabel ? fullDayLabel(spentAt) : 'Pick date',
                showCal || showDateLabel,
                () => setShowCal((v) => !v),
              ],
            ] as const
          ).map(([label, active, onPress], i) => (
            <Pressable
              key={i}
              onPress={onPress}
              style={[
                styles.dateChip,
                { backgroundColor: active ? theme.accent : theme.backgroundElement },
              ]}>
              {i === 2 && (
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={active ? '#fff' : theme.textSecondary}
                  style={styles.dateChipIcon}
                />
              )}
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: active ? '#fff' : theme.textSecondary }}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {showCal && (
          <GlassSurface style={styles.calendar}>
            <MonthCalendar
              maxToday
              selected={spentAt}
              onSelect={(ts) => {
                setSpentAt(ts);
                setShowCal(false);
              }}
            />
          </GlassSurface>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <GlassSurface style={styles.keypad}>
          {KEYS.map((k) => (
            <Pressable
              key={k}
              onPress={() => press(k)}
              android_disableSound={false}
              style={({ pressed }) => [styles.key, pressed && { backgroundColor: theme.backgroundElement }]}>
              {k === 'back' ? (
                <Ionicons name="backspace-outline" size={22} color={theme.text} />
              ) : (
                <ThemedText style={[styles.keyText, { color: theme.text }]}>{k}</ThemedText>
              )}
            </Pressable>
          ))}
        </GlassSurface>

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: theme.accent,
              opacity: !canSave ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons
            name={editing ? 'checkmark' : 'add'}
            size={20}
            color="#fff"
          />
          <ThemedText type="smallBold" style={styles.saveText}>
            {editing ? 'Save changes' : `Add ${categoryOf(category).label.toLowerCase()} expense`}
          </ThemedText>
        </Pressable>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerSpacer: { width: 40 },

  amountWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  currency: { fontSize: 24, fontWeight: '700', marginTop: 8 },
  amount: { fontSize: 52, lineHeight: 58, fontWeight: '800', letterSpacing: -1, maxWidth: '80%' },

  form: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  catChip: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  titleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 46,
  },
  titleInput: { flex: 1, fontSize: 15, height: '100%' },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  dateChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
  dateChipIcon: { marginRight: 4 },
  calendar: { padding: Spacing.three },

  footer: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: Spacing.one,
  },
  key: {
    width: '33.333%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  keyText: { fontSize: 24, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 16,
  },
  saveText: { color: '#fff' },
});
