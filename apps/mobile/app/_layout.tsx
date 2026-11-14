import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ThemeProvider, useTheme } from '@/shared/theme'
import { appFonts } from '@/shared/theme/fonts'
import { loadStoredLocale } from '@/shared/i18n'
import '@/shared/i18n'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { ConfigErrorView } from '@/shared/ui/ConfigErrorView'

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
      refetchOnWindowFocus: false,
    },
  },
})

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts)

  useEffect(() => {
    void loadStoredLocale()
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
            <ThemedStack />
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
