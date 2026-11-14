import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar } from '@/shared/ui/AppBar'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Icon } from '@/shared/ui/Icon'
import { useAuthSession } from '@/shared/auth/useAuthSession'
import {
  signMediaUrl,
  updateCategory,
  useInvalidateReport,
  useOwnedReport,
} from '@/shared/api/reportDetail'
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime'

/**
 * The author's own report — the Report detail screen.
 *
 * `004-capture / 003-report-detail-and-category-edit`:
 *
 *   * AC #1 — "it shows the media, the description, the resolved area, the
 *     capture time, and the category";
 *   * AC #2 — "the category row shows the neutral 'uncategorised' placeholder
 *     and an explicit affordance to set a category; the report is never shown
 *     as invalid or incomplete";
 *   * AC #3 — "it lists exactly the fixed 11 values … each with its Bangla
 *     label, and there is **no** free-text field";
 *   * AC #9 — "a non-author viewing a report's category … the category is
 *     shown read-only with no edit affordance and no editor can be opened";
 *   * AC #10 — "no edit affordance for [the media, the location, the
 *     description, or the visibility] exists — the category is the **only**
 *     editable field after submit".
 *
 * This is a **new surface** — the prototype has no report-detail screen — so
 * it is built from the existing token set and the shared primitives. It
 * introduces no new layout system, no new colour token, and no new type ramp.
 *
 * The category is the only editable field
 * --------------------------------------
 * The media, the location, the description and the visibility are immutable
 * after submit. There is no affordance for any of them here, and there is no
 * client method that would write them — the database refuses it too, through
 * the `reports_update_guard` trigger. A "correct my location" flow is
 * explicitly out of scope for the MVP: re-reporting is the path.
 *
 * The author check
 * ----------------
 * The UI hides the edit affordance for a non-author, but the UI is not the
 * authority: `update_category` is `SECURITY DEFINER` and compares
 * `auth.uid()` to the row's `author_id` itself, so a forged request is
 * refused with `FORBIDDEN` by the database.
 */
export default function ReportDetailScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{ reportId?: string }>()
  const reportId = params.reportId

  const { session } = useAuthSession()
  const { data: report, isLoading, error } = useOwnedReport(reportId)
  const invalidate = useInvalidateReport()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})

  // The author may edit their own report's category. The comparison is
  // against the row's own `author_id`, not against "the session exists" —
  // the read is already scoped by RLS, so a report the caller does not own
  // does not resolve at all.
  const isAuthor = Boolean(session && report && report.authorId === session.user.id)

  // The signed URLs are fetched once the media rows are known. The bucket is
  // private, so a URL is needed to render the image — and it is fetched on
  // demand, never stored.
  useEffect(() => {
    let active = true

    if (!report || report.media.length === 0) {
      setMediaUrls({})
      return
    }

    void Promise.all(
      report.media.map(async (media) => {
        const url = await signMediaUrl(media.storagePath)
        return [media.storagePath, url] as const
      }),
    ).then((pairs) => {
      if (!active) return
      setMediaUrls(
        Object.fromEntries(pairs.filter(([, url]) => Boolean(url))) as Record<string, string>,
      )
    })

    return () => {
      active = false
    }
  }, [report])

  const category = report?.category ?? null
  const categoryLabel = category ? REPORT_CATEGORY_LABELS[category] : null
  const accent = category ? REPORT_CATEGORY_ACCENTS[category] : theme.colors.ink[400]

  const areaLine = useMemo(() => {
    const area = report?.areaHierarchy
    if (!area) return null
    const english = area.neighborhood ?? area.thana ?? area.city ?? area.division
    const bangla = area.neighborhood ?? area.thana ?? area.city ?? area.division
    if (!english) return null
    return english === bangla ? english : `${english} · ${bangla}`
  }, [report])

  const capturedAt = report ? formatRelativeTimeForLocale(report.capturedAt, i18n.language) : ''

  const choose = async (next: ReportCategory) => {
    if (!reportId || pending) return

    setPending(true)
    setSaveError(null)

    try {
      await updateCategory(reportId, next)
      await invalidate(reportId)
      setSheetOpen(false)
    } catch (caught) {
      // The row keeps its previous category — the save is pessimistic, so the
      // user is never shown a category the database rejected.
      setSaveError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  // The screen renders the report only when there is one. A report that does
  // not resolve — because it does not exist, or because it is not the
  // caller's — is not an error screen: it is a row that does not exist for
  // this session.
  if (isLoading) {
    return (
      <View
        style={[styles.root, styles.centered, { backgroundColor: theme.colors.surface.lavender }]}
      >
        <ActivityIndicator color={theme.palette.violet[600]} />
      </View>
    )
  }

  if (error || !report) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
        <AppBar title={t('alerts.reportDetailTitle')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text style={[styles.missing, { color: theme.colors.ink[500] }]}>
            {t('alerts.reportNotFound')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('alerts.reportDetailTitle')} onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* The media block. A report whose media upload failed renders the
            rest of the detail without a media block — never a broken image
            frame. */}
        {report.media.length > 0 ? (
          <View style={styles.mediaStrip}>
            {report.media.map((media) => {
              const url = mediaUrls[media.storagePath]
              return (
                <View
                  key={media.id}
                  style={[styles.mediaTile, { backgroundColor: theme.colors.ink[100] }]}
                >
                  {url ? (
                    <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
                  ) : (
                    <Icon name="image" size={28} color={theme.colors.ink[400]} />
                  )}
                </View>
              )
            })}
          </View>
        ) : null}

        {/* The description. */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
          <Text style={[styles.description, { color: theme.colors.ink[950] }]}>
            {report.description ?? t('alerts.noDescription')}
          </Text>
        </View>

        {/* The facts: the resolved area and the capture time. */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
          <FactRow icon="location_on" label={t('alerts.locationLabel')} value={areaLine ?? '—'} />
          <View style={[styles.hairline, { backgroundColor: theme.colors.ink[100] }]} />
          <FactRow icon="schedule" label={t('alerts.capturedAtLabel')} value={capturedAt} />
        </View>

        {/* The category row — the ONLY editable field. */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
          <Pressable
            accessibilityRole={isAuthor ? 'button' : 'text'}
            accessibilityLabel={
              isAuthor
                ? `${t('alerts.editCategory')}. ${categoryLabel ? categoryLabel.bn : t('alerts.uncategorised')}`
                : t('alerts.categoryReadOnly')
            }
            accessibilityState={{ disabled: !isAuthor }}
            disabled={!isAuthor}
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.categoryRow,
              pressed && isAuthor && { backgroundColor: theme.palette.violet[25] },
            ]}
          >
            <View style={[styles.categoryIcon, { backgroundColor: `${accent}1A` }]}>
              <Icon
                name={category ? REPORT_CATEGORY_ICONS[category] : 'help'}
                size={20}
                color={accent}
                filled
              />
            </View>

            <View style={styles.categoryText}>
              <Text style={[styles.factLabel, { color: theme.colors.ink[500] }]}>
                {t('alerts.categoryLabel')}
              </Text>
              <Text style={[styles.categoryValue, { color: theme.colors.ink[950] }]}>
                {categoryLabel
                  ? `${categoryLabel.bn} — ${categoryLabel.en}`
                  : t('alerts.uncategorised')}
              </Text>
            </View>

            {isAuthor ? (
              <Icon name="chevron_right" size={20} color={theme.colors.ink[400]} />
            ) : (
              <Text style={[styles.readOnly, { color: theme.colors.ink[400] }]}>
                {t('alerts.readOnly')}
              </Text>
            )}
          </Pressable>
        </View>

        {/* The note explaining that the category is the only editable field.
            It is not an error and not a warning — it is the truth about what
            the screen can do. */}
        {!isAuthor ? (
          <Text style={[styles.note, { color: theme.colors.ink[500] }]}>
            {t('alerts.categoryReadOnly')}
          </Text>
        ) : null}

        {saveError ? (
          <Text style={[styles.saveError, { color: theme.palette.red[600] }]}>{saveError}</Text>
        ) : null}
      </ScrollView>

      {/* The category sheet — exactly the 11 values, each with its Bangla
          label, and no free-text field anywhere. */}
      <BottomSheet
        visible={sheetOpen}
        title={t('alerts.editCategory')}
        helper={t('alerts.categorySheetHelper')}
        onClose={() => setSheetOpen(false)}
      >
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          {REPORT_CATEGORIES.map((value) => {
            const label = REPORT_CATEGORY_LABELS[value]
            const selected = category === value

            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: pending }}
                accessibilityLabel={`${label.bn} — ${label.en}`}
                disabled={pending}
                onPress={() => void choose(value)}
                style={({ pressed }) => [
                  styles.sheetRow,
                  {
                    backgroundColor: selected
                      ? theme.palette.violet[50]
                      : pressed
                        ? theme.colors.ink[50]
                        : theme.colors.ink[50],
                    borderColor: selected ? theme.palette.violet[300] : 'transparent',
                  },
                ]}
              >
                <View
                  style={[
                    styles.sheetIcon,
                    { backgroundColor: `${REPORT_CATEGORY_ACCENTS[value]}1A` },
                  ]}
                >
                  <Icon
                    name={REPORT_CATEGORY_ICONS[value]}
                    size={20}
                    color={REPORT_CATEGORY_ACCENTS[value]}
                    filled
                  />
                </View>

                <View style={styles.sheetText}>
                  <Text style={[styles.sheetTitle, { color: theme.colors.ink[950] }]}>
                    {label.bn}
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: theme.colors.ink[500] }]}>
                    {label.en}
                  </Text>
                </View>

                {selected ? (
                  <Icon name="check" size={20} color={theme.palette.violet[700]} />
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  )
}

/** One label/value pair — the area, the capture time. */
function FactRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme()

  return (
    <View style={styles.factRow}>
      <View style={[styles.factIcon, { backgroundColor: theme.colors.ink[100] }]}>
        <Icon name={icon} size={18} color={theme.colors.ink[700]} />
      </View>
      <View style={styles.factText}>
        <Text style={[styles.factLabel, { color: theme.colors.ink[500] }]}>{label}</Text>
        <Text style={[styles.factValue, { color: theme.colors.ink[950] }]}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  mediaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  mediaTile: {
    width: 104,
    height: 104,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    minWidth: 0,
  },
  factLabel: {
    fontSize: 11,
    marginBottom: 1,
  },
  factValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  categoryIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    flex: 1,
    minWidth: 0,
  },
  categoryValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 1,
  },
  readOnly: {
    fontSize: 11,
  },
  note: {
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  saveError: {
    fontSize: 12,
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  sheetScroll: {
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 56,
  },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetText: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  sheetSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
})
