import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useAuthSession } from '@/shared/auth/useAuthSession'
import { useAccountStatus } from '@/shared/auth/useAccountStatus'
import { useBiometricGate } from '@/shared/auth/useBiometricGate'
import { Redirect } from 'expo-router'
import { useTheme } from '@/shared/theme'
import { SplashView } from '@/shared/ui/SplashView'
import { SessionPersistenceNotice } from '@/shared/ui/SessionPersistenceNotice'
import { useQueueDrain } from '@/shared/services/useQueueDrain'

/**
 * The offline queue is sent from the app group, not only from the Capture
 * screen: a report queued offline goes out when the network returns, wherever
 * the user is in the app. It does nothing without a session.
 *
 * It is a component rather than a hook call in the layout so it only runs
 * once the app itself is open. Called from the layout, it started sending
 * before the account check had answered — a disabled account fired writes the
 * database would refuse, and a locked app sent from behind the lock.
 */
function QueueDrain() {
  useQueueDrain()
  return null
}

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
 *
 * **Nothing protected renders until both checks have answered.** The account
 * check and the biometric gate both start when the layout mounts, and the
 * layout used to render Home while they were still running: Home showed for
 * a moment behind the lock, and its queries fired for an account that turned
 * out to be disabled. The splash screen now holds until both are settled.
 * Neither check waits on the network for long — the gate decides from its
 * stored opt-in, and the account check gives up after a few seconds — so a
 * user who is not opted in still reaches Home quickly.
 */
export default function AppLayout() {
  const theme = useTheme()
  const { session, loading } = useAuthSession()
  const userId = session?.user?.id
  const { status, settled } = useAccountStatus(userId)
  const { state: gate } = useBiometricGate(userId)

  // Whether the navigator has been shown in this mount. The gate goes back to
  // `checking` when the app returns from a long background; by then the user
  // is somewhere inside the app, and replacing the navigator with the splash
  // would unmount the screen they were on (a half-filled report, an open
  // map). So the first check renders the splash *instead of* the app, and a
  // re-check covers the app with it and keeps the navigator mounted.
  const appShown = useRef(false)

  const resolving = gate === 'checking' || !settled
  const blocked =
    loading ||
    !session ||
    status === 'disabled' ||
    status === 'deleted' ||
    gate === 'required' ||
    gate === 'password-required'
  const showApp = !blocked && (!resolving || appShown.current)

  useEffect(() => {
    if (showApp) appShown.current = true
  }, [showApp])

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

  // The lock applies but the fingerprint cannot be used — the device lost
  // its enrolled biometrics, or the opt-in could not be read from the server
  // or the device. The password is the way in; the login screen marks the
  // new session as password-verified, so it does not loop back here.
  if (gate === 'password-required') {
    return <Redirect href="/(auth)/login" />
  }

  if (!showApp) {
    return <SplashView />
  }

  return (
    <View style={{ flex: 1 }}>
      <QueueDrain />
      {/*
        The session-persistence notice. It sits above the navigator so it is
        visible on every screen in the group — the problem it reports (the
        device cannot store the session) is not a property of any one
        screen.
      */}
      <SessionPersistenceNotice />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="home" options={{ animation: 'fade' }} />
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
      {resolving ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surface.lavender }]}>
          <SplashView />
        </View>
      ) : null}
    </View>
  )
}
