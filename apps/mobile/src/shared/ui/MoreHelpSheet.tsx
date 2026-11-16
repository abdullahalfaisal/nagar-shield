import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { MORE_HELP_ROWS } from '@nagar-shield/shared'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { mixHex } from '../theme/colorMix'
import { withAlpha } from './AlertCard'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'
import { ManualDialGuidance } from './ManualDialGuidance'
import { SolidIcon, type SolidIconName } from './SolidIcon'
import { useDegradedHelp } from '../services/useDegradedHelp'
import { useAccent, type Accent } from './useAccent'

/**
 * The More Help sheet.
 *
 * `003-help-seek / 005-more-help-and-hotlines` — the prototype's
 * `#more-help-dialog`, in the same look as the Home quick actions: a soft
 * tinted well for each icon, soft cards, no gradients.
 *
 * It has two groups, and every destination of the prototype's six rows is kept:
 *
 *   * **Find help nearby** — two cards side by side:
 *       নিকটবর্তী থানা          → the thana line surface
 *       ম্যাপে স্টেশন খুঁজুন      → the find-a-station map
 *   * **Hotlines** — the prototype's four hotline rows, in the prototype's
 *     order. The row dials; the trailing chevron opens the hotline list.
 *
 * The hotline rows are read from the **bundled** curated dataset
 * (`MORE_HELP_ROWS` in `@nagar-shield/shared`), so the sheet renders with no
 * network at all — the dial path makes zero requests (ADR-003).
 *
 * The four hotline numbers are **not** hardcoded here: they are looked up from
 * the bundle, so the sheet can never disagree with the curated dataset.
 */

/** The prototype's four hotline rows, in the prototype's order. */
const PROTOTYPE_HOTLINE_IDS = MORE_HELP_ROWS.map((row) => row.id)

interface MoreHelpSheetProps {
  visible: boolean
  onClose: () => void
  /** Called instead of the default navigation when a row is tapped. */
  onOpenHotlineList?: () => void
}

export function MoreHelpSheet({ visible, onClose, onOpenHotlineList }: MoreHelpSheetProps) {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  // The same degraded-mode flow the help cards use. The hotline rows dial
  // through the same door, so they get the same guidance.
  const degradedHelp = useDegradedHelp()

  const dial = async (phone: string) => {
    // The dial path is client-only: the OS dialler is pre-filled and the app
    // never places a call (C-1).
    await degradedHelp.dial(phone)
  }

  const openHotlineList = () => {
    onClose()
    if (onOpenHotlineList) {
      onOpenHotlineList()
      return
    }
    router.push('/(app)/more-help')
  }

  const openThanaLine = () => {
    onClose()
    router.push('/(app)/thana-line')
  }

  const openStationMap = () => {
    onClose()
    router.push('/(app)/station-map')
  }

  const heading = {
    color: theme.colors.ink[500],
    fontFamily: appFont('bold', lang),
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('help.moreHelpTitle')}>
      {/* The manual-dial guidance — the same component the help cards
          render. One surface, one behaviour. It is pinned above the list, so
          a failed dial is never answered off screen. */}
      {degradedHelp.showGuidance && degradedHelp.guidanceNumber ? (
        <ManualDialGuidance
          number={degradedHelp.guidanceNumber}
          showPowerSaveWarning={degradedHelp.showPowerSaveWarning}
          showOfflineNotice={degradedHelp.showOfflineNotice}
        />
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, heading]}>{t('help.moreHelpNearby')}</Text>
        <View style={styles.nearbyRow}>
          <NearbyCard
            icon="shield"
            color="violet"
            title={t('help.nearestStation')}
            subtitle={t('help.nearestStationSub')}
            onPress={openThanaLine}
          />
          <NearbyCard
            icon="map"
            color="pink"
            title={t('help.stationMap')}
            subtitle={t('help.stationMapSub')}
            onPress={openStationMap}
          />
        </View>
        <Text style={[styles.note, { color: theme.colors.ink[400] }]}>
          {t('help.stationFallbackNote')}
        </Text>

        <Text style={[styles.heading, styles.headingSpaced, heading]}>
          {t('help.moreHelpHotlines')}
        </Text>
        <View style={styles.hotlines}>
          {/* The row itself dials the number; the trailing chevron opens the
              hotline list, which carries the full curated set. */}
          {PROTOTYPE_HOTLINE_IDS.map((id) => {
            const row = MORE_HELP_ROWS.find((entry) => entry.id === id)
            if (!row) return null

            const look = HOTLINE_LOOKS[id] ?? FALLBACK_LOOK
            const title = t(HOTLINE_LABEL_KEYS[id] ?? 'help.moreHelpTitle')

            return (
              <HotlineRow
                key={id}
                icon={look.icon}
                color={look.color}
                title={title}
                number={row.phone}
                accessibilityLabel={t('help.hotlineCallLabel', { name: title, number: row.phone })}
                openListLabel={t('help.moreHelpOpenList')}
                onPress={() => dial(row.phone)}
                onOpenList={openHotlineList}
              />
            )
          })}
        </View>
      </ScrollView>

      {/* A button, not a text link: a wrong number is worth a clear target. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('help.wrongNumber')}
        onPress={() => {
          onClose()
          router.push('/(app)/more-help')
        }}
        style={({ pressed }) => [
          styles.wrongNumber,
          {
            backgroundColor: withAlpha(theme.palette.amber[500], theme.colors.isDark ? 0.2 : 0.14),
            borderColor: withAlpha(theme.palette.amber[500], 0.5),
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon name="report" size={18} color={theme.palette.amber[600]} />
        <Text
          numberOfLines={2}
          style={[
            styles.wrongNumberText,
            {
              // Amber 600 is too light for text on its own tint, so it is
              // darkened toward the ink in the light theme.
              color: theme.colors.isDark
                ? theme.palette.amber[500]
                : mixHex(theme.palette.amber[600], theme.colors.ink[950], 0.4),
              fontFamily: appFont('bold', lang),
            },
          ]}
        >
          {t('help.wrongNumber')}
        </Text>
      </Pressable>
    </BottomSheet>
  )
}

/**
 * The prototype's four hotline labels.
 *
 * The label is the **user-facing** name; the curated dataset carries both the
 * Bangla and the English name, but the sheet renders the prototype's exact
 * wording, so the labels are keyed by the curated id rather than re-read from
 * the dataset. The id keeps the two joined — a label can never be attached to
 * the wrong number.
 */
const HOTLINE_LABEL_KEYS: Record<string, string> = {
  'hl-women-children': 'help.womenChildren',
  'hl-disaster': 'help.disaster',
  'hl-ambulance': 'help.ambulance',
  'hl-electricity': 'help.electricity',
}

/** The icon and accent of each hotline row. Red stays with emergency help. */
const HOTLINE_LOOKS: Record<string, { icon: SolidIconName; color: Accent }> = {
  'hl-women-children': { icon: 'people', color: 'violet' },
  'hl-disaster': { icon: 'warning', color: 'amber' },
  'hl-ambulance': { icon: 'medical', color: 'green' },
  'hl-electricity': { icon: 'call', color: 'sky' },
}

const FALLBACK_LOOK = { icon: 'call', color: 'violet' } as const

/** One of the two "find help nearby" cards. */
function NearbyCard({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: SolidIconName
  color: Accent
  title: string
  subtitle: string
  onPress: () => void
}) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const { glyph, card, cardBorder, cardWell } = useAccent(color)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.replace('\n', ' ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.nearbyCard,
        { backgroundColor: card, borderColor: cardBorder, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.nearbyTop}>
        <View style={[styles.well, { backgroundColor: cardWell }]}>
          <SolidIcon name={icon} size={24} color={glyph} />
        </View>
        <SolidIcon name="chevronRight" size={18} color={glyph} />
      </View>
      <Text
        style={[
          styles.nearbyTitle,
          { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
        ]}
      >
        {title}
      </Text>
      <Text style={[styles.nearbySub, { color: theme.colors.ink[500] }]}>{subtitle}</Text>
    </Pressable>
  )
}

/**
 * One hotline row. The body dials; the trailing chevron is a second button that
 * opens the hotline list. Two targets, two accessibility labels: the call
 * affordance prefills the dialler **and** the row's category has its own
 * surface.
 */
function HotlineRow({
  icon,
  color,
  title,
  number,
  accessibilityLabel,
  openListLabel,
  onPress,
  onOpenList,
}: {
  icon: SolidIconName
  color: Accent
  title: string
  number: string
  accessibilityLabel: string
  openListLabel: string
  onPress: () => void
  onOpenList: () => void
}) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const { well, glyph } = useAccent(color)

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface.lavender }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.rowHit, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.wellSmall, { backgroundColor: well }]}>
          <SolidIcon name={icon} size={22} color={glyph} />
        </View>
        <View style={styles.rowText}>
          <Text
            numberOfLines={2}
            style={[
              styles.rowTitle,
              { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
            ]}
          >
            {title}
          </Text>
          <Text style={[styles.rowNumber, { color: theme.colors.ink[500] }]}>{number}</Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openListLabel}
        onPress={onOpenList}
        style={styles.rowChevron}
      >
        <SolidIcon name="chevronRight" size={20} color={theme.colors.ink[400]} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingBottom: 4,
  },
  heading: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  headingSpaced: {
    marginTop: 20,
  },
  nearbyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nearbyCard: {
    flex: 1,
    minHeight: 48,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  nearbyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  well: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  nearbySub: {
    fontSize: 11,
    lineHeight: 15,
  },
  note: {
    fontSize: 10,
    fontStyle: 'italic',
    lineHeight: 14,
    marginTop: 8,
  },
  hotlines: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    minHeight: 64,
    paddingLeft: 12,
  },
  rowHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  wellSmall: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  rowNumber: {
    fontSize: 12,
    marginTop: 1,
  },
  rowChevron: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrongNumber: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  wrongNumberText: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: 'center',
  },
})
