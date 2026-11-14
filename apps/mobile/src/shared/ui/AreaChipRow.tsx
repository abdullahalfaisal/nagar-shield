import { StyleSheet, Text, Pressable, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'

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

        const label = (
          <Text
            style={{
              color: active ? theme.staticColors.white : theme.colors.ink[700],
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            {chip.label}
          </Text>
        )

        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={chip.label}
            disabled={disabled}
            onPress={() => onSelect(chip)}
            // The chip's visual box is 28 dp tall, but the tap target is
            // padded to 48 dp without changing the visual (FR-UX-4).
            hitSlop={10}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.palette.violet[600] : theme.colors.surface.white,
                borderColor: active ? theme.palette.violet[600] : theme.colors.ink[200],
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          >
            {/* The selected chip wears `var(--grad-primary)` — the prototype's
                gradient — and the gradient is a **token**, so the chip keeps
                its AA contrast in light and dark mode. The unselected chip
                stays a flat `--surface-white` with an `--ink-200` border. */}
            {active ? (
              <LinearGradient
                colors={[...theme.gradients.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fill}
              >
                {label}
              </LinearGradient>
            ) : (
              label
            )}
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
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    // The content must not stretch to the viewport width — a `ScrollView`'s
    // content container does by default, and a stretched row would fill the
    // screen even when the chips are few.
    flexGrow: 0,
  },
  chip: {
    // The chip is a fixed-size pill: 12 dp type on 8 dp of vertical padding
    // makes it 28 dp tall. The height is stated rather than inferred, so the
    // tap-target gate can read it without having to follow the label out of
    // the element and into a variable.
    height: 28,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
