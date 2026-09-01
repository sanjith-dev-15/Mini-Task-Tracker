import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { MonthCalendar } from '@/components/month-calendar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryOf } from '@/lib/expense-categories';
import {
  currentMonthName,
  daysElapsedThisMonth,
  formatMoney,
  fullDayLabel,
  groupByDay,
  lastMonth,
  monthKey,
  spendByDay,
  sumAmount,
  thisMonth,
  totalsByCategory,
  useExpenses,
  type Expense,
} from '@/lib/expenses';

const GOOD = '#10B981';

export default function ExpensesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses, loading, income, setMonthlyIncome } = useExpenses();

  const monthName = currentMonthName();
  const monthIncome = income[monthKey()] ?? 0;
  const { monthList, monthTotal, delta, perDay, cats } = useMemo(() => {
    const list = thisMonth(expenses);
    const total = sumAmount(list);
    const lastTotal = sumAmount(lastMonth(expenses));
    return {
      monthList: list,
      monthTotal: total,
      delta: lastTotal > 0 ? (total - lastTotal) / lastTotal : null,
      perDay: total / daysElapsedThisMonth(),
      cats: totalsByCategory(list),
    };
  }, [expenses]);

  const allGroups = useMemo(() => groupByDay(expenses), [expenses]);
  const dayMap = useMemo(() => spendByDay(expenses), [expenses]);

  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const [showCal, setShowCal] = useState(false);

  const [showIncome, setShowIncome] = useState(false);
  const [incomeStr, setIncomeStr] = useState('');
  const remaining = monthIncome - monthTotal;

  const openIncome = () => {
    setIncomeStr(monthIncome ? String(monthIncome) : '');
    setShowIncome(true);
  };
  const saveIncome = () => {
    setMonthlyIncome(parseFloat(incomeStr || '0') || 0);
    setShowIncome(false);
  };
  const clearIncome = () => {
    setMonthlyIncome(0);
    setShowIncome(false);
  };
  const groups = focusedDay
    ? allGroups.filter((g) => g.key === String(focusedDay))
    : allGroups;

  const fabBottom = insets.bottom + Spacing.six + Spacing.three;

  const openNew = () => router.push('/expenses/new');
  const openEdit = (id: string) =>
    router.push({ pathname: '/expenses/new', params: { id } });

  const bottomPad = insets.bottom + Spacing.six + Spacing.six;

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <DrawerToggleButton tintColor={theme.text} />
        <ThemedText type="subtitle" style={styles.flex}>
          Expenses
        </ThemedText>
        <View style={[styles.monthPill, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {monthName}
          </ThemedText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}>
        {/* ---------- hero ---------- */}
        <GlassSurface glass="clear" radius={28} style={styles.hero}>
          <View style={[styles.blob, styles.blobA, { backgroundColor: theme.accent }]} />
          <View style={[styles.blob, styles.blobB, { backgroundColor: '#F59E0B' }]} />
          <View style={[styles.blob, styles.blobC, { backgroundColor: '#EC4899' }]} />

          <View style={styles.heroInner}>
            <ThemedText type="smallBold" style={[styles.kicker, { color: theme.textSecondary }]}>
              SPENT IN {monthName.toUpperCase()}
            </ThemedText>
            <ThemedText style={[styles.heroAmount, { color: theme.text }]}>
              {formatMoney(monthTotal)}
            </ThemedText>

            <View style={styles.heroMeta}>
              <ThemedText type="small" themeColor="textSecondary">
                {monthList.length} {monthList.length === 1 ? 'entry' : 'entries'}
                {monthTotal > 0 ? ` · ${formatMoney(perDay)}/day` : ''}
              </ThemedText>
              {delta != null && (
                <GlassSurface
                  radius={999}
                  tint={(delta > 0 ? theme.danger : GOOD) + '22'}
                  style={styles.deltaPill}>
                  <Ionicons
                    name={delta > 0 ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={delta > 0 ? theme.danger : GOOD}
                  />
                  <ThemedText
                    type="smallBold"
                    style={{ color: delta > 0 ? theme.danger : GOOD }}>
                    {Math.abs(Math.round(delta * 100))}%
                  </ThemedText>
                </GlassSurface>
              )}
            </View>

            {monthIncome > 0 ? (
              <Pressable
                onPress={openIncome}
                accessibilityLabel="Edit monthly income"
                style={[styles.incomeRow, { borderTopColor: theme.border }]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.kicker}>
                    {remaining >= 0 ? 'LEFT TO SPEND' : 'OVER BUDGET'}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.remaining,
                      { color: remaining >= 0 ? GOOD : theme.danger },
                    ]}>
                    {formatMoney(remaining)}
                  </ThemedText>
                </View>
                <View style={styles.incomeOf}>
                  <ThemedText type="small" themeColor="textSecondary">
                    of {formatMoney(monthIncome)}
                  </ThemedText>
                  <Ionicons name="pencil" size={12} color={theme.textSecondary} />
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={openIncome}
                style={[styles.incomeAdd, { borderColor: theme.border }]}>
                <Ionicons name="wallet-outline" size={15} color={theme.accent} />
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Add money I have
                </ThemedText>
              </Pressable>
            )}
          </View>
        </GlassSurface>

        {/* ---------- breakdown ---------- */}
        <GlassSurface style={styles.card}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cardTitle}>
            WHERE IT WENT
          </ThemedText>

          {cats.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? 'Loading…' : 'No spending logged this month yet.'}
            </ThemedText>
          ) : (
            <>
              <View style={styles.stack}>
                {cats.map((c) => (
                  <View
                    key={c.key}
                    style={{ flex: c.total, backgroundColor: categoryOf(c.key).color }}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {cats.map((c) => {
                  const cat = categoryOf(c.key);
                  const pct = Math.round((c.total / monthTotal) * 100);
                  return (
                    <View key={c.key} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: cat.color }]} />
                      <View style={styles.flex}>
                        <ThemedText type="small" numberOfLines={1}>
                          {cat.label}
                        </ThemedText>
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          {formatMoney(c.total)} · {pct}%
                        </ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </GlassSurface>

        {/* ---------- recent ---------- */}
        <View style={styles.recentHead}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            {focusedDay ? fullDayLabel(focusedDay).toUpperCase() : 'RECENT'}
          </ThemedText>
          {focusedDay && (
            <Pressable onPress={() => setFocusedDay(null)} hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Show all
              </ThemedText>
            </Pressable>
          )}
        </View>

        {groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {loading
              ? 'Loading…'
              : focusedDay
                ? 'Nothing spent on this day.'
                : 'Tap + to log your first expense.'}
          </ThemedText>
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.dayGroup}>
              <View style={styles.dayHead}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {g.label}
                </ThemedText>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {formatMoney(g.total)}
                </ThemedText>
              </View>
              <GlassSurface style={styles.dayCard}>
                {g.items.map((item, i) => (
                  <ExpenseRow
                    key={item.id}
                    expense={item}
                    divider={i > 0}
                    onPress={() => openEdit(item.id)}
                  />
                ))}
              </GlassSurface>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        accessibilityLabel={focusedDay ? 'Change the day shown' : 'Jump to a day'}
        onPress={() => setShowCal(true)}
        style={({ pressed }) => [
          styles.calBtn,
          {
            backgroundColor: focusedDay ? theme.accent : theme.card,
            borderColor: theme.border,
            bottom: fabBottom + 56 + Spacing.two,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Ionicons
          name={focusedDay ? 'calendar' : 'calendar-outline'}
          size={20}
          color={focusedDay ? '#fff' : theme.accent}
        />
      </Pressable>

      <Pressable
        accessibilityLabel="Add expense"
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.accent, bottom: fabBottom, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <Modal
        visible={showCal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCal(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setShowCal(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {}}>
            <View style={styles.modalHead}>
              <ThemedText type="subtitle">Jump to a day</ThemedText>
              <Pressable onPress={() => setShowCal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <MonthCalendar
              maxToday
              selected={focusedDay}
              spendByDay={dayMap}
              onSelect={(ts) => {
                setFocusedDay((cur) => (cur === ts ? null : ts));
                setShowCal(false);
              }}
            />
            {focusedDay && (
              <Pressable
                onPress={() => {
                  setFocusedDay(null);
                  setShowCal(false);
                }}
                style={styles.modalClear}>
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Show all days
                </ThemedText>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showIncome}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIncome(false)}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalScrim} onPress={() => setShowIncome(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => {}}>
              <View style={styles.modalHead}>
                <ThemedText type="subtitle">Money for {monthName}</ThemedText>
                <Pressable onPress={() => setShowIncome(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Enter your salary or total for the month. “Left to spend” updates as you log
                expenses.
              </ThemedText>

              <View style={[styles.incomeInputBox, { borderColor: theme.border }]}>
                <ThemedText style={[styles.incomeCurrency, { color: theme.textSecondary }]}>
                  ₹
                </ThemedText>
                <TextInput
                  value={incomeStr}
                  onChangeText={(t) => setIncomeStr(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.incomeInput, { color: theme.text }]}
                  autoFocus
                  onSubmitEditing={saveIncome}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.incomeActions}>
                {monthIncome > 0 && (
                  <Pressable
                    onPress={clearIncome}
                    style={[styles.incomeBtn, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold" style={{ color: theme.danger }}>
                      Clear
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  onPress={saveIncome}
                  style={[styles.incomeBtn, styles.flex, { backgroundColor: theme.accent }]}>
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    Save
                  </ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

function ExpenseRow({
  expense,
  divider,
  onPress,
}: {
  expense: Expense;
  divider: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { deleteExpense } = useExpenses();
  const cat = categoryOf(expense.category);

  const confirmDelete = () =>
    Alert.alert('Delete expense?', `${formatMoney(expense.amount)} · ${cat.label}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(expense.id) },
    ]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={confirmDelete}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: cat.color + '22' }]}>
        <Ionicons name={cat.icon} size={17} color={cat.color} />
      </View>
      <View style={styles.flex}>
        <ThemedText numberOfLines={1}>{expense.title.trim() || cat.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {cat.label}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{formatMoney(expense.amount)}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.three,
    paddingBottom: Spacing.two,
  },
  monthPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },

  // hero
  hero: { minHeight: 172, justifyContent: 'center' },
  blob: { position: 'absolute', width: 280, height: 280, borderRadius: 999 },
  blobA: { top: -150, right: -110, opacity: 0.34 },
  blobB: { bottom: -180, left: -110, width: 300, height: 300, opacity: 0.3 },
  blobC: { bottom: -120, right: 20, width: 220, height: 220, opacity: 0.22 },
  heroInner: { padding: Spacing.four, gap: Spacing.one },
  kicker: { letterSpacing: 1.5, fontSize: 11 },
  heroAmount: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -0.5 },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  remaining: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
  incomeOf: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2 },
  incomeAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    marginTop: Spacing.three,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  incomeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    height: 56,
    marginTop: Spacing.one,
  },
  incomeCurrency: { fontSize: 20, fontWeight: '700' },
  incomeInput: { flex: 1, fontSize: 24, fontWeight: '800', height: '100%' },
  incomeActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  incomeBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },

  // cards
  card: { padding: Spacing.three, gap: Spacing.three },
  cardTitle: { letterSpacing: 1 },
  stack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 2,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three, columnGap: Spacing.two },
  legendItem: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },

  // recent
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  sectionLabel: { letterSpacing: 1 },
  empty: { paddingVertical: Spacing.four, textAlign: 'center' },
  dayGroup: { gap: Spacing.two },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  dayCard: { paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  calBtn: {
    position: 'absolute',
    right: Spacing.four + 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  modalClear: { alignSelf: 'center', paddingTop: Spacing.two },
});
