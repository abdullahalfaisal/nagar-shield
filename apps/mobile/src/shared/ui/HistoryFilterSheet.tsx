import { Children, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { REPORT_CATEGORY_ACCENTS, REPORT_CATEGORY_LABELS } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { appFont } from '@/shared/theme/appFont'
import { mixHex } from '@/shared/theme/colorMix'
import { areaOptionName, useAreaOptions, type AreaOption } from '@/shared/api/areas'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { CATEGORY_SOLID_ICONS, withAlpha } from './AlertCard'
import { SolidIcon, type SolidIconName } from './SolidIcon'
import {
  HISTORY_RADIUS_OPTIONS,
  HISTORY_TYPE_ORDER,
  HISTORY_WINDOW_OPTIONS,
  resetHistoryFilters,
  type HistoryFilters,
} from '@/shared/services/historyFilters'
import { toBengaliDigits } from '@/shared/utils/relativeTime'

/**
 * The History filter sheet.
 *
 * `006-alerts / 007-history-filters` — the sheet the filter card opens.
 *
 * Three rules this component exists to enforce:
 *
 *   * **Draft, then commit.** The sheet edits a *copy* of the applied filters
 *     and commits it on confirm. A cancelled sheet — a scrim tap, a back
 *     gesture, the close button — changes nothing at all (AC #10).
 *   * **One query, once.** The confirm action applies the draft exactly once.
 *     The list re-queries once, not once per intermediate change (AC #9).
 *   * **The reset is the defaults, not an empty state.** An empty filter set
 *     is not a legal configuration; the reset sets exactly the widest radius,
 *     the default window and no category — the same values a cold launch uses
 *     (AC #7).
 *
 * The groups are even grids, so every row is full: radius 3 × 2, window 4 × 1,
 * incident types 4 × 3 in a fixed order. The area sits at the top as one field
 * that swaps the sheet for a searchable list: "My location", or any area. An
 * area replaces the phone's position as the centre of the radius.
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
  const { t, i18n } = useTranslation()
  const digits = (value: number) =>
    i18n.language === 'bn' ? toBengaliDigits(String(value)) : String(value)

  const [draft, setDraft] = useState<HistoryFilters>(filters)
  // The sheet shows the filters, or the list of areas in their place.
  const [page, setPage] = useState<'filters' | 'area'>('filters')
  const { data: areaOptions } = useAreaOptions()
  const draftArea = areaOptions?.find((option) => option.id === draft.areaId) ?? null

  // Re-seed the draft whenever the sheet opens, so a cancelled sheet leaves no
  // residue in the next one.
  useEffect(() => {
    if (visible) {
      setDraft(filters)
      setPage('filters')
    }
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

  const language = i18n.language === 'bn' ? 'bn' : 'en'

  if (page === 'area') {
    return (
      <BottomSheet visible={visible} title={t('history.areaSheetTitle')} onClose={cancel}>
        <AreaPage
          selectedId={draft.areaId}
          onBack={() => setPage('filters')}
          onSelect={(areaId) => {
            setDraft((current) => ({ ...current, areaId }))
            setPage('filters')
          }}
        />
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      visible={visible}
      title={t('history.filtersTitle')}
      helper={t('history.filterHelper')}
      onClose={cancel}
    >
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <GroupLabel text={t('history.areaLabel')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('history.areaLabel')}: ${
            draftArea ? areaOptionName(draftArea, i18n.language) : t('history.myLocation')
          }`}
          onPress={() => setPage('area')}
          style={[
            styles.areaField,
            { backgroundColor: theme.colors.surface.lavender, borderColor: theme.colors.ink[300] },
          ]}
        >
          <AreaTile myLocation={draftArea === null} />
          <Text
            numberOfLines={1}
            style={[
              styles.areaFieldText,
              { color: theme.colors.ink[950], fontFamily: appFont('semibold', i18n.language) },
            ]}
          >
            {draftArea ? areaOptionName(draftArea, i18n.language) : t('history.myLocation')}
          </Text>
          <SolidIcon name="chevronDown" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <GroupLabel text={t('history.radiusLabel')} />
        <Rows columns={3}>
          {HISTORY_RADIUS_OPTIONS.map((radiusKm) => (
            <Choice
              key={radiusKm}
              selected={draft.radiusKm === radiusKm}
              onPress={() => setDraft((current) => ({ ...current, radiusKm }))}
              label={
                radiusKm < 1
                  ? t('history.metres', { value: digits(Math.round(radiusKm * 1000)) })
                  : t('history.km', { value: digits(radiusKm) })
              }
            />
          ))}
        </Rows>

        <GroupLabel text={t('history.windowLabel')} />
        <Rows columns={4}>
          {HISTORY_WINDOW_OPTIONS.map((windowHours) => (
            <Choice
              key={windowHours}
              selected={draft.windowHours === windowHours}
              onPress={() => setDraft((current) => ({ ...current, windowHours }))}
              label={
                windowHours < 24
                  ? t('history.hours', { value: digits(windowHours) })
                  : t('history.days', { value: digits(Math.round(windowHours / 24)) })
              }
            />
          ))}
        </Rows>

        <GroupLabel text={t('history.categoryLabel')} />
        <Rows columns={4}>
          <TypeTile
            selected={draft.category === null}
            onPress={() => setDraft((current) => ({ ...current, category: null }))}
            label={t('history.allCategories')}
            glyph="grid"
            accent={null}
          />
          {HISTORY_TYPE_ORDER.map((category) => (
            <TypeTile
              key={category}
              selected={draft.category === category}
              onPress={() => setDraft((current) => ({ ...current, category }))}
              label={REPORT_CATEGORY_LABELS[category][language]}
              glyph={CATEGORY_SOLID_ICONS[category]}
              accent={REPORT_CATEGORY_ACCENTS[category]}
            />
          ))}
        </Rows>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.ink[100] }]}>
        <Button
          label={t('history.reset')}
          variant="ghost"
          fullWidth={false}
          onPress={reset}
          style={styles.reset}
        />
        <Button label={t('history.apply')} variant="primary" onPress={apply} style={styles.apply} />
      </View>
    </BottomSheet>
  )
}

/** The tile at the left of an area row: a locate glyph for "my location", a pin for an area. */
function AreaTile({ myLocation }: { myLocation: boolean }) {
  const theme = useTheme()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <View style={[styles.areaTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
      <SolidIcon name={myLocation ? 'myLocation' : 'pin'} size={20} color={violet} />
    </View>
  )
}

/**
 * The list of areas that takes the sheet's place: a way back, a search box, "My
 * location" first, then every area in the reader's alphabet. The search matches
 * the English and the Bangla spelling.
 */
function AreaPage({
  selectedId,
  onBack,
  onSelect,
}: {
  selectedId: string | null
  onBack: () => void
  onSelect: (areaId: string | null) => void
}) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const font = (weight: 'medium' | 'semibold' | 'bold') => appFont(weight, i18n.language)
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const { data, isLoading, isError, refetch } = useAreaOptions()
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) =>
      areaOptionName(a, i18n.language).localeCompare(
        areaOptionName(b, i18n.language),
        i18n.language,
      ),
    )
    const needle = query.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) || option.nameBn.toLowerCase().includes(needle),
    )
  }, [data, query, i18n.language])

  const row = (
    key: string,
    label: string,
    sub: string | null,
    myLocation: boolean,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.areaRow,
        { borderBottomColor: theme.colors.ink[100] },
        pressed && { backgroundColor: withAlpha(violet, 0.08) },
      ]}
    >
      <AreaTile myLocation={myLocation} />
      <View style={styles.areaRowText}>
        <Text
          numberOfLines={1}
          style={[
            styles.areaRowTitle,
            { color: theme.colors.ink[950], fontFamily: font('semibold') },
          ]}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            numberOfLines={1}
            style={[
              styles.areaRowSub,
              { color: theme.colors.textMuted, fontFamily: font('medium') },
            ]}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {selected ? <SolidIcon name="check" size={22} color={violet} /> : null}
    </Pressable>
  )

  return (
    <View style={styles.areaPage}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('history.filtersTitle')}
        onPress={onBack}
        style={styles.areaBack}
      >
        <SolidIcon name="chevronLeft" size={20} color={violet} />
        <Text style={[styles.areaBackText, { color: violet, fontFamily: font('bold') }]}>
          {t('history.filtersTitle')}
        </Text>
      </Pressable>

      <View
        style={[
          styles.areaSearch,
          { backgroundColor: theme.colors.surface.lavender, borderColor: theme.colors.ink[300] },
        ]}
      >
        <SolidIcon name="search" size={20} color={theme.colors.textMuted} />
        <TextInput
          accessibilityLabel={t('capture.areaSearchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('capture.areaSearchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          style={[
            styles.areaSearchInput,
            { color: theme.colors.ink[950], fontFamily: font('medium') },
          ]}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('capture.areaSearchClear')}
            onPress={() => setQuery('')}
            style={styles.areaSearchClear}
          >
            <SolidIcon name="dismiss" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.areaList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {query.trim() === ''
          ? row(
              'mine',
              t('history.myLocation'),
              t('history.myLocationSub'),
              true,
              selectedId === null,
              () => onSelect(null),
            )
          : null}
        {isLoading ? (
          <View style={styles.areaNote} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={theme.colors.ink[500]} />
            <Text
              style={[
                styles.areaNoteText,
                { color: theme.colors.ink[700], fontFamily: font('medium') },
              ]}
            >
              {t('capture.areasLoading')}
            </Text>
          </View>
        ) : null}
        {isError && shown.length === 0 ? (
          <View style={styles.areaNote}>
            <Text
              style={[
                styles.areaNoteText,
                { color: theme.colors.ink[700], fontFamily: font('medium') },
              ]}
            >
              {t('capture.areasError')}
            </Text>
            <Button label={t('common.retry')} variant="secondary" onPress={() => void refetch()} />
          </View>
        ) : null}
        {!isLoading && (data?.length ?? 0) > 0 && shown.length === 0 ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.areaEmpty,
              { color: theme.colors.textMuted, fontFamily: font('medium') },
            ]}
          >
            {t('capture.areaSearchEmpty')}
          </Text>
        ) : null}
        {shown.map((option: AreaOption) =>
          row(
            option.id,
            areaOptionName(option, i18n.language),
            option.city,
            false,
            option.id === selectedId,
            () => onSelect(option.id),
          ),
        )}
      </ScrollView>
    </View>
  )
}

function GroupLabel({ text }: { text: string }) {
  const theme = useTheme()
  const { i18n } = useTranslation()

  return (
    <Text
      style={[
        styles.groupLabel,
        { color: theme.colors.ink[700], fontFamily: appFont('bold', i18n.language) },
      ]}
    >
      {text}
    </Text>
  )
}

/**
 * Lays cells out in rows of exactly `columns`, every cell the same width. Each
 * row is its own flex row, so the cells share the row evenly and the last cell
 * never drops to the next line (a percentage width plus a gap can add up to
 * more than the row).
 */
function Rows({ columns, children }: { columns: number; children: ReactNode }) {
  // `toArray` flattens the mapped lists and gives every cell a key.
  const cells = Children.toArray(children)
  const rows: ReactNode[][] = []
  for (let index = 0; index < cells.length; index += columns) {
    rows.push(cells.slice(index, index + columns))
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.gridRow}>
          {row}
        </View>
      ))}
    </View>
  )
}

/** A text choice: radius or window. */
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? withAlpha(violet, 0.12) : theme.colors.surface.lavender,
          borderColor: selected ? violet : theme.colors.ink[200],
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.choiceText,
          {
            color: selected ? violet : theme.colors.ink[700],
            fontFamily: appFont(selected ? 'bold' : 'semibold', i18n.language),
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** An incident type: its glyph above its name, in a tile of the 4-column grid. */
function TypeTile({
  label,
  glyph,
  accent,
  selected,
  onPress,
}: {
  label: string
  glyph: SolidIconName
  /** The type's own colour, or `null` for "all types". */
  accent: string | null
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const glyphColor = accent
    ? theme.colors.isDark
      ? mixHex(accent, theme.staticColors.white, 0.45)
      : accent
    : theme.colors.textMuted

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.tile,
        {
          backgroundColor: selected ? withAlpha(violet, 0.12) : theme.colors.surface.lavender,
          borderColor: selected ? violet : theme.colors.ink[200],
        },
      ]}
    >
      <SolidIcon name={glyph} size={20} color={selected ? violet : glyphColor} />
      <Text
        numberOfLines={1}
        style={[
          styles.tileText,
          {
            color: selected ? violet : theme.colors.ink[700],
            fontFamily: appFont(selected ? 'bold' : 'semibold', i18n.language),
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: {
    maxHeight: 460,
    paddingHorizontal: 20,
  },
  groupLabel: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  // Even grids: every row is full, so nothing ends in a ragged edge.
  grid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  choice: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 14,
    lineHeight: 20,
  },
  tile: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 3,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontSize: 12,
    lineHeight: 16,
    maxWidth: '100%',
  },
  areaField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  areaFieldText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  areaTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaPage: {
    paddingHorizontal: 20,
  },
  areaBack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 48,
  },
  areaBackText: {
    fontSize: 14,
    lineHeight: 20,
  },
  areaSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    marginBottom: 8,
    paddingLeft: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  areaSearchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 15,
    paddingVertical: 0,
  },
  areaSearchClear: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaList: {
    maxHeight: 340,
  },
  areaRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  areaRowText: {
    flex: 1,
    minWidth: 0,
  },
  areaRowTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  areaRowSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  areaNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  areaNoteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  areaEmpty: {
    paddingVertical: 20,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reset: {
    minWidth: 96,
  },
  apply: {
    flex: 1,
  },
})
