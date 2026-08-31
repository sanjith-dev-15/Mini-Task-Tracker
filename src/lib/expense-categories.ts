import type { Ionicons } from '@expo/vector-icons';

export type CategoryKey =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'fun'
  | 'other';

export type Category = {
  key: CategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent used for the category dot, bar segment and icon chip. */
  color: string;
};

/** The fixed set of spend categories, in display order. */
export const CATEGORIES: Category[] = [
  { key: 'food', label: 'Food & Drink', icon: 'restaurant', color: '#F59E0B' },
  { key: 'transport', label: 'Transport', icon: 'car-sport', color: '#3B82F6' },
  { key: 'shopping', label: 'Shopping', icon: 'bag-handle', color: '#EC4899' },
  { key: 'bills', label: 'Bills', icon: 'receipt', color: '#8B5CF6' },
  { key: 'health', label: 'Health', icon: 'fitness', color: '#10B981' },
  { key: 'fun', label: 'Fun', icon: 'game-controller', color: '#F43F5E' },
  { key: 'other', label: 'Other', icon: 'pricetag', color: '#64748B' },
];

const FALLBACK = CATEGORIES[CATEGORIES.length - 1];

export function categoryOf(key: string): Category {
  return CATEGORIES.find((c) => c.key === key) ?? FALLBACK;
}
