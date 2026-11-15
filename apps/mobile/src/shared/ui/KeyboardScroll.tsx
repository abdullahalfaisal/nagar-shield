import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'

interface KeyboardScrollProps {
  children: React.ReactNode
  /** Rendered below the scrolling content, pinned, and lifted above the keyboard. */
  footer?: React.ReactNode
  contentStyle?: StyleProp<ViewStyle>
}

/**
 * A form frame that survives a small screen: the content scrolls when it is
 * taller than the viewport, and the keyboard pushes the fields up instead of
 * covering them. `flexGrow` keeps short content filling the screen, so a
 * `flex: 1` child still lays out as it did before.
 */
export function KeyboardScroll({ children, footer, contentStyle }: KeyboardScrollProps) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Edge-to-edge Android no longer resizes the window for the keyboard.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.grow, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
})
