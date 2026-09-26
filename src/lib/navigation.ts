import { router, type Href } from 'expo-router';

/**
 * `router.back()` that never dead-ends. If there's no history (e.g. a reload
 * or deep link landed us straight on this screen), go to `fallback` instead of
 * dispatching a GO_BACK nobody handles.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
