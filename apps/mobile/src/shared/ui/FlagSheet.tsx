import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FLAG_REASONS, type FlagReason } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { BottomSheet, Button, RadioGroup, useToast } from '@/shared/ui'
import { useFlagReport } from '@/shared/api/flags'

/**
 * The flag bottom sheet — the prototype's `#flag-dialog`.
 *
 * This is the **only** flagging surface: the feed card and the alert-detail
 * screen both open this component, so the two can never drift (US-ALERTS-06).
 *
 * The server owns the thresholds — the 3-flag auto-hide, the 10/hour rate
 * limit and the duplicate rejection. The client only maps the outcome to a
 * message; it never counts flags itself.
 */

export interface FlagSheetProps {
  visible: boolean
  /** The report being flagged. */
  reportId: string
  onClose: () => void
  /** Called after a successful flag. */
  onFlagged?: (outcome: { reportHidden: boolean }) => void
}

/** The flag reason options, in the prototype's order. */
const FLAG_REASON_IDS = FLAG_REASONS

export function FlagSheet({ visible, reportId, onClose, onFlagged }: FlagSheetProps) {
  const theme = useTheme()
  const { t } = useTranslation()

  const [reason, setReason] = useState<FlagReason | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const mutation = useFlagReport()
  const toast = useToast()
  const { reset: resetMutation } = mutation

  // A parent can close the sheet without going through `close` (a hardware
  // back press, or the alert-detail screen's own handler). Reset on every
  // close, so reopening never shows the previous "sent" text or reason.
  useEffect(() => {
    if (visible) return
    setReason(null)
    setMessage(null)
    resetMutation()
  }, [visible, resetMutation])

  // `off_topic` → `flagReasonOffTopic`: the id's snake case becomes the key's
  // camel case. Capitalising only the first letter printed the raw key
  // `alerts.flagReasonOff_topic` on screen.
  const options = FLAG_REASON_IDS.map((id) => ({
    id,
    label: t(
      `alerts.flagReason${id
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')}`,
    ),
  }))

  const close = useCallback(() => {
    setReason(null)
    setMessage(null)
    resetMutation()
    onClose()
  }, [resetMutation, onClose])

  const submit = useCallback(async () => {
    if (!reason) return

    try {
      const outcome = await mutation.mutateAsync({ reportId, reason })

      switch (outcome.status) {
        case 'ok':
          // Confirm with a toast and close from here: the sheet is not the
          // place to leave a "sent" line with Submit still live.
          toast.show({ message: t('alerts.flagSuccess'), tone: 'success' })
          onFlagged?.({ reportHidden: outcome.reportHidden })
          close()
          break
        case 'duplicate':
          setMessage(t('alerts.flagAlreadyReported'))
          break
        case 'own_report':
          setMessage(t('alerts.flagOwnReport'))
          break
        case 'rate_limited':
          setMessage(
            t('alerts.flagRateLimited', {
              minutes: Math.max(1, Math.round(outcome.retryAfterSec / 60)),
            }),
          )
          break
      }
    } catch {
      setMessage(t('errors.internal'))
    }
  }, [close, mutation, onFlagged, reason, reportId, t, toast])

  return (
    <BottomSheet
      visible={visible}
      title={t('alerts.flagTitle')}
      helper={t('alerts.flagHelper')}
      onClose={close}
    >
      <View style={styles.body}>
        <RadioGroup
          options={options}
          selectedId={reason}
          onSelect={(id) => {
            setReason(id as FlagReason)
            setMessage(null)
          }}
        />

        {message ? (
          <Text style={[styles.message, { color: theme.palette.violet[700] }]}>{message}</Text>
        ) : null}

        <Button
          label={t('alerts.flagSubmit')}
          variant="primary"
          disabled={!reason || mutation.isPending}
          onPress={() => void submit()}
          style={styles.submit}
        />

        <Button label={t('common.cancel')} variant="ghost" onPress={close} style={styles.cancel} />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 8,
  },
  message: {
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 10,
    textAlign: 'center',
  },
  submit: {
    marginTop: 8,
  },
  cancel: {
    marginTop: 0,
  },
})
