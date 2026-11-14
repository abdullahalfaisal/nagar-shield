import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Icon } from './Icon'
import { Button } from './Button'
import { RadioGroup } from './RadioGroup'
import { useReportWrongNumber, type WrongNumberEntryType } from '@/shared/api/wrongNumber'

/**
 * The wrong-number report sheet.
 *
 * `003-help-seek / 008-wrong-number-report` — the prototype's
 * `#wrong-number-dialog`.
 *
 * Three things this sheet is careful about:
 *
 *   * **The report references the entry; it never edits it.** The curated
 *     number is not changed by a report. The dataset is refreshed quarterly
 *     by the curator, and a report is a *signal* for that refresh — so the
 *     sheet never claims a number was corrected.
 *   * **The toast says "sent", not "fixed".** C-6 forbids a dispatch or
 *     verification claim, and so does the story: the curator's decision lands
 *     in the next quarterly release.
 *   * **No moderator, curator or approval role stands in the way.** FR-SEEK-6
 *     says *any user* may report. A signed-out visitor files the row with a
 *     null reporter; the curator still triages it.
 */
interface WrongNumberSheetProps {
  visible: boolean
  onClose: () => void
  /** The entry the report is about. Omitted means the general report form. */
  entryType?: WrongNumberEntryType
  entryId?: string
  /** The entry's name, shown so the user knows what they are reporting. */
  entryName?: string
}

export function WrongNumberSheet({
  visible,
  onClose,
  entryType = 'hotline',
  entryId = '',
  entryName,
}: WrongNumberSheetProps) {
  const theme = useTheme()
  const { t } = useTranslation()

  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const report = useReportWrongNumber()

  if (!visible) return null

  const reasons = [
    { id: 'not_connecting', label: t('help.wrongReasonNotConnecting') },
    { id: 'wrong_number', label: t('help.wrongReasonWrongNumber') },
    { id: 'other_service', label: t('help.wrongReasonOtherService') },
    { id: 'no_longer_active', label: t('help.wrongReasonNoLongerActive') },
    { id: 'other', label: t('help.wrongReasonOther') },
  ]

  const submit = async () => {
    if (!reason) {
      setError(t('help.wrongReasonRequired'))
      return
    }

    setError(null)

    try {
      await report.mutateAsync({
        entryType,
        entryId: entryId || 'general',
        // The reason and the free text are two fields, not one string — the
        // curator's read path needs to tell a fixed enum value from a
        // citizen's own words.
        reason,
        details: details.trim() || undefined,
      })
      setSent(true)
      setReason(null)
      setDetails('')
      report.reset()
      onClose()
    } catch {
      // The sheet stays open with the entered reason and details intact, and
      // no success toast is shown. A raw server error is never surfaced.
      setError(t('help.wrongReportFailed'))
    }
  }

  return (
    <View style={styles.scrim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        style={styles.dismissArea}
        onPress={onClose}
      />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface.white,
            paddingBottom: 20,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.colors.ink[200] }]} />

        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: theme.palette.amber[100] }]}>
            <Icon name="report" size={22} color={theme.palette.amber[600]} filled />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
              {t('help.wrongNumberTitle')}
            </Text>
            <Text style={[styles.helper, { color: theme.colors.ink[500] }]}>
              {entryName
                ? t('help.wrongReportForEntry', { name: entryName })
                : t('help.wrongNumberSubtitle')}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.colors.ink[700] }]}>
          {t('help.wrongReasonLabel')}
        </Text>
        <RadioGroup
          options={reasons}
          selectedId={reason}
          onSelect={(id) => {
            setReason(id)
            setError(null)
          }}
        />

        <Text style={[styles.label, { color: theme.colors.ink[700] }]}>
          {t('help.wrongDetailsLabel')}
        </Text>
        <TextInput
          accessibilityLabel={t('help.wrongDetailsLabel')}
          placeholder={t('help.wrongDetailsPlaceholder')}
          placeholderTextColor={theme.colors.ink[400]}
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={4}
          maxLength={500}
          style={[
            styles.textarea,
            {
              backgroundColor: theme.colors.surface.white,
              borderColor: error ? theme.palette.red[500] : theme.colors.ink[200],
              color: theme.colors.ink[950],
            },
          ]}
        />

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.palette.red[600] }]}>
            {error}
          </Text>
        ) : null}

        <Button
          label={report.isPending ? t('common.loading') : t('help.wrongReportSubmit')}
          onPress={submit}
          disabled={report.isPending}
          style={styles.submit}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={onClose}
          style={[styles.cancel, { borderColor: theme.colors.ink[200] }]}
        >
          <Text style={[styles.cancelText, { color: theme.colors.ink[600] }]}>
            {t('common.cancel')}
          </Text>
        </Pressable>

        {sent ? (
          <Text
            accessibilityRole="alert"
            style={[styles.sent, { color: theme.palette.green[700] }]}
          >
            {t('help.wrongReportSent')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  helper: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  textarea: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 12,
    marginTop: 8,
  },
  submit: {
    marginTop: 16,
  },
  cancel: {
    marginTop: 8,
    // The 48 dp tap target for the cancel button (FR-UX-4).
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  sent: {
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
})
