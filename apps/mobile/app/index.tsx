import { Redirect } from 'expo-router';
import { useAuthSession } from '@/shared/auth/useAuthSession';
import { useAccountStatus } from '@/shared/auth/useAccountStatus';
import { SplashView } from '@/shared/ui/SplashView';

/**
 * Entry gate. Sends the user to onboarding, login, or the app depending on
 * the session. The prototype's Splash (screen 0) is a branded hold, not a
 * separate route — this screen plays that role.
 */
export default function Index() {
  const { session, loading } = useAuthSession();
  const { status } = useAccountStatus(session?.user?.id);

  if (loading) {
    return <SplashView />;
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // A disabled account never reaches the app: the database refuses its
  // writes, so it goes straight to the explanation screen.
  if (status === 'disabled') {
    return <Redirect href="/(auth)/account-disabled" />;
  }

  // A soft-deleted account can take itself back inside the 30-day window.
  if (status === 'deleted') {
    return <Redirect href="/(auth)/account-deleted" />;
  }

  return <Redirect href="/(app)/home" />;
}
