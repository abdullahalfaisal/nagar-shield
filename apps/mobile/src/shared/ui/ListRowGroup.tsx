import { Children, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface ListRowGroupProps {
  header?: string
  children: ReactNode
}

/**
 * `.list-section` — a white card with a hairline border, an uppercase header
 * and the rows clipped to its rounded corners.
 *
 * The More Options screen and the History distribution list share this shape.
 */
export function ListRowGroup({ header, children }: ListRowGroupProps) {
  const theme = useTheme()
  const rows = Children.toArray(children)

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
          shadowColor: '#0F172A',
          shadowOpacity: 0.04,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
      ]}
    >
      {header ? (
        <Text style={[styles.sectionHeader, { color: theme.colors.ink[500] }]}>{header}</Text>
      ) : null}
      {rows.map((row, index) => (
        <View
          key={index}
          style={
            index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.ink[100] } : undefined
          }
        >
          {row}
        </View>
      ))}
    </View>
  )
}

/** A simple text row used by the distribution counts list. */
export function CountRow({ label, count }: { label: string; count: number }) {
  const theme = useTheme()

  return (
    <View style={styles.countRow}>
      <Text style={[styles.countLabel, { color: theme.colors.ink[950] }]}>{label}</Text>
      <View style={[styles.countPill, { backgroundColor: theme.palette.violet[100] }]}>
        <Text
          style={{
            color: theme.palette.violet[700],
            fontSize: 13,
            fontWeight: '700',
          }}
        >
          {count}
        </Text>
      </View>
    </View>
  )
}

/** The "map view" link under the History segmented tabs. */
export function MapViewLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.mapLink}
    >
      <Icon name="map" size={18} color={theme.palette.violet[700]} />
      <Text style={[styles.mapLinkText, { color: theme.palette.violet[700] }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
  countLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  countPill: {
    minWidth: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  mapLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
