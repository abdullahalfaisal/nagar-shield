import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { HOTLINES, type HotlineEntry } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { Icon, ListRow, ManualDialGuidance, Screen, WrongNumberSheet } from '@/shared/ui'
import { useDegradedHelp } from '@/shared/services/useDegradedHelp'
import { formatVerifiedStamp, isVerificationStale } from '@/shared/utils/verifiedStamp'

/**
 * The hotline list.
 *
 * `003-help-seek / 005-more-help-and-hotlines` — the surface the More Help
 * sheet's hotline rows open.
 *
 * Two things this screen is careful about:
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
 */
export default function MoreHelpScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const [reporting, setReporting] = useState<HotlineEntry | null>(null)

  // The same degraded-mode flow every help entry point uses.
  const degradedHelp = useDegradedHelp()

  // The bundled list is already sorted by `sortOrder` by the shared package;
  // the filter keeps only the **active** entries, so a retired row never
  // reaches the screen.
  const hotlines = useMemo(() => HOTLINES.filter((hotline) => hotline.isActive), [])

  const displayName = (hotline: HotlineEntry) =>
    i18n.language === 'bn' ? (hotline.nameBn ?? hotline.name) : hotline.name

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
          {hotlines.map((hotline) => {
            const stale = isVerificationStale(hotline.lastVerifiedAt)
            const label = displayName(hotline)

            return (
              <View key={hotline.id} style={styles.row}>
                <ListRow
                  title={label}
                  subtitle={hotline.phone}
                  icon="call"
                  tone="purple"
                  showArrow={false}
                  accessibilityLabel={t('help.hotlineCallLabel', {
                    name: label,
                    number: hotline.phone,
                  })}
                  onPress={() => {
                    void degradedHelp.dial(hotline.phone)
                  }}
                />
                {/* The stamp sits under the row, not beside the name, so a long
                  Bengali hotline name keeps the full row width. */}
                <View style={styles.trailing}>
                  {stale ? (
                    <Text style={[styles.stale, { color: theme.palette.amber[600] }]}>
                      {t('help.hotlineStale')}
                    </Text>
                  ) : null}
                  <Text style={[styles.stamp, { color: theme.colors.ink[500] }]}>
                    {t('help.hotlineVerifiedOn', {
                      date: formatVerifiedStamp(hotline.lastVerifiedAt, i18n.language),
                    })}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('help.wrongNumberTitle')}
                  onPress={() => setReporting(hotline)}
                  style={styles.reportLink}
                >
                  <Icon name="report" size={14} color={theme.palette.amber[600]} />
                  <Text style={[styles.reportText, { color: theme.palette.violet[700] }]}>
                    {t('help.wrongNumber')}
                  </Text>
                </Pressable>
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

const styles = StyleSheet.create({
  pinned: {
    marginHorizontal: -20,
  },
  list: {
    paddingHorizontal: 20,
  },
  row: {
    marginBottom: 4,
  },
  trailing: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 2,
  },
  stale: {
    fontSize: 12,
    fontWeight: '600',
  },
  stamp: {
    fontSize: 12,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  reportText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
