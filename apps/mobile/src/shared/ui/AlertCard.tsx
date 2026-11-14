import { StyleSheet, Text, View, Pressable } from 'react-native'
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
  type PublicReport,
  type ReportCategory,
} from '@nagar-shield/shared'
import { useTheme } from '../theme'
import { Icon } from './Icon'

/**
 * The Alerts feed card.
 *
 * Ported 1:1 from the prototype's inline-styled alert cards:
 *   - 14/16 padding, 12 dp gap, radius 14
 *   - a 4 dp left border in the category accent
 *   - a 40 dp circular tinted icon tile with a 22 dp glyph
 *   - area line 11 px / `--ink-500` / 600
 *   - category 15 px / 700
 *   - description 13 px / `--ink-600` / line-height 1.4
 *   - time 11 px
 *   - a 48 dp flag button
 *
 * The prototype's `✎ বিস্তারিত দেখুন` link is rendered as the detail
 * affordance. The prototype's duplicated area-chip row is NOT ported.
 */
interface AlertCardProps {
  report: PublicReport
  relativeTime: string
  onPress?: () => void
  onFlag?: () => void
}

export function AlertCard({ report, relativeTime, onPress, onFlag }: AlertCardProps) {
  const theme = useTheme()
  const category = report.category as ReportCategory | null
  const accent = category ? REPORT_CATEGORY_ACCENTS[category] : theme.colors.ink[400]
  const icon = category ? REPORT_CATEGORY_ICONS[category] : 'help'

  const areaLine = formatArea(report)
  const categoryLabel = category
    ? `${REPORT_CATEGORY_LABELS[category].bn} — ${REPORT_CATEGORY_LABELS[category].en}`
    : '—'

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
          borderLeftColor: accent,
          shadowColor: '#0F172A',
          shadowOpacity: 0.05,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: withAlpha(accent, 0.15) }]}>
        <Text
          style={{
            fontSize: 22,
            color: accent,
            fontFamily: 'MaterialSymbolsRounded400Regular',
          }}
        >
          {icon}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={categoryLabel}
        onPress={onPress}
        style={styles.body}
      >
        <Text style={[styles.area, { color: theme.colors.ink[500] }]} numberOfLines={1}>
          {areaLine}
        </Text>
        <Text style={[styles.category, { color: theme.colors.ink[950] }]} numberOfLines={1}>
          {categoryLabel}
        </Text>
        {report.description ? (
          <Text style={[styles.description, { color: theme.colors.ink[600] }]} numberOfLines={2}>
            {report.description}
          </Text>
        ) : null}
        <Text style={[styles.time, { color: theme.colors.ink[500] }]}>{relativeTime}</Text>
        {onPress ? (
          <Text style={[styles.detailLink, { color: theme.palette.violet[700] }]}>
            ✎ বিস্তারিত দেখুন
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="রিপোর্ট করুন"
        onPress={onFlag}
        hitSlop={6}
        style={styles.flagButton}
      >
        <Icon name="flag" size={20} color={theme.colors.ink[500]} />
      </Pressable>
    </View>
  )
}

/**
 * The area line: `English · বাংলা` — e.g. `Mirpur · মিরপুর`.
 * Falls back to the neighbourhood, then to an em dash.
 */
export function formatArea(report: PublicReport): string {
  const area = report.areaHierarchy
  if (!area) return '—'

  const english = area.neighborhood ?? area.thana ?? area.city ?? area.division
  const bangla = area.neighborhood ?? area.thana ?? area.city ?? area.division

  if (english === bangla) return english
  return `${english} · ${bangla}`
}

/** Converts a hex colour to an `rgba()` string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  area: {
    fontSize: 11,
    fontWeight: '600',
  },
  category: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    marginTop: 6,
  },
  detailLink: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  flagButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
})
