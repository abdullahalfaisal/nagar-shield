import { useEffect } from 'react'
import { AppState, View } from 'react-native'
import { Stack } from 'expo-router'
import { useAuthSession } from '@/shared/auth/useAuthSession'
import { useAccountStatus } from '@/shared/auth/useAccountStatus'
import {
  useBiometricGate,
  clearPasswordSignIn,
  clearGatePassed,
} from '@/shared/auth/useBiometricGate'
import { Redirect } from 'expo-router'
import { SplashView } from '@/shared/ui/SplashView'
import { SessionPersistenceNotice } from '@/shared/ui/SessionPersistenceNotice'

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
  const { session, loading } = useAuthSession()
  const { status } = useAccountStatus(session?.user?.id)
  const { state: gate } = useBiometricGate(session?.user?.id)

  // The app going to the background ends the "signed in with a password"
  // grace and the "gate already passed" grace. The next foreground is a
  // returning session, and the biometric gate applies to it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        void clearPasswordSignIn()
        void clearGatePassed()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])

  if (loading) {
    return <SplashView />
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />
  }

  if (status === 'disabled') {
    return <Redirect href="/(auth)/account-disabled" />
  }

  if (status === 'deleted') {
    return <Redirect href="/(auth)/account-deleted" />
  }

  // The biometric gate (FR-AUTH-4). A user who opted in and whose device
  // can do it must pass the fingerprint check before the app opens.
  if (gate === 'required') {
    return <Redirect href="/(auth)/biometric-gate" />
  }

  return (
    <View style={{ flex: 1 }}>
      {/*
        The session-persistence notice. It sits above the navigator so it is
        visible on every screen in the group — the problem it reports (the
        device cannot store the session) is not a property of any one
        screen.
      */}
      <SessionPersistenceNotice />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="home" options={{ animation: 'fade' }} />
        <Stack.Screen name="more" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="capture" />
        <Stack.Screen name="location-sharing" />
        <Stack.Screen name="contacts" />
        <Stack.Screen name="contact-editor" />
        <Stack.Screen name="history" />
        <Stack.Screen name="history-map" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="alert-detail" />
        <Stack.Screen name="report-detail" />
        <Stack.Screen name="help-alert" />
        <Stack.Screen name="more-help" />
        <Stack.Screen name="thana-line" />
        <Stack.Screen name="station-map" />
      </Stack>
    </View>
  )
}
