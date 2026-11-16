import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { HOTLINES, type HotlineEntry } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { appFont } from '@/shared/theme/appFont'
import { mixHex } from '@/shared/theme/colorMix'
import { withAlpha } from '@/shared/ui/AlertCard'
import { Icon, ManualDialGuidance, Screen, SolidIcon, WrongNumberSheet } from '@/shared/ui'
import type { SolidIconName } from '@/shared/ui/SolidIcon'
import { useAccent, type Accent } from '@/shared/ui/useAccent'
import { useDegradedHelp } from '@/shared/services/useDegradedHelp'
import { formatVerifiedStamp, isVerificationStale } from '@/shared/utils/verifiedStamp'

/**
 * The hotline list.
 *
 * `003-help-seek / 005-more-help-and-hotlines` — the surface the More Help
 * sheet's hotline rows open.
 *
 * Three things this screen is careful about:
 *
 *   * **The list is the full curated set, from the bundle.** The four rows in
 *     the sheet are the prototype's four; this list carries the whole set —
 *     including mental health, anti-drug and cyber-crime — ordered by
 *     `sortOrder`. It renders from the **bundled** dataset
 *     (`HOTLINES` in `@nagar-shield/shared`), so it renders in full with no
 *     network at all. The Postgres mirror is a separate read path, not a
 *     dial-path dependency.
 *   * **The number is never edited here.** A report references the entry; the
 *     curated value ships until the next quarterly refresh. The
 *     `lastVerifiedAt` stamp is surfaced so the user can see how fresh the
 *     number is, and a stamp older than one quarter is marked as due for
 *     verification rather than hidden.
 *   * **The rows are grouped by the entry's `category`**, in a fixed order, so
 *     a long list is scanned by kind of help instead of read top to bottom.
 *     `sortOrder` still orders the rows inside a group.
 */

interface CategoryLook {
  labelKey: string
  icon: SolidIconName
  color: Accent
}

/** The groups in the order they appear. Anything not listed falls under "other". */
const CATEGORY_ORDER = ['police', 'medical', 'fire', 'helpline', 'utility'] as const

const CATEGORY_LOOKS: Record<string, CategoryLook> = {
  police: { labelKey: 'help.hotlineCatPolice', icon: 'shield', color: 'violet' },
  medical: { labelKey: 'help.hotlineCatMedical', icon: 'medical', color: 'green' },
  fire: { labelKey: 'help.hotlineCatFire', icon: 'fire', color: 'amber' },
  helpline: { labelKey: 'help.hotlineCatHelpline', icon: 'people', color: 'sky' },
  utility: { labelKey: 'help.hotlineCatUtility', icon: 'call', color: 'sky' },
  other: { labelKey: 'help.hotlineCatOther', icon: 'call', color: 'violet' },
}

export default function MoreHelpScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const [reporting, setReporting] = useState<HotlineEntry | null>(null)

  // The same degraded-mode flow every help entry point uses.
  const degradedHelp = useDegradedHelp()

  // The bundled list is already sorted by `sortOrder` by the shared package;
  // the filter keeps only the **active** entries, so a retired row never
  // reaches the screen. The grouping keeps that order inside each group.
  const groups = useMemo(() => {
    const active = HOTLINES.filter((hotline) => hotline.isActive)
    const keyOf = (hotline: HotlineEntry) =>
      (CATEGORY_ORDER as readonly string[]).includes(hotline.category) ? hotline.category : 'other'

    return [...CATEGORY_ORDER, 'other']
      .map((key) => ({ key, rows: active.filter((hotline) => keyOf(hotline) === key) }))
      .filter((group) => group.rows.length > 0)
  }, [])

  const displayName = (hotline: HotlineEntry) =>
    lang === 'bn' ? (hotline.nameBn ?? hotline.name) : hotline.name

  return (
    <>
      <Screen
        title={t('help.hotlineListTitle')}
        subtitle={t('help.hotlineListSubtitle')}
        onBack={() => router.back()}
        footer={
          // Pinned under the list: with twelve rows the note would otherwise
          // land below the fold, and a failed dial would look like nothing
          // happened. The footer pads the sides, the guidance pads itself.
          degradedHelp.showGuidance && degradedHelp.guidanceNumber ? (
            <View style={styles.pinned}>
              <ManualDialGuidance
                number={degradedHelp.guidanceNumber}
                showPowerSaveWarning={degradedHelp.showPowerSaveWarning}
                showOfflineNotice={degradedHelp.showOfflineNotice}
              />
            </View>
          ) : undefined
        }
      >
        <View style={styles.list}>
          {groups.map((group) => {
            const look = CATEGORY_LOOKS[group.key] ?? CATEGORY_LOOKS.other!

            return (
              <View key={group.key} style={styles.group}>
                <GroupHeading look={look} label={t(look.labelKey)} />
                {group.rows.map((hotline) => (
                  <HotlineCard
                    key={hotline.id}
                    hotline={hotline}
                    look={look}
                    name={displayName(hotline)}
                    onDial={() => {
                      void degradedHelp.dial(hotline.phone)
                    }}
                    onReport={() => setReporting(hotline)}
                  />
                ))}
              </View>
            )
          })}
        </View>
      </Screen>

      {/* The sheet is a Modal, so it lives beside the screen, not in its scroll. */}
      <WrongNumberSheet
        visible={reporting !== null}
        onClose={() => setReporting(null)}
        entryType="hotline"
        entryId={reporting?.id ?? ''}
        entryName={reporting ? displayName(reporting) : undefined}
      />
    </>
  )
}

function GroupHeading({ look, label }: { look: CategoryLook; label: string }) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const { well, glyph } = useAccent(look.color)

  return (
    <View style={styles.heading}>
      <View style={[styles.headingIcon, { backgroundColor: well }]}>
        <SolidIcon name={look.icon} size={14} color={glyph} />
      </View>
      <Text
        style={[
          styles.headingText,
          { color: theme.colors.ink[700], fontFamily: appFont('bold', i18n.language) },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

/**
 * One hotline: the top of the card dials, the bottom says how fresh the number
 * is and lets the user report it. The two are separate buttons, so a tap on the
 * report pill never places a call.
 */
function HotlineCard({
  hotline,
  look,
  name,
  onDial,
  onReport,
}: {
  hotline: HotlineEntry
  look: CategoryLook
  name: string
  onDial: () => void
  onReport: () => void
}) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const { well, glyph } = useAccent(look.color)
  const dark = theme.colors.isDark
  const stale = isVerificationStale(hotline.lastVerifiedAt)

  const reportInk = dark
    ? theme.palette.amber[500]
    : mixHex(theme.palette.amber[600], theme.colors.ink[950], 0.4)

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('help.hotlineCallLabel', { name, number: hotline.phone })}
        onPress={onDial}
        style={({ pressed }) => [styles.dialRow, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.well, { backgroundColor: well }]}>
          <SolidIcon name={look.icon} size={24} color={glyph} />
        </View>
        <View style={styles.dialText}>
          <Text
            numberOfLines={2}
            style={[
              styles.name,
              { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
            ]}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.number,
              { color: theme.colors.ink[700], fontFamily: appFont('bold', i18n.language) },
            ]}
          >
            {hotline.phone}
          </Text>
        </View>
        <View
          style={[
            styles.callButton,
            { backgroundColor: dark ? theme.palette.green[500] : theme.palette.green[700] },
          ]}
        >
          <SolidIcon name="call" size={20} color={theme.staticColors.white} />
        </View>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.colors.ink[100] }]} />

      <View style={styles.metaRow}>
        <View style={styles.stamp}>
          {stale ? (
            <Text style={[styles.stale, { color: theme.palette.amber[600] }]}>
              {t('help.hotlineStale')}
            </Text>
          ) : null}
          <Text style={[styles.stampText, { color: theme.colors.ink[500] }]}>
            {t('help.hotlineVerifiedOn', {
              date: formatVerifiedStamp(hotline.lastVerifiedAt, i18n.language),
            })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('help.wrongNumberTitle')}
          onPress={onReport}
          style={({ pressed }) => [
            styles.reportPill,
            {
              backgroundColor: withAlpha(theme.palette.amber[500], dark ? 0.2 : 0.14),
              borderColor: withAlpha(theme.palette.amber[500], 0.5),
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon name="report" size={14} color={theme.palette.amber[600]} />
          <Text
            numberOfLines={2}
            style={[
              styles.reportText,
              { color: reportInk, fontFamily: appFont('bold', i18n.language) },
            ]}
          >
            {t('help.wrongNumber')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pinned: {
    marginHorizontal: -20,
  },
  list: {
    paddingHorizontal: 20,
  },
  group: {
    marginBottom: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  headingIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: {
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 18,
    marginBottom: 10,
    overflow: 'hidden',
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    minHeight: 48,
  },
  well: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialText: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
  },
  number: {
    fontSize: 18,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stamp: {
    flex: 1,
    gap: 2,
  },
  stale: {
    fontSize: 12,
    fontWeight: '600',
  },
  stampText: {
    fontSize: 12,
  },
  reportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '62%',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  reportText: {
    flexShrink: 1,
    fontSize: 12,
    textAlign: 'center',
  },
})
