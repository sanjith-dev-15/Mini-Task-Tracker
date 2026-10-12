/**
 * Rewrites incoming deep links before Expo Router handles them. Text shared
 * into the app (Messages ▸ Share ▸ Goku) arrives as `app://expo-sharing`
 * (see expo-sharing) — send it to the bank-SMS importer. Everything else
 * (e.g. the arrival card's reminder links) passes through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes('://expo-sharing')) return '/expenses/import';
  return path;
}
