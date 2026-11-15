import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { clearSessionStoreFailure, sessionPersistenceBroken } from '@/shared/api/session-storage'
import { StatusBanner } from './StatusBanner'

/**
 * The notice that tells the user their session will not persist.
 *
 * The story's edge case:
 *
 * > | SecureStore is unavailable on the device | Session persistence
 * > degrades to memory-only, the app still runs for the current session, and
 * > a localized notice explains that the session will not persist |
 *
 * This is that notice.
 *
 * The failure is **not** a React state event — it happens deep inside
 * `supabase-js`'s `_saveSession`, on a promise the app does not hold. So the
 * notice polls the store's recorded failure on an interval rather than
 * subscribing to an event that never fires.
 *
 * The interval is long (one second) because the thing being detected is
 * rare — a device whose Keystore is broken — and a user should not see a
 * banner appear and disappear because a poll landed between two writes.
 * Once the user has been told, the failure is cleared, so the banner shows
 * **once** per failure rather than lingering forever.
 */
export function SessionPersistenceNotice() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    // Checked immediately as well as on the interval: the failure may have
    // happened before this component mounted.
    const check = () => {
      if (!sessionPersistenceBroken()) return

      setBroken(true)
      // The user is being told. The next poll does not need to tell them
      // again.
      clearSessionStoreFailure()
    }

    const timer = setInterval(check, 1000)
    check()

    return () => clearInterval(timer)
  }, [])

  if (!broken) return null

  return (
    <View style={{ paddingTop: insets.top }}>
      <StatusBanner
        tone="warning"
        title={t('sessionPersistence.title')}
        body={`${t('sessionPersistence.message')} ${t('sessionPersistence.detail')}`}
      />
    </View>
  )
}
