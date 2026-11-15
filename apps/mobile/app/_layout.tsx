import { useEffect } from 'react'
import { AppState } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ThemeProvider, useTheme } from '@/shared/theme'
import { appFonts } from '@/shared/theme/fonts'
import { loadStoredLocale } from '@/shared/i18n'
import '@/shared/i18n'
import { isSupabaseConfigured, supabase } from '@/shared/api/supabase'
import { onSessionWindowExpired } from '@/shared/api/session-storage'
import { ConfigErrorView } from '@/shared/ui/ConfigErrorView'
import { ToastProvider } from '@/shared/ui/Toast'

/**
 * Root layout. Owns the font loading gate, the theme provider, the query
 * client and the navigation stack.
 *
 * The prototype's fake iOS status bar is NOT ported — the real device status
 * bar is used (see `ux-guide.md` § approved prototype deviations).
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // React Native has no window focus, so the app's own foreground event
      // stands in for it (wired below): a list left stale while the app slept
      // refreshes the moment the app is opened again.
      refetchOnWindowFocus: true,
    },
  },
})

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts)

  useEffect(() => {
    void loadStoredLocale()
  }, [])

  // Tells the cache when the app is in front. Without this React Query thinks
  // it is always focused and never refreshes anything on resume.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      focusManager.setFocused(next === 'active')
    })
    return () => subscription.remove()
  }, [])

  // The session's edges, handled once for the whole app.
  useEffect(() => {
    if (!isSupabaseConfigured) return

    // The data cache belongs to one user. Its keys do not carry a user id, so a
    // cache kept across a sign-out would show the next person to sign in the
    // previous person's contacts and reports until it refetched — and kept
    // showing them if that refetch failed offline.
    let lastUserId: string | null | undefined
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null
      if (event === 'SIGNED_OUT' || (lastUserId !== undefined && userId !== lastUserId)) {
        queryClient.clear()
      }
      lastUserId = userId
    })

    // A session past its window reads as missing from storage, but nothing
    // told the app: the screens stayed up, queries went out with no session and
    // came back empty. Ending the session locally makes the route guards act.
    const stopExpiry = onSessionWindowExpired(() => {
      void supabase.auth.signOut({ scope: 'local' })
    })

    // Reading the session on foreground is what notices a window that ended
    // while the app was in the background.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void supabase.auth.getSession()
    })

    return () => {
      data.subscription.unsubscribe()
      stopExpiry()
      appState.remove()
    }
  }, [])

  useEffect(() => {
    if (fontError) {
      // A missing icon font would render ligature text instead of icons.
      console.warn('Font loading failed:', fontError.message)
    }
  }, [fontError])

  if (!fontsLoaded && !fontError) {
    return null
  }

  // A build without its Supabase credentials cannot reach the API. The
  // Supabase module used to throw at import time, which crashed the app on
  // every route before a single screen rendered. The failure is now
  // **localised**: the app boots and shows the explanation instead.
  if (!isSupabaseConfigured) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <ConfigErrorView />
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <ThemedStack />
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function ThemedStack() {
  const theme = useTheme()

  return (
    <>
      <StatusBar style={theme.colors.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.surface.lavender },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(app)" />
        {/* The design-system showcase — reachable without an account. */}
        <Stack.Screen name="showcase" options={{ animation: 'fade' }} />
      </Stack>
    </>
  )
}
