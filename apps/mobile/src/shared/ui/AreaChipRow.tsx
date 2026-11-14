import { StyleSheet, Text, View, Pressable } from 'react-native'
import { useTheme } from '../theme'

/**
 * The area filter chip row. The active chip uses `--grad-primary` with white
 * text; inactive chips are `--surface-white` with an `--ink-200` border.
 */
export interface AreaChip {
  id: string
  label: string
  /** The filter payload — `null` means "no filter". */
  value: { division?: string; city?: string; thana?: string; neighborhood?: string } | null
}

interface AreaChipRowProps {
  chips: AreaChip[]
  activeId: string
  onSelect: (chip: AreaChip) => void
}

export function AreaChipRow({ chips, activeId, onSelect }: AreaChipRowProps) {
  const theme = useTheme()

  return (
    <View style={styles.row}>
      {chips.map((chip) => {
        const active = chip.id === activeId
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={chip.label}
            onPress={() => onSelect(chip)}
            // The chip's visual box is 28 dp tall, but the tap target is
            // padded to 48 dp without changing the visual (FR-UX-4).
            hitSlop={10}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.palette.violet[600] : theme.colors.surface.white,
                borderColor: active ? theme.palette.violet[600] : theme.colors.ink[200],
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.staticColors.white : theme.colors.ink[700],
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {chip.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
})
