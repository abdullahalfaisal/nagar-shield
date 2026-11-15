import { StyleSheet, Text, Pressable, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'
import { Icon } from './Icon'

/**
 * The area filter chip row. The active chip uses `--grad-primary` with white
 * text; inactive chips are `--surface-white` with an `--ink-200` border.
 *
 * ## The row scrolls
 *
 * The prototype declares `overflow-x: auto` on the row, and the story carries
 * it: *"the row scrolls **horizontally** — no chip is clipped, wrapped, or
 * squeezed, and each chip keeps its `flex-shrink: 0` width."* A plain `View`
 * cannot scroll, so on a narrow phone with a dozen areas the last filters were
 * simply unreachable — not clipped off the edge, but **unreachable**, with no
 * gesture to bring them into view.
 *
 * So the row is a horizontal `ScrollView`:
 *
 *   * `horizontal` — the row scrolls sideways, not vertically;
 *   * `showsHorizontalScrollIndicator={false}` — the prototype's row has no
 *     scrollbar, and a visible one on Android would sit under the chips;
 *   * `contentContainerStyle` carries the prototype's `padding: 0 20px 12px`
 *     contract, so the first chip aligns with the feed's own 20 dp gutter and
 *     the row's bottom padding is the prototype's 12 dp;
 *   * `flexGrow: 0` on the content container — a `ScrollView`'s content
 *     stretches to fill the viewport by default, which would make the row
 *     swallow the vertical space of the feed beneath it.
 *
 * The chips themselves keep `flexShrink: 0`, so a chip never squeezes to fit
 * — it either fits or the row scrolls.
 */
export interface AreaChip {
  id: string
  label: string
  /** The filter payload — `null` means "no filter". */
  value: { division?: string; city?: string; thana?: string; neighborhood?: string } | null
  /**
   * Whether the chip can be selected at all.
   *
   * A chip that cannot be applied — **My division** / **My city** with no
   * location fix — is **disabled**, and the story is explicit that the feed
   * must keep its previous result set rather than narrow to an empty area.
   * A disabled chip is still rendered, so the row's shape does not change
   * when the fix arrives or fails.
   */
  disabled?: boolean
}

interface AreaChipRowProps {
  chips: AreaChip[]
  activeId: string
  onSelect: (chip: AreaChip) => void
}

export function AreaChipRow({ chips, activeId, onSelect }: AreaChipRowProps) {
  const theme = useTheme()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="list"
    >
      {chips.map((chip) => {
        const active = chip.id === activeId
        const disabled = chip.disabled === true

        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={chip.label}
            disabled={disabled}
            onPress={() => onSelect(chip)}
            // The chip's visual box is 36 dp tall; the tap target is padded
            // to 56 dp without changing the visual (FR-UX-4).
            hitSlop={10}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: theme.colors.surface.white,
                borderColor: active ? theme.palette.violet[600] : theme.colors.ink[200],
                opacity: disabled ? 0.45 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            {/* The selected chip wears `var(--grad-primary)` — the prototype's
                gradient — and the gradient is a **token**, so the chip keeps
                its AA contrast in light and dark mode. It is painted as the
                chip's *background* (absolute fill), so it covers the whole
                pill and the label sits centred on top of it; as a flex child
                it used to be inset by the chip's own padding. The unselected
                chip stays a flat `--surface-white` with an `--ink-200`
                border. */}
            {active ? (
              <LinearGradient
                colors={[...theme.gradients.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {active ? <Icon name="check" size={14} color={theme.staticColors.white} /> : null}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? theme.staticColors.white : theme.colors.ink[700] },
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    // The content must not stretch to the viewport width — a `ScrollView`'s
    // content container does by default, and a stretched row would fill the
    // screen even when the chips are few.
    flexGrow: 0,
  },
  chip: {
    // The chip is a fixed-size pill, 36 dp tall. The height is stated rather
    // than inferred, so the tap-target gate can read it without having to
    // follow the label out of the element and into a variable. The content is
    // a centred row, so the label sits in the vertical middle (a bare child of
    // a `Pressable` hugs the top edge).
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
})
