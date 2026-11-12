import { Stack } from 'expo-router';
import { useAuthSession } from '@/shared/auth/useAuthSession';
import { useAccountStatus } from '@/shared/auth/useAccountStatus';
import { Redirect } from 'expo-router';
import { SplashView } from '@/shared/ui/SplashView';

/**
 * The signed-in app group. A signed-out user is bounced back to the auth flow.
 *
 * A **disabled** account is bounced to the disable screen instead. The
 * database refuses a disabled account's writes (migration 019), so letting
 * the user wander into a screen whose buttons cannot work would be a
 * dead end. The screen explains the situation and offers the two exits that
 * remain: delete the account, or sign out.
 *
 * The check runs on every foreground (`useAccountStatus` refreshes on
 * `AppState`), so a disable that lands while the app is backgrounded takes
 * effect on the next interaction.
 */
export default function AppLayout() {
  const { session, loading } = useAuthSession();
  const { status } = useAccountStatus(session?.user?.id);

  if (loading) {
    return <SplashView />;
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (status === 'disabled') {
    return <Redirect href="/(auth)/account-disabled" />;
  }

  if (status === 'deleted') {
    return <Redirect href="/(auth)/account-deleted" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="home" options={{ animation: 'fade' }} />
      <Stack.Screen name="more" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="capture" />
      <Stack.Screen name="location-sharing" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="history" />
      <Stack.Screen name="alerts" />
      <Stack.Screen name="alert-detail" />
      <Stack.Screen name="help-alert" />
      <Stack.Screen name="more-help" />
      <Stack.Screen name="station-map" />
    </Stack>
  );
}
