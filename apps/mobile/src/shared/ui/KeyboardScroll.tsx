import { useEffect, useRef, useState, type ComponentRef } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'

interface KeyboardScrollProps {
  children: React.ReactNode
  /** Rendered below the scrolling content, pinned, and lifted above the keyboard. */
  footer?: React.ReactNode
  contentStyle?: StyleProp<ViewStyle>
  /**
   * Scrolls to the end of the content when the keyboard opens, so the button
   * under the last field is not left behind it. Off by default: on a long form
   * that would scroll the field being typed in out of sight.
   */
  revealEnd?: boolean
}

/**
 * A form frame that survives a small screen: the content scrolls when it is
 * taller than the viewport, and the keyboard pushes the fields up instead of
 * covering them. `flexGrow` keeps short content filling the screen, so a
 * `flex: 1` child still lays out as it did before.
 *
 * iOS lets `KeyboardAvoidingView` pad for the keyboard. Edge-to-edge Android no
 * longer resizes the window for it, and `KeyboardAvoidingView`'s `height`
 * behaviour does not cope with that, so the frame measures how far the keyboard
 * reaches into it and pads by exactly that. If the window did resize, the frame
 * ends above the keyboard and the padding is zero, so it is never counted twice.
 */
export function KeyboardScroll({ children, footer, contentStyle, revealEnd }: KeyboardScrollProps) {
  const frame = useRef<ComponentRef<typeof View>>(null)
  const scroll = useRef<ScrollViewInstance>(null)
  const [overlap, setOverlap] = useState(0)

  useEffect(() => {
    if (Platform.OS === 'ios') return undefined

    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      frame.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        setOverlap(Math.max(0, y + height - event.endCoordinates.screenY))
      })
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => setOverlap(0))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  useEffect(() => {
    if (!revealEnd || overlap === 0) return
    const frameId = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }))
    return () => cancelAnimationFrame(frameId)
  }, [overlap, revealEnd])

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS === 'ios'}>
      <View ref={frame} collapsable={false} style={[styles.flex, { paddingBottom: overlap }]}>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={[styles.grow, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
})
