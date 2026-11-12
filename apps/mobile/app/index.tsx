import { Redirect } from 'expo-router';
import { useAuthSession } from '@/shared/auth/useAuthSession';
import { SplashView } from '@/shared/ui/SplashView';

/**
 * Entry gate. Sends the user to onboarding, login, or the app depending on
 * the session. The prototype's Splash (screen 0) is a branded hold, not a
 * separate route — this screen plays that role.
 */
export default function Index() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return <SplashView />;
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(app)/home" />;
}
