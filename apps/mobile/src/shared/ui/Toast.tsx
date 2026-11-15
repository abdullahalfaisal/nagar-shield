import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'
import { haptic } from '../services/haptics'
import { Icon } from './Icon'

export type ToastTone = 'success' | 'error' | 'info'

interface ToastInput {
  message: string
  tone?: ToastTone
}

interface ToastState extends ToastInput {
  id: number
  tone: ToastTone
}

interface ToastApi {
  show: (toast: ToastInput) => void
}

/** How long a toast stays on screen. */
export const TOAST_DURATION_MS = 3000

/**
 * The default is a no-op, so a screen rendered outside the provider (a test,
 * the config-error view) simply shows nothing instead of crashing.
 */
const ToastContext = createContext<ToastApi>({ show: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/**
 * The one place the app confirms something small: a report sent, a contact
 * saved. It sits above the bottom inset, hides itself, and is announced to the
 * screen reader — a toast a TalkBack user never hears is not feedback.
 *
 * One toast at a time: a new one replaces the one on screen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const counter = useRef(0)

  const show = useCallback((input: ToastInput) => {
    const tone = input.tone ?? 'info'

    counter.current += 1
    setToast({ id: counter.current, message: input.message, tone })

    if (tone === 'success') haptic('success')
    else if (tone === 'error') haptic('error')

    void AccessibilityInfo.announceForAccessibility(input.message)

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} /> : null}
    </ToastContext.Provider>
  )
}

function ToastView({ toast }: { toast: ToastState }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const { icon, color } =
    toast.tone === 'success'
      ? { icon: 'check_circle', color: theme.palette.green[600] }
      : toast.tone === 'error'
        ? { icon: 'error', color: theme.palette.red[600] }
        : { icon: 'info', color: theme.palette.violet[600] }

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 16 }]}>
      <View
        accessibilityRole={toast.tone === 'error' ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.ink[900],
            borderColor: theme.colors.ink[700],
          },
        ]}
      >
        <Icon name={icon} size={20} color={color} filled />
        <Text style={[styles.message, { color: theme.colors.surface.white }]} numberOfLines={3}>
          {toast.message}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 480,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
})
