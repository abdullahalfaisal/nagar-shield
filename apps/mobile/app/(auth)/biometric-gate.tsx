import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Button, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import {
  clearLocalBiometricState,
  getBiometricType,
  isBiometricAvailable,
  mirrorBiometricState,
  readLocalBiometricState,
  recordBiometricAttempt,
  runBiometricPrompt,
} from '@/shared/auth/biometricService'
import { markGatePassed } from '@/shared/auth/useBiometricGate'

/**
 * Screen — Biometric Gate.
 *
 * FR-AUTH-4 and FR-AUTH-5. A returning user who opted into biometric
 * re-auth gets a fingerprint prompt instead of the password screen.
 *
 * The rules the PRD fixes, and how each is honoured here:
 *
 *   * **A failure never locks the user out.** The password screen is always
 *     one tap away, and it is the *only* escape from a failed prompt. Three
 *     failures in a row are counted, but the account still opens with the
 *     password the user already has.
 *   * **Three failures → the password screen.** The count is kept by the
 *     `record_biometric_attempt` RPC, which is the authority; the app
 *     renders its answer.
 *   * **Five failures in 24 h → biometric is auto-disabled** for the
 *     account. The RPC clears `biometric_opt_in`, and the app stops
 *     offering the gate on the next session.
 *
 * A **cancelled** prompt is counted as a failure, per the story's edge-case
 * table: the prompt is the only gate between the app and a live session,
 * and a gate that a dismissal walks past for free is not a gate. A device
 * that cannot do biometrics at all is not counted — that is a capability
 * question, not a decision by the user.
 */
export default function BiometricGateScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [kind, setKind] = useState<'fingerprint' | 'facial' | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [disabled, setDisabled] = useState(false)

  // The prompt fires once when the screen opens. A re-fire is the user
  // pressing the button, so the auto-prompt is guarded by a ref rather than
  // by state that would also flip on a re-render.
  const autoPrompted = useRef(false)

  const prompt = async () => {
    setBusy(true)
    setError(undefined)

    const outcome = await runBiometricPrompt(t('auth.biometricPrompt'))

    if (outcome === 'success') {
      try {
        const result = await recordBiometricAttempt(true)
        // The mirror follows the server's answer, never a locally computed
        // count — the two would drift.
        await mirrorBiometricState(result)
      } catch {
        // The accounting is a convenience on the success path. The
        // fingerprint already proved who the user is, so a failure to
        // record it must not block the sign-in.
        await clearLocalBiometricState()
      }

      // The gate is satisfied. Without this the app group layout would see
      // the account is opted in and redirect straight back here.
      await markGatePassed()

      router.replace('/(app)/home')
      return
    }

    if (outcome === 'unavailable') {
      // The device cannot do this after all — enrolled biometrics were
      // removed while the app was closed. Go to the password screen rather
      // than leaving the user on a dead prompt. This is **not** counted as
      // a failure: the device simply cannot do it, and the user did not
      // decline anything.
      router.replace('/(auth)/login')
      return
    }

    // A failure or a cancellation. Both are counted: the prompt is the
    // gate, and a gate that a dismissal walks past for free is not a gate.
    try {
      const result = await recordBiometricAttempt(false)
      await mirrorBiometricState(result)
      setAttemptsLeft(result.failCount)

      if (!result.biometricEnabled) {
        // Five failures in the window — the server has turned biometric
        // sign-in off for this account. The user is told why, then sent to
        // the password screen, which always works.
        setDisabled(true)
        setBusy(false)
        return
      }

      if (result.fallback === 'password') {
        router.replace('/(auth)/login')
        return
      }
    } catch {
      // The server could not be reached. The password screen is still the
      // right answer — the user must not be locked out by a network fault.
      setError(t('errors.network'))
    }

    setBusy(false)
  }

  useEffect(() => {
    let active = true

    void (async () => {
      const ok = await isBiometricAvailable()
      const type = ok ? await getBiometricType() : null
      if (!active) return

      setAvailable(ok)
      setKind(type)

      // The device mirror is read first so the attempt count is on screen
      // without waiting for the network. The server's count replaces it
      // when the prompt is answered.
      const local = await readLocalBiometricState()
      if (active && local.failCount > 0) {
        setAttemptsLeft(local.failCount)
      }

      // No biometric on this device (or none enrolled): there is no gate to
      // show, so the password screen is the answer.
      if (!ok) {
        router.replace('/(auth)/login')
        return
      }

      if (!autoPrompted.current) {
        autoPrompted.current = true
        void prompt()
      }
    })()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const iconName = kind === 'facial' ? 'face' : 'fingerprint'

  // Once the server has auto-disabled biometric sign-in there is nothing to
  // retry — the only way forward is the password. The screen says so rather
  // than offering a button that cannot work.
  const autoDisabled = disabled || (attemptsLeft !== null && attemptsLeft >= 5)

  return (
    <WizardScreen
      eyebrow={t('common.appName')}
      title={autoDisabled ? t('auth.biometricDisabled') : t('auth.biometricPrompt')}
      subtitle={t('auth.biometricFallback')}
      footer={
        autoDisabled ? (
          <Button
            label={t('auth.biometricFallback')}
            variant="primary"
            size="lg"
            disabled={busy}
            onPress={() => router.replace('/(auth)/login')}
          />
        ) : (
          <>
            <Button
              label={t('auth.biometricPrompt')}
              variant="primary"
              size="lg"
              icon="fingerprint"
              disabled={busy || available === false}
              onPress={prompt}
            />
            <Button
              label={t('auth.biometricFallback')}
              variant="secondary"
              size="lg"
              disabled={busy}
              onPress={() => router.replace('/(auth)/login')}
            />
          </>
        )
      }
    >
      <View style={styles.badge}>
        <Icon name={iconName} size={44} color={theme.palette.violet[600]} />
      </View>

      {attemptsLeft !== null && attemptsLeft > 0 ? (
        <Text style={[styles.attempts, { color: theme.colors.ink[500] }]}>
          {t('auth.biometricFailed', { count: attemptsLeft })}
        </Text>
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: theme.palette.red[600] }]}>{error}</Text>
      ) : null}

      {busy ? (
        <ActivityIndicator
          style={styles.spinner}
          color={theme.palette.violet[600]}
          accessibilityLabel={t('common.loading')}
        />
      ) : null}
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  attempts: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 18,
  },
  error: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
})
