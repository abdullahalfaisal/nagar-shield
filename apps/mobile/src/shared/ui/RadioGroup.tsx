import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'

export type RadioReason = 'misinformation' | 'harassment' | 'duplicate' | 'off_topic' | 'other'

interface RadioRowProps {
  label: string
  selected: boolean
  onSelect: () => void
}

/**
 * One row of a radio group.
 *
 * The 22 dp circle is the prototype's `.radio`; the tap target is padded to
 * 48 dp so the whole row is reachable (FR-UX-4).
 */
export function RadioRow({ label, selected, onSelect }: RadioRowProps) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onSelect}
      style={styles.row}
    >
      <View
        style={[
          styles.circle,
          {
            borderColor: selected ? theme.palette.violet[600] : theme.colors.ink[300],
          },
        ]}
      >
        {selected ? (
          <View style={[styles.dot, { backgroundColor: theme.palette.violet[600] }]} />
        ) : null}
      </View>
      <Text style={[styles.label, { color: theme.colors.ink[950] }]}>{label}</Text>
    </Pressable>
  )
}

/** The vertical radio group used by the flag sheet and the history filters. */
export function RadioGroup({
  options,
  selectedId,
  onSelect,
}: {
  options: Array<{ id: string; label: string }>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <View style={styles.group}>
      {options.map((option) => (
        <RadioRow
          key={option.id}
          label={option.label}
          selected={option.id === selectedId}
          onSelect={() => onSelect(option.id)}
        />
      ))}
    </View>
  )
}

/** A compact choice chip used for the History radius / window filters. */
export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.palette.violet[600] : theme.colors.surface.white,
          borderColor: selected ? theme.palette.violet[600] : theme.colors.ink[200],
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.staticColors.white : theme.colors.ink[700],
          fontSize: 12,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** A tappable row with a trailing check mark — the "All categories" reset. */
export function CheckRow({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.checkRow}
    >
      <Text style={[styles.label, { color: theme.colors.ink[950] }]}>{label}</Text>
      {selected ? <Icon name="check" size={18} color={theme.palette.violet[600]} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 4,
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  group: {
    gap: 2,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
})
