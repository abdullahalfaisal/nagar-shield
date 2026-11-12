import { Stack } from 'expo-router';
import { useAuthSession } from '@/shared/auth/useAuthSession';
import { Redirect } from 'expo-router';
import { SplashView } from '@/shared/ui/SplashView';

/**
 * The signed-in app group. A signed-out user is bounced back to the auth flow.
 */
export default function AppLayout() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return <SplashView />;
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
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
