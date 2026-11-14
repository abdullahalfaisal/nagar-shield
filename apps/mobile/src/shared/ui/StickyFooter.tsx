import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'

interface StickyFooterProps {
  children: ReactNode
  /** Drawn above the footer, e.g. the wizard's muted escape link. */
  secondary?: ReactNode
}

/**
 * `.sticky-cta` / `.wizard-sticky` — the footer that sits at the bottom of a
 * screen and holds the primary call to action.
 *
 * The prototype's sticky footer uses a translucent fill (`--app-bar-bg`) and a
 * hairline top border, so the content behind it stays visible but the action
 * reads as pinned. React Native has no `backdrop-filter`, so the translucency
 * is approximated with the same semi-opaque colour the app bar uses.
 */
export function StickyFooter({ children, secondary }: StickyFooterProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: 18 + insets.bottom,
          backgroundColor: theme.colors.appBarBg,
          borderTopColor: theme.colors.ink[100],
        },
      ]}
    >
      {children}
      {secondary}
    </View>
  )
}

const styles = StyleSheet.create({
  footer: {
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
})
