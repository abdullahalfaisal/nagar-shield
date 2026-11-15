import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/shared/ui/Toast'
import { logOut } from './authService'

/**
 * Signs the user out and returns them to the welcome screen.
 *
 * Shared by Settings and More Options so the two logout rows cannot drift
 * (More's row used to open Settings instead of signing out). Unsent reports
 * are kept for their author, and the user is told where they are. A failure is
 * reported rather than left as an unhandled rejection, and a second tap while
 * one is running is ignored.
 */
export function useSignOut() {
  const router = useRouter()
  const { t } = useTranslation()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const { keptUploads } = await logOut()

      if (keptUploads > 0) {
        Alert.alert(t('settings.keepQueueNotice', { count: keptUploads }), undefined, [
          { text: t('common.done'), onPress: () => router.replace('/(auth)/welcome') },
        ])
        return
      }

      router.replace('/(auth)/welcome')
    } catch {
      toast.show({ message: t('errors.internal'), tone: 'error' })
      setSigningOut(false)
    }
  }, [router, signingOut, t, toast])

  return { signOut, signingOut }
}
