import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'
import { AppBar } from './AppBar'

interface ScreenProps {
  children: React.ReactNode
  /** Renders the app bar above the content. */
  title?: string
  subtitle?: string
  onBack?: () => void
  action?: { icon: string; onPress: () => void; accessibilityLabel: string; badge?: boolean }
  scroll?: boolean
  /** Sticky footer rendered above the safe-area inset. */
  footer?: React.ReactNode
  background?: string
  /** Extra bottom padding so a sticky CTA never covers the last row. */
  contentBottomPadding?: number
  /**
   * The pull-to-refresh control.
   *
   * **Optional** and **`undefined` by default**, so a screen that has no
   * pull-to-refresh is unchanged — the `ScrollView` simply has no
   * `refreshControl` prop at all.
   *
   * It is a prop rather than something `Screen` builds itself because the
   * control needs the screen's own `refetch` and `isRefetching`, and
   * `Screen` has no business knowing about the feed.
   */
  refreshControl?: React.ReactElement<RefreshControlProps>
}

/**
 * The standard screen frame: app bar, scrolling content, optional sticky footer.
 * Every feature screen in the app uses this so the chrome stays identical.
 */
export function Screen({
  children,
  title,
  subtitle,
  onBack,
  action,
  scroll = true,
  footer,
  background,
  contentBottomPadding = 0,
  refreshControl,
}: ScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{
        // The footer adds the inset itself; a screen without one ends at the content, which
        // would sit under the gesture bar.
        paddingBottom: contentBottomPadding + 24 + (footer ? 0 : insets.bottom),
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flexBody}>{children}</View>
  )

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: background ?? theme.colors.surface.lavender,
          // The app bar adds the top inset itself; without one the content would sit under the status bar.
          paddingTop: title ? 0 : insets.top,
        },
      ]}
    >
      {title ? <AppBar title={title} subtitle={subtitle} onBack={onBack} action={action} /> : null}
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom }]}>{footer}</View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  flexBody: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
})
