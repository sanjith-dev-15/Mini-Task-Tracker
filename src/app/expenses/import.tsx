import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { clearSharedPayloads, useIncomingShare } from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/glass-icon-button';
import { GlassSurface } from '@/components/glass-surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadHandledSms, markSmsHandled, parseBankText, type BankTxn } from '@/lib/bank-sms';
import { CATEGORIES, categoryOf, type CategoryKey } from '@/lib/expense-categories';
import { formatMoney, fullDayLabel, monthKey, startOfDay, useExpenses } from '@/lib/expenses';
import { goBack } from '@/lib/navigation';

const GOOD = '#10B981';

/**
 * Expenses ▸ Import from SMS. Bank alerts arrive by Share (Messages ▸ Share ▸
 * Goku — routed here by `+native-intent.ts`) or by pasting; no SMS permission
 * is involved. Debits become expenses with a guessed category, credits are
 * added to that month's "Money I have". Parsing happens on the phone.
 */
export default function ImportSmsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { expenses, income, addExpense, setMonthlyIncome } = useExpenses();
  const { sharedPayloads } = useIncomingShare();

  const [text, setText] = useState('');
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Record<string, CategoryKey>>({});
  const [picking, setPicking] = useState<BankTxn | null>(null);

  useEffect(() => {
    loadHandledSms().then(setHandled);
  }, []);

  // Text shared from Messages (also when a new share arrives while this screen is open).
  useEffect(() => {
    const shared = sharedPayloads
      .filter((p) => p.shareType === 'text' || p.shareType === 'url')
      .map((p) => p.value.trim())
      .filter(Boolean);
    if (shared.length > 0) setText(shared.join('\n\n'));
  }, [sharedPayloads]);

  const { txns, skipped } = useMemo(() => parseBankText(text), [text]);
  const imported = useMemo(
    () => new Set(expenses.map((e) => e.smsKey).filter((k): k is string => !!k)),
    [expenses],
  );
  const fresh = txns
    .filter((t) => !handled.has(t.key) && !imported.has(t.key))
    .map((t) => (categories[t.key] ? { ...t, category: categories[t.key] } : t));
  const already = txns.length - fresh.length;
  const debits = fresh.filter((t) => t.kind === 'debit');
  const credits = fresh.filter((t) => t.kind === 'credit');
  const chosen = fresh.filter((t) => !unticked.has(t.key));

  const paste = async () => {
    const clip = (await Clipboard.getStringAsync()).trim();
    if (clip) setText((cur) => (cur.trim() ? `${cur.trim()}\n\n${clip}` : clip));
  };

  const clear = () => {
    setText('');
    clearSharedPayloads();
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
    setCategories((prev) => ({ ...prev, [key]: category }));
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
    await markSmsHandled(chosen.filter((t) => t.kind === 'credit').map((t) => t.key)).catch(
      () => {},
    );
    clearSharedPayloads();
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

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {Platform.OS === 'android' && (
          <GlassSurface style={styles.howCard}>
            <View style={[styles.howIcon, { backgroundColor: theme.accent + '1F' }]}>
              <Ionicons name="share-social" size={18} color={theme.accent} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              In your Messages app, long-press a bank SMS ▸{' '}
              <ThemedText type="smallBold">Share</ThemedText> ▸{' '}
              <ThemedText type="smallBold">Goku</ThemedText>. Or copy several and paste them
              below.
            </ThemedText>
          </GlassSurface>
        )}

        <View style={[styles.inputBox, { backgroundColor: theme.backgroundElement }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Paste bank SMS here…"
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            style={[styles.input, { color: theme.text }]}
          />
          <View style={styles.inputActions}>
            {text.length > 0 && (
              <Pressable onPress={clear} hitSlop={6} style={styles.inputBtn}>
                <Ionicons name="close-circle-outline" size={16} color={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Clear
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={paste}
              hitSlop={6}
              style={[styles.inputBtn, styles.pasteBtn, { backgroundColor: theme.accent }]}>
              <Ionicons name="clipboard-outline" size={15} color="#fff" />
              <ThemedText type="smallBold" style={styles.white}>
                Paste
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {text.trim().length > 0 && (
          <>
            {fresh.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {already > 0
                  ? 'These transactions are already added.'
                  : 'No bank transactions found in this text.'}
              </ThemedText>
            )}
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
            {fresh.length > 0 && (already > 0 || skipped > 0) && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {[
                  already > 0 && `${already} already added`,
                  skipped > 0 && `${skipped} not a bank transaction`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            )}
          </>
        )}
      </ScrollView>

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
        </View>
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
  const when = txn.dated ? fullDayLabel(txn.date) : 'Today (no date in SMS)';

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
          {credit ? txn.bank : cat.label} · {when}
        </ThemedText>
      </View>
      <ThemedText
        type="smallBold"
        style={[{ color: credit ? GOOD : theme.text }, !ticked && styles.dim]}>
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

  howCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputBox: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  input: { minHeight: 96, maxHeight: 200, fontSize: 14, padding: 0 },
  inputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.three,
  },
  inputBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pasteBtn: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
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
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: 16,
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
