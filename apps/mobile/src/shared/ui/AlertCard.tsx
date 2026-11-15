import { useState } from 'react'
import { Image, StyleSheet, Text, View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_LABELS,
  type PublicReport,
  type ReportCategory,
} from '@nagar-shield/shared'
import { signedUrlsAreStale, useAlertThumbnail, type AlertThumbnail } from '../api/alertDetail'
import { useAreaName } from '../api/areas'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { mixHex } from '../theme/colorMix'
import { LineIcon, type LineIconName } from './LineIcon'
import { SolidIcon, type SolidIconName } from './SolidIcon'
import { MediaViewer, isViewable } from './MediaViewer'
import { VideoFrame } from './VideoFrame'
import { surfaceShadow } from './surface'
import { usePressGuard } from './usePressGuard'

/**
 * The Alerts feed card.
 *
 * Laid out the way current feed cards are, top to bottom:
 *   - a header: the category's duotone icon on a soft tint of its accent, the
 *     category name, and the place under it
 *   - the description, full width, two lines at most
 *   - a footer under a hairline: how long ago on the left, "View details" on
 *     the right
 *   - the flag button in the top-right corner, a 48 dp target
 *
 * The whole card opens the report; the flag is its own target.
 *
 * **An uncategorized report is a named state, not an empty value.** It renders
 * the localized `অকার্যনির্দিষ্ট — Uncategorized` placeholder (never a dash) and
 * wears the neutral `--ink-300` ramp — the icon tint and the category text fall
 * back to the neutral grey, because the accent is the signal that says *what
 * kind of report this is* and an uncategorized report has no such signal to
 * give. A category is never invented.
 */
interface AlertCardProps {
  report: PublicReport
  relativeTime: string
  onPress?: () => void
  onFlag?: () => void
}

/**
 * The solid glyph for each category. Each one shows the event itself — a masked
 * person for theft, a knife for robbery, a car collision for an accident — so a
 * card can be read before its words are.
 */
export const CATEGORY_SOLID_ICONS: Record<ReportCategory, SolidIconName> = {
  theft: 'theft',
  assault: 'assault',
  harassment: 'harassment',
  robbery: 'robbery',
  accident: 'accident',
  fire: 'fire',
  medical: 'medical',
  fraud: 'fraud',
  vandalism: 'vandalism',
  suspicious: 'suspicious',
  other: 'other',
}

/**
 * How many lines of the description a card shows. A longer report reads to
 * its end in the detail view, which the card opens; the feed stays a list of
 * short cards rather than a wall of text.
 */
export const DESCRIPTION_LINES = 3

/** The line icon for each category, in the same family as the Home shortcuts. */
export const CATEGORY_LINE_ICONS: Record<ReportCategory, LineIconName> = {
  theft: 'backpack',
  assault: 'alert',
  harassment: 'shieldAlert',
  robbery: 'banknote',
  accident: 'car',
  fire: 'flame',
  medical: 'heartPulse',
  fraud: 'creditCard',
  vandalism: 'hammer',
  suspicious: 'eye',
  other: 'help',
}

export function AlertCard({ report, relativeTime, onPress, onFlag }: AlertCardProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const category = report.category as ReportCategory | null
  const pressCard = usePressGuard(onPress)
  const pressFlag = usePressGuard(onFlag)
  const thumbnail = useAlertThumbnail(report.id, report.hasMedia)
  const [viewerAt, setViewerAt] = useState<number | null>(null)

  const accent = alertAccent(category, theme.colors.ink[300])
  const icon: SolidIconName = category ? CATEGORY_SOLID_ICONS[category] : 'help'
  // The accents are picked to read on a light card. On the dark theme the glyph
  // is lightened and the tint made stronger, so the tile reads the same way.
  const dark = theme.colors.isDark
  const glyph = category
    ? dark
      ? mixHex(accent, theme.staticColors.white, 0.3)
      : accent
    : theme.colors.textMuted
  const meta = theme.colors.ink[700]
  const link = theme.palette.violet[dark ? 300 : 700]

  const areaName = useAreaName()
  const areaLine = formatAreaHierarchy(report.areaHierarchy, areaName)
  const categoryLabel = alertCategoryLabel(category, t('alerts.uncategorized'), lang)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
          ...surfaceShadow,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${categoryLabel}, ${areaLine}, ${relativeTime}`}
        onPress={pressCard}
        style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
      >
        <View style={styles.header}>
          <View
            style={[styles.iconTile, { backgroundColor: withAlpha(accent, dark ? 0.26 : 0.13) }]}
          >
            <SolidIcon name={icon} size={26} color={glyph} />
          </View>
          <View style={styles.titles}>
            <Text
              style={[
                styles.category,
                {
                  color: category ? theme.colors.ink[950] : theme.colors.textMuted,
                  fontFamily: appFont('bold', lang),
                },
              ]}
              numberOfLines={1}
            >
              {categoryLabel}
            </Text>
            <View style={styles.areaRow}>
              <SolidIcon name="pin" size={14} color={meta} />
              <Text
                style={[
                  styles.area,
                  { color: theme.colors.textMuted, fontFamily: appFont('medium', lang) },
                ]}
                numberOfLines={1}
              >
                {areaLine}
              </Text>
            </View>
          </View>
        </View>

        {report.description ? (
          <Text
            style={[
              styles.description,
              { color: theme.colors.ink[600], fontFamily: appFont('regular', lang) },
            ]}
            numberOfLines={DESCRIPTION_LINES}
          >
            {report.description}
          </Text>
        ) : null}

        <CardMedia
          hasMedia={report.hasMedia}
          data={thumbnail.data}
          isLoading={thumbnail.isLoading}
          onOpen={() => {
            // The links last ten minutes and a card can sit in the feed longer
            // than that, so re-sign when the viewer opens rather than show a
            // blank screen.
            if (signedUrlsAreStale(thumbnail.dataUpdatedAt)) void thumbnail.refetch()
            setViewerAt(0)
          }}
        />

        <View style={[styles.footer, { borderTopColor: theme.colors.ink[100] }]}>
          <View style={styles.timeRow}>
            <SolidIcon name="clock" size={14} color={meta} />
            <Text
              style={[
                styles.time,
                { color: theme.colors.textMuted, fontFamily: appFont('medium', lang) },
              ]}
              numberOfLines={1}
            >
              {relativeTime}
            </Text>
          </View>
          {onPress ? (
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLink, { color: link, fontFamily: appFont('semibold', lang) }]}
                numberOfLines={1}
              >
                {t('alerts.detailLink')}
              </Text>
              <SolidIcon name="chevronRight" size={16} color={link} />
            </View>
          ) : null}
        </View>
      </Pressable>

      {/* A flag with no action behind it is a button that does nothing, so a
          card shown where flagging is not wired (Home) does not draw it. */}
      {onFlag ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('alerts.reportThis')}
          onPress={pressFlag}
          style={styles.flagButton}
        >
          <SolidIcon name="flag" size={20} color={theme.colors.ink[600]} />
        </Pressable>
      ) : null}

      {/* Outside the card's buttons, so a tap inside the viewer never reaches
          them. */}
      <MediaViewer
        items={(thumbnail.data?.items ?? []).filter(isViewable)}
        startIndex={viewerAt}
        onClose={() => setViewerAt(null)}
      />
    </View>
  )
}

/**
 * The report's first photo, or a tile that says a video or a document is
 * attached. Nothing is drawn for a report without media, and nothing is left
 * behind when the media cannot be read (a removed report, no connection).
 *
 * A photo or a video is its own target: it opens the report's media full
 * screen, and the rest of the card still opens the report.
 */
function CardMedia({
  hasMedia,
  data,
  isLoading,
  onOpen,
}: {
  hasMedia: boolean
  data: AlertThumbnail | null | undefined
  isLoading: boolean
  onOpen: () => void
}) {
  const theme = useTheme()
  const { t } = useTranslation()

  // The report's first video, when it opens with one: its still is drawn behind
  // the play button.
  const firstVideo = data?.kind === 'video' ? data.items[0] : undefined

  if (!hasMedia) return null

  if (isLoading) {
    return <View style={[styles.media, { backgroundColor: theme.colors.ink[100] }]} />
  }

  if (!data) return null

  const more =
    data.count > 1 ? (
      <View style={[styles.countBadge, { backgroundColor: theme.staticColors.scrim }]}>
        <Text
          style={[styles.countText, { color: theme.staticColors.white }]}
        >{`+${data.count - 1}`}</Text>
      </View>
    ) : null

  if (data.kind === 'photo') {
    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t('alerts.mediaLabel')}
        accessibilityHint={t('alerts.mediaOpenHint')}
        onPress={onOpen}
        style={({ pressed }) => [styles.mediaFrame, pressed && styles.bodyPressed]}
      >
        <Image
          source={{ uri: data.url }}
          style={[styles.media, { backgroundColor: theme.colors.ink[100] }]}
          resizeMode="cover"
        />
        {more}
      </Pressable>
    )
  }

  const violet = theme.palette.violet[600]

  if (data.kind === 'video') {
    const playable = data.items.some(isViewable)
    return (
      <Pressable
        accessibilityRole={playable ? 'imagebutton' : 'image'}
        accessibilityLabel={t('alerts.mediaVideoLabel')}
        accessibilityHint={playable ? t('alerts.mediaOpenHint') : undefined}
        disabled={!playable}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.media,
          styles.mediaCentered,
          { backgroundColor: withAlpha(violet, 0.1) },
          pressed && styles.bodyPressed,
        ]}
      >
        <VideoFrame itemId={firstVideo?.id} url={firstVideo?.url} style={StyleSheet.absoluteFill} />
        <View style={[styles.playCircle, { backgroundColor: theme.colors.surface.white }]}>
          <LineIcon name="play" size={20} color={violet} duotone={withAlpha(violet, 0.25)} />
        </View>
        {more}
      </Pressable>
    )
  }

  return (
    <View style={[styles.fileRow, { backgroundColor: withAlpha(violet, 0.08) }]}>
      <LineIcon name="fileText" size={18} color={violet} duotone={withAlpha(violet, 0.2)} />
      <Text style={[styles.fileText, { color: theme.colors.ink[700] }]} numberOfLines={1}>
        {t('capture.attachedFile')}
      </Text>
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
    place?: string | null
  } | null,
  /** Puts the stored (English) area name into the app's language. */
  translate: (name: string) => string = (name) => name,
): string {
  if (!area) return '—'

  const level = (value: string | undefined | null): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed.length > 0 ? trimmed : undefined
  }

  const stored =
    level(area.neighborhood) ?? level(area.thana) ?? level(area.city) ?? level(area.division)
  const named = stored ? translate(stored) : undefined

  // A place the citizen typed ("Road 10, near the bus stand") leads, so the
  // card says where exactly, then which area.
  const place = level(area.place)
  if (place && named) return `${place}, ${named}`

  return place ?? named ?? '—'
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
 * A category's name, in the app's language only.
 *
 * It used to be the Bangla / English pair — **চুরি — Theft** — on every
 * screen, so an English reader saw Bangla and a Bangla reader saw English. An
 * uncategorized report renders the **localized placeholder**, never a dash: a
 * dash is an empty value, and an uncategorized report is a named state the
 * citizen can read. A category is never invented.
 *
 * Every screen that names a category goes through this one function.
 */
export function alertCategoryLabel(
  category: ReportCategory | null,
  uncategorized: string,
  language: string,
): string {
  if (!category) return uncategorized
  return REPORT_CATEGORY_LABELS[category][language === 'bn' ? 'bn' : 'en']
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
 * The card's box model. Exported so the layout is assertable from one place
 * instead of being re-typed into a test that would then drift.
 */
export const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  body: {
    // The whole card is the target; this is the floor the tap-target gate reads.
    minHeight: 48,
    paddingTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 16,
  },
  bodyPressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Room for the flag in the top-right corner.
    paddingRight: 32,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  category: {
    fontSize: 16,
    lineHeight: 22,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  area: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  mediaFrame: {
    // The photo inside is taller and carries the top margin; this is the
    // floor the tap-target gate reads.
    minHeight: 48,
  },
  media: {
    marginTop: 12,
    height: 112,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mediaCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  fileText: {
    flexShrink: 1,
    fontSize: 12.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  time: {
    flexShrink: 1,
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  detailLink: {
    fontSize: 14,
  },
  flagButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
