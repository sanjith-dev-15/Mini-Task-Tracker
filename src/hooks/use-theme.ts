/**
 * Back-compat shim. The real implementation lives in `src/lib/theme.tsx`.
 * `useTheme()` returns the colors for the active scheme; components that need
 * to read or change the selected mode should use `useThemeContext()` directly.
 */
export { useColors as useTheme } from '@/lib/theme';
