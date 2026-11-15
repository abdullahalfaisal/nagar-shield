import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { MORE_HELP_ROWS } from '@nagar-shield/shared'
import { useTheme } from '../theme'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'
import { ManualDialGuidance } from './ManualDialGuidance'
import { useDegradedHelp } from '../services/useDegradedHelp'

/**
 * The More Help sheet.
 *
 * `003-help-seek / 005-more-help-and-hotlines` — the prototype's
 * `#more-help-dialog`, reproduced 1:1.
 *
 * **The prototype is the copy contract.** `docs/design/screen-help-alert.html`
 * ships six rows in an exact visual order, and the build keeps all six and
 * that order. FR-SEEK-1 names three *categories*; the sheet is not three
 * categories, it is a flat list of six rows, and each row opens the surface
 * its category implies:
 *
 *   * the four hotline rows  → the hotline list surface
 *   * নিকটবর্তী থানা          → the thana line surface
 *   * ম্যাপে স্টেশন খুঁজুন      → the find-a-station map
 *
 * The rows are read from the **bundled** curated dataset
 * (`MORE_HELP_ROWS` in `@nagar-shield/shared`), so the sheet renders with no
 * network at all — the dial path makes zero requests (ADR-003).
 *
 * The four hotline rows' numbers are **not** hardcoded here: they are looked
 * up from the bundle, so the sheet can never disagree with the curated
 * dataset. The four IDs below are the prototype's four entries, in the
 * prototype's order.
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
  const { t } = useTranslation()

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
        style={styles.rowsScroll}
        contentContainerStyle={styles.rows}
        showsVerticalScrollIndicator={false}
      >
        {/* The four prototype hotline rows, in the prototype's order.
            The row itself dials the number; the trailing chevron opens the
            hotline list, which carries the full curated set. */}
        {PROTOTYPE_HOTLINE_IDS.map((id) => {
          const row = MORE_HELP_ROWS.find((entry) => entry.id === id)
          if (!row) return null

          return (
            <SheetRow
              key={id}
              title={t(HOTLINE_LABEL_KEYS[id] ?? 'help.moreHelpTitle')}
              number={row.phone}
              accessibilityLabel={t('help.hotlineCallLabel', {
                name: t(HOTLINE_LABEL_KEYS[id] ?? 'help.moreHelpTitle'),
                number: row.phone,
              })}
              onPress={() => dial(row.phone)}
              onOpenList={openHotlineList}
              openListLabel={t('help.moreHelpOpenList')}
            />
          )
        })}

        <SheetRow
          title={t('help.nearestStation')}
          subtitle={t('help.nearestStationSub')}
          note={t('help.stationFallbackNote')}
          onPress={openThanaLine}
        />

        <SheetRow
          title={t('help.stationMap')}
          subtitle={t('help.stationMapSub')}
          icon="map"
          onPress={openStationMap}
        />
      </ScrollView>

      <Text
        accessibilityRole="button"
        accessibilityLabel={t('help.wrongNumber')}
        onPress={() => {
          onClose()
          router.push('/(app)/more-help')
        }}
        style={[styles.wrongNumber, { color: theme.palette.violet[700] }]}
      >
        {t('help.wrongNumber')}
      </Text>
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

/** One sheet row — the prototype's `.help-row`. */
function SheetRow({
  title,
  subtitle,
  number,
  note,
  icon = 'chevron_right',
  accessibilityLabel,
  openListLabel,
  onPress,
  onOpenList,
}: {
  title: string
  subtitle?: string
  number?: string
  note?: string
  icon?: string
  accessibilityLabel?: string
  openListLabel?: string
  onPress: () => void
  /**
   * When set, the row body dials (`onPress`) and the trailing chevron opens
   * this surface instead. Two targets, two accessibility labels: the story
   * says the call affordance prefills the dialer **and** the row's category
   * has its own surface.
   */
  onOpenList?: () => void
}) {
  const theme = useTheme()

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.ink[50] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        style={styles.rowHit}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.colors.ink[950] }]}>{title}</Text>
          {number ? (
            <Text style={[styles.rowNumber, { color: theme.colors.ink[500] }]}>{number}</Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.rowNumber, { color: theme.colors.ink[500] }]}>{subtitle}</Text>
          ) : null}
          {note ? (
            <Text style={[styles.rowNote, { color: theme.colors.ink[400] }]}>{note}</Text>
          ) : null}
        </View>
        {/* A navigation row has one target, so its icon is decoration inside
            the same button. */}
        {!onOpenList ? <Icon name={icon} size={20} color={theme.palette.violet[700]} /> : null}
      </Pressable>

      {onOpenList ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={openListLabel ?? title}
          onPress={onOpenList}
          style={styles.rowIcon}
        >
          <Icon name={icon} size={20} color={theme.palette.violet[700]} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  rowsScroll: {
    flexGrow: 0,
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  rowHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
    fontSize: 14,
  },
  rowNumber: {
    fontSize: 11,
    marginTop: 2,
  },
  rowNote: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 14,
  },
  wrongNumber: {
    marginTop: 14,
    paddingHorizontal: 4,
    fontSize: 11,
    textAlign: 'right',
    fontWeight: '600',
    minHeight: 48,
    textAlignVertical: 'center',
  },
})
