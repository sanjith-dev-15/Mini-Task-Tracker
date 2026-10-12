import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CategoryKey } from '@/lib/expense-categories';
import type { InboxSms } from '../../modules/sms-reader';

/**
 * Turns Indian bank / UPI alert SMS into transactions for Expenses ▸ Import
 * from SMS. Runs entirely on the device; only the parsed fields are kept.
 */
export type BankTxn = {
  /** Stable across devices (received time + amount) — used to skip re-imports. */
  key: string;
  kind: 'debit' | 'credit';
  amount: number;
  title: string;
  category: CategoryKey;
  /** When the SMS arrived, epoch ms. */
  date: number;
  bank: string;
  body: string;
};

const AMOUNT_RE = /(?:\brs\.?|\binr|₹)\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
/** SBI-style "debited by 250.0" with no currency marker. */
const BARE_AMOUNT_RE = /\b(?:debited|credited)\s+(?:by|with|for)\s+(\d[\d,]*(?:\.\d{1,2})?)/i;
/** Text just before an amount that means it's a balance / limit, not the transaction. */
const BALANCE_BEFORE_RE = /(?:bal(?:ance)?|limit|outstanding|due)\b[\s:.-]*(?:is|of)?[\s:.-]*$/i;

const DEBIT_RE = /\b(?:debited|debit|spent|paid|sent|withdrawn|withdrawal|purchase|deducted)\b/i;
const CREDIT_RE = /\b(?:credited|received|deposited|refund(?:ed)?)\b/i;

/** OTPs and anything that isn't a completed transaction. */
const SKIP_RE = new RegExp(
  [
    String.raw`\botp\b`,
    String.raw`one[- ]time password`,
    String.raw`verification code`,
    String.raw`\bcvv\b`,
    String.raw`will be (?:debited|credited|deducted)`,
    String.raw`\bis due\b`,
    String.raw`\bdue (?:on|by|date)\b`,
    String.raw`\brequested\b`,
    String.raw`collect request`,
    String.raw`pre-?approved`,
    String.raw`\beligible\b`,
    String.raw`apply now`,
    String.raw`\boffer\b`,
    String.raw`\b(?:failed|declined|unsuccessful)\b`,
    // "Payment of Rs X received towards your credit card" — a bill payment, not income.
    String.raw`\bpayment\b[^.]{0,40}\breceived\b`,
  ].join('|'),
  'i',
);

/** First word(s) of a captured name that mean we caught the wrong thing. */
const NOT_A_NAME_RE =
  /^(?:a\/?c|ac|acct|account|your|you|the|card|upi|vpa|bank|beneficiary|rs|inr|mobile|ref|txn|imps|neft|rtgs|p2a|p2m)\b/i;

const BANKS: [string, string][] = [
  ['HDFC', 'HDFC Bank'],
  ['SBI', 'SBI'],
  ['CBSSBI', 'SBI'],
  ['ATMSBI', 'SBI'],
  ['ICICI', 'ICICI Bank'],
  ['AXIS', 'Axis Bank'],
  ['KOTAK', 'Kotak Bank'],
  ['PNB', 'PNB'],
  ['BOI', 'Bank of India'],
  ['CANBNK', 'Canara Bank'],
  ['CANARA', 'Canara Bank'],
  ['IDFC', 'IDFC First'],
  ['YESB', 'Yes Bank'],
  ['INDUS', 'IndusInd Bank'],
  ['UNION', 'Union Bank'],
  ['UBOI', 'Union Bank'],
  ['BOB', 'Bank of Baroda'],
  ['BARODA', 'Bank of Baroda'],
  ['FED', 'Federal Bank'],
  ['IOB', 'Indian Overseas Bank'],
  ['INDBNK', 'Indian Bank'],
  ['AUBANK', 'AU Bank'],
  ['KVB', 'Karur Vysya Bank'],
  ['CUB', 'City Union Bank'],
  ['TMB', 'TMB'],
  ['PAYTM', 'Paytm'],
];

const CATEGORY_WORDS: [CategoryKey, string[]][] = [
  [
    'food',
    [
      'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'bakery', 'hotel', 'dominos', 'pizza',
      'kfc', 'mcdonald', 'starbucks', 'burger', 'biryani', 'eatfit', 'blinkit', 'zepto',
      'instamart', 'bigbasket', 'grocery', 'groceries', 'dunzo', 'chai', 'juice', 'sweets',
    ],
  ],
  [
    'transport',
    [
      'uber', 'ola', 'rapido', 'irctc', 'redbus', 'metro', 'fuel', 'petrol', 'diesel', 'hpcl',
      'bpcl', 'iocl', 'indian oil', 'fastag', 'parking', 'indigo', 'air india', 'akasa',
      'makemytrip', 'goibibo', 'yatra', 'railway', 'toll',
    ],
  ],
  [
    'shopping',
    [
      'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'dmart', 'reliance', 'trends',
      'decathlon', 'croma', 'ikea', 'tata cliq', 'lifestyle', 'max fashion', 'zudio', 'westside',
      'shoppers stop', 'lenskart', 'mall', 'store', 'mart',
    ],
  ],
  [
    'bills',
    [
      'electricity', 'bescom', 'tneb', 'tangedco', 'msedcl', 'recharge', 'airtel', 'jio',
      'vodafone', 'bsnl', 'broadband', 'fibernet', 'gas', 'insurance', 'lic', 'emi', 'rent',
      'bill', 'postpaid', 'prepaid', 'dth', 'tata play', 'water', 'cred', 'loan',
    ],
  ],
  [
    'health',
    [
      'pharmacy', 'pharma', 'medical', 'apollo', 'medplus', '1mg', 'pharmeasy', 'netmeds',
      'hospital', 'clinic', 'diagnostic', 'lab', 'dental', 'gym', 'cult.fit', 'cultfit',
    ],
  ],
  [
    'fun',
    [
      'netflix', 'spotify', 'prime video', 'hotstar', 'bookmyshow', 'pvr', 'inox', 'steam',
      'playstation', 'youtube', 'zee5', 'sonyliv', 'jiocinema', 'gaming', 'movie', 'cinema',
    ],
  ],
];

function bankOf(address: string): string {
  const parts = address.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const p of parts) {
    // Some headers carry a prefix letter (IPAYTM), so longer names may sit mid-word.
    const hit = BANKS.find(([name]) => p.startsWith(name) || (name.length >= 5 && p.includes(name)));
    if (hit) return hit[1];
  }
  return 'Bank';
}

function toNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

function amountOf(body: string): number | null {
  for (const m of body.matchAll(AMOUNT_RE)) {
    const before = body.slice(Math.max(0, (m.index ?? 0) - 25), m.index);
    if (BALANCE_BEFORE_RE.test(before)) continue;
    const n = toNumber(m[1]);
    if (n > 0) return n;
  }
  const bare = body.match(BARE_AMOUNT_RE);
  if (bare) {
    const n = toNumber(bare[1]);
    if (n > 0) return n;
  }
  return null;
}

/** Whichever of the debit / credit words comes first decides the direction. */
function kindOf(body: string): 'debit' | 'credit' | null {
  const d = body.search(DEBIT_RE);
  const c = body.search(CREDIT_RE);
  if (d < 0 && c < 0) return null;
  if (c < 0) return 'debit';
  if (d < 0) return 'credit';
  return d <= c ? 'debit' : 'credit';
}

function tidy(raw: string): string | null {
  let s = raw
    .replace(/[._*-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/\b(?:on|via|ref|upi|at|from|to)$/i, '').trim();
  if (s.length < 2 || NOT_A_NAME_RE.test(s)) return null;
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    s = s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }
  return s.length > 28 ? s.slice(0, 28).trim() : s;
}

/** Best guess at who was paid (debit) or who paid (credit). */
function counterpartyOf(body: string, kind: 'debit' | 'credit'): string | null {
  // ICICI: "...debited for Rs 250.00 on 12-Oct-26; SWIGGY credited."
  if (kind === 'debit') {
    const m = body.match(/;\s*([^;.]{2,40}?)\s+credited\b/i);
    const name = m && tidy(m[1]);
    if (name) return name;
  }

  // UPI handle: swiggy@icici, merchant.name@okaxis (phone-number handles are skipped).
  for (const m of body.matchAll(/\b([a-z][a-z0-9._-]{1,})@([a-z]{2,})\b(?!\.)/gi)) {
    const name = tidy(m[1]);
    if (name) return name;
  }

  const lead = kind === 'debit' ? String.raw`(?:to|at|towards)` : String.raw`(?:from|by)`;
  const named = new RegExp(
    String.raw`\b${lead}\s+(?:vpa\s+)?([A-Za-z][A-Za-z0-9 &'._*-]{1,40}?)(?=\s+(?:on|via|ref|refno|upi|avl|from|using|thru|through|txn|with|by|info)\b|[.,;:(]|\s*$)`,
    'gi',
  );
  for (const m of body.matchAll(named)) {
    const name = tidy(m[1]);
    if (name) return name;
  }

  // "Info: UPI/P2M/123456/CRED"
  const info = body.match(/\binfo[:\s-]+([^\s.,]{2,60})/i);
  if (info) {
    for (const seg of info[1].split('/')) {
      const name = tidy(seg);
      if (name) return name;
    }
  }
  return null;
}

function categoryOfText(text: string): CategoryKey {
  const t = text.toLowerCase();
  for (const [key, words] of CATEGORY_WORDS) {
    if (words.some((w) => new RegExp(String.raw`\b${w.replace(/\./g, '\\.')}\b`).test(t))) {
      return key;
    }
  }
  return 'other';
}

/** The merchant name is the strongest signal; fall back to the whole message. */
function guessCategory(who: string | null, body: string): CategoryKey {
  const fromName = who ? categoryOfText(who) : 'other';
  return fromName !== 'other' ? fromName : categoryOfText(body);
}

/** One SMS → a transaction, or null if it isn't a completed bank debit / credit. */
export function parseBankSms(sms: InboxSms): BankTxn | null {
  const body = sms.body.replace(/\s+/g, ' ').trim();
  // Personal numbers send chats, not bank alerts (banks use headers like VM-HDFCBK).
  if (/^\+?\d{10,}$/.test(sms.address.trim())) return null;
  if (SKIP_RE.test(body)) return null;

  const kind = kindOf(body);
  if (!kind) return null;
  const amount = amountOf(body);
  if (amount == null || amount >= 1e8) return null;

  const bank = bankOf(sms.address);
  const who = counterpartyOf(body, kind);
  const title = who ?? (kind === 'debit' ? `${bank} payment` : `${bank} credit`);

  return {
    key: `sms:${sms.date}:${amount}`,
    kind,
    amount,
    title,
    category: kind === 'debit' ? guessCategory(who, body) : 'other',
    date: sms.date,
    bank,
    body,
  };
}

/**
 * Keys of SMS already handled on this device — imported (credits have no
 * expense row to carry `smsKey`) or unticked and skipped — so they don't show again.
 */
const HANDLED_KEY = 'expenses:sms-handled:v1';

export async function loadHandledSms(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function markSmsHandled(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const set = await loadHandledSms();
  for (const k of keys) set.add(k);
  await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...set]));
}

export function parseBankInbox(list: InboxSms[]): BankTxn[] {
  const seen = new Set<string>();
  const out: BankTxn[] = [];
  for (const sms of list) {
    const t = parseBankSms(sms);
    if (!t || seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
  }
  return out;
}
