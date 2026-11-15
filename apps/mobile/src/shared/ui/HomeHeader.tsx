import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { BrandMark } from './BrandMark'
import { SolidIcon } from './SolidIcon'
import { surfaceShadow } from './surface'
import { usePressGuard } from './usePressGuard'

interface HomeHeaderProps {
  /** Today's date, already written for the language, e.g. "Sunday, 15 November". */
  date: string
  /** The place line, or the sentence that explains why there is none. */
  area: string
  /** `ready` is a place name; `muted` is a state the user can read. */
  areaTone: 'ready' | 'muted'
  /** Present when the line is something the user can act on (turn location on, retry). */
  onAreaPress?: () => void
  settingsLabel: string
  onSettings: () => void
  /** Reloads the area and the alerts. */
  onRefresh: () => void
  refreshing: boolean
  refreshLabel: string
  language: string
}

/**
 * The Home header: the app mark, today's date over the place the user is in,
 * and the settings button.
 *
 * The place is the headline because it is what the rest of the screen is
 * about: the alerts below are for this area. A greeting said nothing the user
 * did not already know.
 */
export function HomeHeader({
  date,
  area,
  areaTone,
  onAreaPress,
  settingsLabel,
  onSettings,
  onRefresh,
  refreshing,
  refreshLabel,
  language,
}: HomeHeaderProps) {
  const theme = useTheme()
  const pressSettings = usePressGuard(onSettings)
  const pressArea = usePressGuard(onAreaPress)
  const pressRefresh = usePressGuard(onRefresh)
  const ready = areaTone === 'ready'

  const areaContent = (
    <View style={styles.areaRow}>
      <SolidIcon
        name="pin"
        size={20}
        color={
          ready ? theme.palette.violet[theme.colors.isDark ? 400 : 700] : theme.colors.textMuted
        }
      />
      <Text
        numberOfLines={1}
        style={[
          ready ? styles.area : styles.areaMuted,
          {
            color: ready ? theme.colors.ink[950] : theme.colors.textMuted,
            fontFamily: appFont(ready ? 'bold' : 'medium', language),
          },
        ]}
      >
        {area}
      </Text>
    </View>
  )

  return (
    <View style={styles.row}>
      <BrandMark size={48} radius={14} />

      <View style={styles.text}>
        <View style={styles.dateRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.date,
              { color: theme.colors.textMuted, fontFamily: appFont('medium', language) },
            ]}
          >
            {date}
          </Text>
        </View>
        <View style={styles.areaLine}>
          {onAreaPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={area}
              onPress={pressArea}
              style={[styles.areaButton, styles.areaFlex]}
            >
              {areaContent}
            </Pressable>
          ) : (
            <View accessible accessibilityLabel={area} style={styles.areaFlex}>
              {areaContent}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={refreshLabel}
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
            disabled={refreshing}
            onPress={pressRefresh}
            hitSlop={10}
            style={styles.refresh}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : (
              <SolidIcon name="refresh" size={20} color={theme.colors.textMuted} />
            )}
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={settingsLabel}
        onPress={pressSettings}
        style={[styles.settings, { backgroundColor: theme.colors.surface.white }]}
      >
        <SolidIcon name="gear" size={24} color={theme.colors.ink[700]} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  date: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Only drawn as a button when there is something to do (turn location on,
  // retry), and then it is a full 48 dp target.
  areaButton: {
    minHeight: 48,
    justifyContent: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaFlex: {
    flexShrink: 1,
  },
  // The glyph's own 28 dp, with a clear gap before it. The 48 dp touch target
  // comes from `hitSlop`, which adds touch area without taking any room, so the
  // button never overlaps the place name and the name can use all the rest.
  refresh: {
    width: 28,
    height: 28,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
  },
  area: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  areaMuted: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  settings: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
})
