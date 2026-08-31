import { Stack } from 'expo-router';

/** Expense Tracker section: the dashboard (`index`) + the add/edit sheet (`new`). */
export default function ExpensesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
