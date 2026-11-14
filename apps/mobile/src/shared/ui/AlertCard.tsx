import { StyleSheet, Text, View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
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
 *
 * **An uncategorized report is a named state, not an empty value.** It renders
 * the localized `অকার্যনির্দিষ্ট — Uncategorized` placeholder (never a dash) and
 * wears the neutral `--ink-300` ramp — the accent border, the icon tint and
 * the category text all fall back to the neutral grey, because the accent is
 * the signal that says *what kind of report this is* and an uncategorized
 * report has no such signal to give. A category is never invented.
 */
interface AlertCardProps {
  report: PublicReport
  relativeTime: string
  onPress?: () => void
  onFlag?: () => void
}

export function AlertCard({ report, relativeTime, onPress, onFlag }: AlertCardProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const category = report.category as ReportCategory | null

  const accent = alertAccent(category, theme.colors.ink[300])
  const icon = category ? REPORT_CATEGORY_ICONS[category] : 'help'

  const areaLine = formatArea(report)
  const categoryLabel = alertCategoryLabel(category, t('alerts.uncategorized'))

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
        <Text
          style={[
            styles.category,
            { color: category ? theme.colors.ink[950] : theme.colors.ink[300] },
          ]}
          numberOfLines={1}
        >
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
            {t('alerts.detailLink')}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('alerts.reportThis')}
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
 *
 * The level named is the most specific one the report actually carries:
 * neighbourhood, then thana, then city, then division.
 *
 * **A level that is absent is skipped, not rendered empty.** The client
 * boundary normalises a null level to the **empty string** (`raw.thana ?? ''`),
 * because the `AreaHierarchy` type requires a string — and an empty string is
 * not nullish, so a plain `??` chain would stop there and render a card with
 * a blank area line. A degraded capture carries a null thana, so this is a
 * real path, not a hypothetical one.
 *
 * The Bangla half of the pair comes from the **server-side** `area_lookup`,
 * which the public projection does not carry, so the client renders the one
 * name it has — once — rather than repeating it.
 */
export function formatArea(report: PublicReport): string {
  return formatAreaHierarchy(report.areaHierarchy)
}

/**
 * The area line for an **area shape** — the rule, without the report around
 * it.
 *
 * Every surface that names a place uses this one function: the feed card, the
 * public alert detail, the author's own report detail and the history list.
 * Four copies of the same chain would drift, and they already had.
 */
export function formatAreaHierarchy(
  area: {
    neighborhood?: string | null
    thana?: string | null
    city?: string | null
    division?: string | null
  } | null,
): string {
  if (!area) return '—'

  const level = (value: string | undefined | null): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed.length > 0 ? trimmed : undefined
  }

  const named =
    level(area.neighborhood) ?? level(area.thana) ?? level(area.city) ?? level(area.division)

  return named ?? '—'
}

/**
 * The card's accent colour for a category.
 *
 * A categorised report wears its accent from the **one shared map** — a card
 * that hardcoded a hex would drift from the map the moment a category's
 * colour changed. An uncategorized report wears the **neutral** ramp
 * (`--ink-300`): the accent is the signal that says *what kind of report this
 * is*, and a report with no category has no such signal to give.
 *
 * The neutral is a **parameter** rather than a lookup of the theme inside
 * this function, so the rule is a pure function of its inputs and the test
 * can state the ramp it expects.
 */
export function alertAccent(category: ReportCategory | null, neutral: string): string {
  if (!category) return neutral
  return REPORT_CATEGORY_ACCENTS[category]
}

/**
 * The card's category line.
 *
 * A categorised report renders the Bangla / English pair — **চুরি — Theft** —
 * from the shared labels. An uncategorized report renders the **localized
 * placeholder** (`অকার্যনির্দিষ্ট — Uncategorized`), never a dash: a dash is an
 * empty value, and an uncategorized report is a named state the citizen can
 * read. A category is never invented.
 */
export function alertCategoryLabel(category: ReportCategory | null, uncategorized: string): string {
  if (!category) return uncategorized
  const label = REPORT_CATEGORY_LABELS[category]
  return `${label.bn} — ${label.en}`
}

/** Converts a hex colour to an `rgba()` string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The card's box model, as the prototype's markup declares it.
 *
 * Exported so the port contract is **assertable**: the numbers the prototype
 * specifies (`margin: 0 20px 10px`, `padding: 14px 16px`, radius 14, gap 12,
 * a 4 dp left border, a 40 dp icon tile, a 48 dp flag button) are read from
 * one place instead of being re-typed into a test that would then drift.
 */
export const styles = StyleSheet.create({
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
