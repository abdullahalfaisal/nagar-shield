import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { REPORT_CATEGORY_LABELS } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { BottomSheet, Button, CheckRow, ChoiceChip } from '@/shared/ui'
import {
  HISTORY_CATEGORY_OPTIONS,
  HISTORY_RADIUS_OPTIONS,
  HISTORY_WINDOW_OPTIONS,
  resetHistoryFilters,
  type HistoryFilters,
} from '@/shared/services/historyFilters'

/**
 * The History filter sheet.
 *
 * `006-alerts / 007-history-filters` — the sheet the location pill's trailing
 * `keyboard_arrow_down` opens.
 *
 * Three rules this component exists to enforce:
 *
 *   * **Draft, then commit.** The sheet edits a *copy* of the applied filters
 *     and commits it on confirm. A cancelled sheet — a scrim tap, a back
 *     gesture, the close button — changes nothing at all (AC #10).
 *   * **One query, once.** The confirm action applies the draft exactly once.
 *     The list re-queries once, not once per intermediate change (AC #9).
 *   * **The reset is the defaults, not an empty state.** An empty filter set
 *     is not a legal configuration; the reset sets exactly 1 km / 24 h / no
 *     category — the same values a cold launch uses (AC #7).
 */
interface HistoryFilterSheetProps {
  visible: boolean
  /** The **applied** filters — the sheet's starting point. */
  filters: HistoryFilters
  onClose: () => void
  /** Called on confirm with the committed draft. */
  onApply: (filters: HistoryFilters) => void
}

export function HistoryFilterSheet({
  visible,
  filters,
  onClose,
  onApply,
}: HistoryFilterSheetProps) {
  const theme = useTheme()
  const { t } = useTranslation()

  const [draft, setDraft] = useState<HistoryFilters>(filters)

  // Re-seed the draft whenever the sheet opens, so a cancelled sheet leaves no
  // residue in the next one.
  useEffect(() => {
    if (visible) setDraft(filters)
  }, [visible, filters])

  const cancel = () => {
    setDraft(filters)
    onClose()
  }

  const reset = () => {
    setDraft(resetHistoryFilters())
  }

  const apply = () => {
    onApply(draft)
    onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      title={t('history.filtersTitle')}
      helper={t('history.filterHelper')}
      onClose={cancel}
    >
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.groupLabel, { color: theme.colors.ink[500] }]}>
          {t('history.radiusLabel')}
        </Text>
        <View style={styles.chips}>
          {HISTORY_RADIUS_OPTIONS.map((radiusKm) => (
            <ChoiceChip
              key={radiusKm}
              label={
                radiusKm < 1
                  ? t('history.metres', { count: Math.round(radiusKm * 1000) })
                  : t('history.km', { count: radiusKm })
              }
              selected={draft.radiusKm === radiusKm}
              onPress={() => setDraft((current) => ({ ...current, radiusKm }))}
            />
          ))}
        </View>

        <Text style={[styles.groupLabel, { color: theme.colors.ink[500] }]}>
          {t('history.windowLabel')}
        </Text>
        <View style={styles.chips}>
          {HISTORY_WINDOW_OPTIONS.map((windowHours) => (
            <ChoiceChip
              key={windowHours}
              label={
                windowHours < 24
                  ? t('history.hours', { count: windowHours })
                  : t('history.days', { count: Math.round(windowHours / 24) })
              }
              selected={draft.windowHours === windowHours}
              onPress={() => setDraft((current) => ({ ...current, windowHours }))}
            />
          ))}
        </View>

        <Text style={[styles.groupLabel, { color: theme.colors.ink[500] }]}>
          {t('history.categoryLabel')}
        </Text>
        <View
          style={[
            styles.categoryBox,
            { backgroundColor: theme.colors.surface.white, borderColor: theme.colors.ink[100] },
          ]}
        >
          <CheckRow
            label={t('history.allCategories')}
            selected={draft.category === null}
            onPress={() => setDraft((current) => ({ ...current, category: null }))}
          />
          {HISTORY_CATEGORY_OPTIONS.map((category) => (
            <CheckRow
              key={category}
              label={`${REPORT_CATEGORY_LABELS[category].bn} — ${REPORT_CATEGORY_LABELS[category].en}`}
              selected={draft.category === category}
              onPress={() => setDraft((current) => ({ ...current, category }))}
            />
          ))}
        </View>

        <Button label={t('history.apply')} variant="primary" onPress={apply} style={styles.apply} />
        <Button label={t('history.reset')} variant="ghost" onPress={reset} style={styles.reset} />
        <Button label={t('common.cancel')} variant="ghost" onPress={cancel} style={styles.cancel} />
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    maxHeight: 520,
    paddingHorizontal: 20,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 16,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBox: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  apply: {
    marginTop: 20,
  },
  reset: {
    marginTop: 4,
  },
  cancel: {
    marginTop: 0,
  },
})
