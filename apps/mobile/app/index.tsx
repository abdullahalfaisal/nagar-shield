import { Redirect } from 'expo-router'
import { useAuthSession } from '@/shared/auth/useAuthSession'
import { SplashView } from '@/shared/ui/SplashView'

/**
 * Entry gate. Sends the user to onboarding, login, or the app depending on
 * the session. The prototype's Splash (screen 0) is a branded hold, not a
 * separate route — this screen plays that role.
 *
 * A signed-in user is handed to the `(app)` group, and **that group's layout
 * is the one place that decides whether the app may open**: it holds the
 * splash screen until the account check and the biometric gate have both
 * answered, and redirects a disabled or deleted account, a locked app, or an
 * unreadable lock to the right screen.
 *
 * This screen used to run its own account check as well. It rendered nothing
 * protected, so the check added no safety here, but it ran the same request
 * twice on every launch and, while it was in flight, sent the user on to Home
 * without waiting for it — the duplicate gave the appearance of a check
 * without the substance of one.
 */
export default function Index() {
  const { session, loading } = useAuthSession()

  if (loading) {
    return <SplashView />
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />
  }

  return <Redirect href="/(app)/home" />
}
