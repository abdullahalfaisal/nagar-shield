import { Stack } from 'expo-router'

/**
 * The auth group. Screens here are only reachable while signed out.
 *
 * `account-disabled` is the exception: a disabled account still holds a
 * session, so the app group hands it over to this screen rather than
 * signing the user out (see `useAccountStatus`).
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="alternate-phone" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      {/* The three onboarding contact steps — S-04a / S-04b / S-04c. */}
      <Stack.Screen name="contact-1" />
      <Stack.Screen name="contact-2" />
      <Stack.Screen name="contact-3" />
      <Stack.Screen name="location-permission" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="account-disabled" options={{ animation: 'fade' }} />
      <Stack.Screen name="account-deleted" options={{ animation: 'fade' }} />
      <Stack.Screen name="biometric-gate" options={{ animation: 'fade' }} />
    </Stack>
  )
}
