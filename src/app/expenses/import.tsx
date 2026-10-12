import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadHandledSms, markSmsHandled, parseBankInbox, type BankTxn } from '@/lib/bank-sms';
import { CATEGORIES, categoryOf, type CategoryKey } from '@/lib/expense-categories';
import {
  formatMoney,
  fullDayLabel,
  monthKey,
  startOfDay,
  useExpenses,
} from '@/lib/expenses';
import { goBack } from '@/lib/navigation';
import {
  hasSmsPermission,
  readInbox,
  requestSmsPermission,
  smsSupported,
} from '../../../modules/sms-reader';

const GOOD = '#10B981';
const DAY_MS = 86_400_000;
const RANGES = [7, 30, 90] as const;

type Access = 'granted' | 'ask' | 'blocked';

/**
 * Expenses ▸ Import from SMS (Android). Reads bank alerts from the inbox,
 * lists the debits (as expenses, with a guessed category) and credits (added
 * to that month's "Money I have"), and adds the ticked ones. Everything is
 * parsed on the phone; the SMS text itself is never saved.
 */
export default function ImportSmsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses, income, addExpense, setMonthlyIncome } = useExpenses();

  const [access, setAccess] = useState<Access>(() => (hasSmsPermission() ? 'granted' : 'ask'));
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [txns, setTxns] = useState<BankTxn[] | null>(null);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<BankTxn | null>(null);

  // Coming back from app settings — pick up a newly granted permission.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && hasSmsPermission()) setAccess('granted');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (access !== 'granted') return;
    let alive = true;
    setTxns(null);
    setError(null);
    (async () => {
      try {
        const [inbox, done] = await Promise.all([
          readInbox(Date.now() - days * DAY_MS),
          loadHandledSms(),
        ]);
        if (!alive) return;
        setHandled(done);
        setTxns(parseBankInbox(inbox));
      } catch (e) {
        console.warn('Failed to read SMS', e);
        if (alive) {
          setError("Couldn't read your messages.");
          setTxns([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [access, days]);

  const imported = useMemo(
    () => new Set(expenses.map((e) => e.smsKey).filter((k): k is string => !!k)),
    [expenses],
  );
  const fresh = useMemo(
    () => (txns ?? []).filter((t) => !handled.has(t.key) && !imported.has(t.key)),
    [txns, handled, imported],
  );
  const debits = fresh.filter((t) => t.kind === 'debit');
  const credits = fresh.filter((t) => t.kind === 'credit');
  const chosen = fresh.filter((t) => !unticked.has(t.key));

  const allow = async () => {
    const r = await requestSmsPermission();
    setAccess(r === 'granted' ? 'granted' : r === 'blocked' ? 'blocked' : 'ask');
  };

  const toggle = useCallback((key: string) => {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setCategory = (key: string, category: CategoryKey) => {
    setTxns((list) => list?.map((t) => (t.key === key ? { ...t, category } : t)) ?? null);
    setPicking(null);
  };

  const addChosen = async () => {
    const incomeAdds = new Map<string, { ref: number; total: number }>();
    for (const t of chosen) {
      if (t.kind === 'debit') {
        addExpense({
          amount: t.amount,
          title: t.title,
          category: t.category,
          spentAt: startOfDay(t.date),
          smsKey: t.key,
        });
      } else {
        const m = monthKey(t.date);
        const cur = incomeAdds.get(m) ?? { ref: t.date, total: 0 };
        cur.total += t.amount;
        incomeAdds.set(m, cur);
      }
    }
    for (const [m, { ref, total }] of incomeAdds) {
      setMonthlyIncome((income[m] ?? 0) + total, ref);
    }
    // Unticked ones count as handled too, so the next import only shows new messages.
    await markSmsHandled(fresh.map((t) => t.key)).catch(() => {});
    goBack('/expenses');
  };

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <GlassIconButton
          name="chevron-down"
          color={theme.text}
          onPress={() => goBack('/expenses')}
          accessibilityLabel="Close"
        />
        <ThemedText type="subtitle">Import from SMS</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {!smsSupported ? (
        <Notice
          icon="phone-portrait-outline"
          text="Reading bank SMS works on Android, in a build that includes it. Install the latest APK and try again."
        />
      ) : access !== 'granted' ? (
        <ScrollView contentContainerStyle={styles.body}>
          <GlassSurface style={styles.permCard}>
            <View style={[styles.permIcon, { backgroundColor: theme.accent + '1F' }]}>
              <Ionicons name="chatbubbles" size={26} color={theme.accent} />
            </View>
            <ThemedText type="subtitle" style={styles.center}>
              Add expenses from bank SMS
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Goku reads the debit and credit alerts your bank sends, so you don't have to type
              them. OTPs and personal chats are ignored, and your messages never leave this phone.
            </ThemedText>
            <Pressable
              onPress={access === 'blocked' ? () => Linking.openSettings() : allow}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText type="smallBold" style={styles.white}>
                {access === 'blocked' ? 'Open app settings' : 'Allow SMS access'}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {access === 'blocked'
                ? 'Turn on Permissions ▸ SMS. '
                : ''}
              If Android says “Restricted setting”: open App info ▸ ⋮ (top right) ▸ Allow
              restricted settings, then allow SMS.
            </ThemedText>
          </GlassSurface>
        </ScrollView>
      ) : (
        <>
          <View style={styles.ranges}>
            {RANGES.map((d) => {
              const active = d === days;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDays(d)}
                  style={[
                    styles.rangeChip,
                    { backgroundColor: active ? theme.accent : theme.backgroundElement },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? '#fff' : theme.textSecondary }}>
                    Last {d} days
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {txns == null ? (
            <View style={styles.centerFill}>
              <ActivityIndicator color={theme.accent} />
              <ThemedText type="small" themeColor="textSecondary">
                Reading bank messages…
              </ThemedText>
            </View>
          ) : fresh.length === 0 ? (
            <Notice
              icon={error ? 'alert-circle-outline' : 'checkmark-done-outline'}
              text={error ?? `No new bank transactions in the last ${days} days.`}
            />
          ) : (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}>
              {debits.length > 0 && (
                <Section title={`SPENT · ${debits.length}`}>
                  {debits.map((t, i) => (
                    <TxnRow
                      key={t.key}
                      txn={t}
                      divider={i > 0}
                      ticked={!unticked.has(t.key)}
                      onToggle={() => toggle(t.key)}
                      onPickCategory={() => setPicking(t)}
                    />
                  ))}
                </Section>
              )}
              {credits.length > 0 && (
                <Section
                  title={`RECEIVED · ${credits.length}`}
                  note="Added to that month's “Money I have”.">
                  {credits.map((t, i) => (
                    <TxnRow
                      key={t.key}
                      txn={t}
                      divider={i > 0}
                      ticked={!unticked.has(t.key)}
                      onToggle={() => toggle(t.key)}
                    />
                  ))}
                </Section>
              )}
            </ScrollView>
          )}

          {fresh.length > 0 && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
              <Pressable
                onPress={addChosen}
                disabled={chosen.length === 0}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: chosen.length === 0 ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}>
                <Ionicons name="add" size={20} color="#fff" />
                <ThemedText type="smallBold" style={styles.white}>
                  Add {chosen.length} {chosen.length === 1 ? 'transaction' : 'transactions'}
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Unticked ones won't be shown again.
              </ThemedText>
            </View>
          )}
        </>
      )}

      <Modal
        visible={picking != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.modalScrim} onPress={() => setPicking(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {}}>
            <ThemedText type="subtitle">Category</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {picking ? `${picking.title} · ${formatMoney(picking.amount)}` : ''}
            </ThemedText>
            <View style={styles.catGrid}>
              {CATEGORIES.map((cat) => {
                const active = picking?.category === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => picking && setCategory(picking.key, cat.key)}
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
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centerFill}>
      <Ionicons name={icon} size={32} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {text}
      </ThemedText>
    </View>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          {title}
        </ThemedText>
        {note && (
          <ThemedText type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        )}
      </View>
      <GlassSurface style={styles.card}>{children}</GlassSurface>
    </View>
  );
}

function TxnRow({
  txn,
  divider,
  ticked,
  onToggle,
  onPickCategory,
}: {
  txn: BankTxn;
  divider: boolean;
  ticked: boolean;
  onToggle: () => void;
  onPickCategory?: () => void;
}) {
  const theme = useTheme();
  const credit = txn.kind === 'credit';
  const cat = categoryOf(txn.category);
  const color = credit ? GOOD : cat.color;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}>
      <Ionicons
        name={ticked ? 'checkbox' : 'square-outline'}
        size={22}
        color={ticked ? theme.accent : theme.textSecondary}
      />
      <Pressable
        onPress={onPickCategory}
        disabled={!onPickCategory}
        hitSlop={6}
        accessibilityLabel={onPickCategory ? `Category: ${cat.label}. Tap to change` : undefined}
        style={[styles.rowIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={credit ? 'wallet' : cat.icon} size={17} color={color} />
      </Pressable>
      <View style={[styles.flex, !ticked && styles.dim]}>
        <ThemedText numberOfLines={1}>{txn.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {credit ? txn.bank : cat.label} · {fullDayLabel(txn.date)}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={[{ color: credit ? GOOD : theme.text }, !ticked && styles.dim]}>
        {formatMoney(txn.amount, { sign: credit })}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  white: { color: '#fff' },
  dim: { opacity: 0.45 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerSpacer: { width: 40 },
  body: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },

  permCard: { alignItems: 'center', padding: Spacing.four, gap: Spacing.two },
  permIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },

  ranges: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  rangeChip: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { gap: Spacing.two },
  sectionHead: { paddingHorizontal: Spacing.one, gap: 2 },
  sectionLabel: { letterSpacing: 1 },
  card: { paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
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

  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 16,
    marginTop: Spacing.one,
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
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
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
});
