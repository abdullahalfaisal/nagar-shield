import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { mixHex } from '../theme/colorMix'
import { withAlpha } from './AlertCard'
import { SolidIcon } from './SolidIcon'
import { surfaceShadow } from './surface'

interface FormCardProps {
  title: string
  /** The one tag on the right: "Required", "Optional", or the current choice. */
  tag?: string
  /** Its colour: violet for a must, green for a good state, amber for a gap. */
  tone?: 'required' | 'neutral' | 'ok' | 'warn'
  /** A short explanation behind the small "i" next to the title. */
  info?: { title: string; body: string; label: string }
  language: string
  children: ReactNode
}

/**
 * One card of the Report Crime form.
 *
 * Every card has the same header: the title, a small "i" and one tag on the
 * right. What used to be a sentence of help text under the field sits behind
 * the "i" instead, so the page stays short and a user who does not need it never
 * reads it. The "i" is a 48 dp target around a 20 dp glyph.
 */
export function FormCard({
  title,
  tag,
  tone = 'neutral',
  info,
  language,
  children,
}: FormCardProps) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  // Where the "i" sits in the header, so the callout's arrow points at it.
  const [infoX, setInfoX] = useState(0)

  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const dark = theme.colors.isDark
  const tagColor =
    tone === 'required'
      ? violet
      : tone === 'ok'
        ? theme.palette.green[dark ? 500 : 700]
        : tone === 'warn'
          ? amberText(theme)
          : theme.colors.textMuted
  // Solid: the popover floats over other cards, and the arrow is a second shape
  // that has to be exactly the same colour to read as part of it.
  const popoverBg = theme.colors.surface.card

  const onInfoLayout = (event: LayoutChangeEvent) => setInfoX(event.nativeEvent.layout.x)

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface.white },
        // Above the cards after it, so the floating popover is never covered.
        open && styles.cardOpen,
      ]}
    >
      <View style={styles.header}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
          ]}
        >
          {title}
        </Text>
        {info ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${info.label}: ${info.title}`}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((current) => !current)}
            onLayout={onInfoLayout}
            style={styles.infoButton}
          >
            <SolidIcon name="info" size={20} color={open ? violet : theme.colors.textMuted} />
          </Pressable>
        ) : null}
        <View style={styles.spacer} />
        {tag ? (
          <Text
            numberOfLines={1}
            style={[
              styles.tagText,
              {
                color: tagColor,
                fontFamily: appFont('semibold', language),
              },
            ]}
          >
            {tag}
          </Text>
        ) : null}
      </View>

      {children}

      {/* Drawn after the card's own content, so it sits above the field under it.
          Floats over the cards below it: it takes no room in the layout, so
          opening it never moves anything. A tap on it closes it. */}
      {info && open ? (
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${info.title}. ${info.body}`}
          onPress={() => setOpen(false)}
          style={[
            styles.popover,
            { backgroundColor: popoverBg, borderColor: withAlpha(violet, 0.35) },
          ]}
        >
          <View
            style={[
              styles.arrow,
              {
                left: infoX + 26,
                backgroundColor: popoverBg,
                borderColor: withAlpha(violet, 0.35),
              },
            ]}
          />
          <Text
            style={[
              styles.popoverTitle,
              { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
            ]}
          >
            {info.title}
          </Text>
          <Text
            style={[
              styles.popoverBody,
              { color: theme.colors.ink[700], fontFamily: appFont('regular', language) },
            ]}
          >
            {info.body}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    ...surfaceShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    marginBottom: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  // A 48 dp target pulled in around the glyph, so it does not make the header
  // taller than the title and the tag beside it.
  infoButton: {
    width: 48,
    height: 48,
    marginVertical: -10,
    marginLeft: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    flex: 1,
  },
  // Plain text on the right: no pill, no border.
  tagText: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  cardOpen: {
    zIndex: 20,
    elevation: 12,
  },
  // Pinned under the header, inside the card's edges. Smaller type than the
  // page: it is a note, not content.
  popover: {
    position: 'absolute',
    zIndex: 30,
    top: 52,
    minHeight: 48,
    left: 8,
    right: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  // A rotated square on the popover's top edge, pointing up at the "i".
  arrow: {
    position: 'absolute',
    top: -7,
    width: 12,
    height: 12,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
  popoverTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  popoverBody: {
    fontSize: 12,
    lineHeight: 17,
  },
})

/** Amber that reads on a white card: the light-theme amber is too pale for small text. */
function amberText(theme: ReturnType<typeof useTheme>): string {
  return theme.colors.isDark
    ? theme.palette.amber[500]
    : mixHex(theme.palette.amber[600], theme.staticColors.black, 0.28)
}
