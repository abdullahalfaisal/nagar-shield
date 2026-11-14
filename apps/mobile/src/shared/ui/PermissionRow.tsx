import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Button } from './Button'
import { recoverPermission } from '../services/permissionRecovery'
import type { PermissionName, PermissionState } from '../services/permissions'

/**
 * One permission row in the Settings screen.
 *
 * The row says three things and never a fourth:
 *
 *   1. **which** permission it is;
 *   2. **what it would unlock** — so the citizen can decide whether the
 *      trade is worth it;
 *   3. **what the button will actually do** — "Ask again" re-triggers the
 *      system prompt, "Open system settings" opens the OS page.
 *
 * The third one is the important one. A button labelled "Ask again" that
 * opens a settings page teaches citizens not to believe the app, so the
 * label always matches the action.
 */
interface PermissionRowProps {
  name: PermissionName
  state: PermissionState
  /** What the permission would unlock. */
  unlocks: string
  /** Called after a prompt-based recovery, so the list can re-read. */
  onChanged: () => void
}

export function PermissionRow({ name, state, unlocks, onChanged }: PermissionRowProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [working, setWorking] = useState(false)

  const denied = state === 'denied'
  const granted = state === 'granted'

  const onPress = async () => {
    if (working) return
    setWorking(true)

    try {
      await recoverPermission(name, state)

      // Both branches re-read the permission state.
      //
      // A `prompt` outcome knows the new state immediately — the user just
      // answered the dialog. A `settings` outcome does **not**: the OS page
      // was opened and the user has to flip the switch themselves, and the
      // app has no way of knowing whether they did. Re-reading is the honest
      // thing to do — it reports what the OS says, not what the app hopes.
      onChanged()
    } finally {
      setWorking(false)
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.ink[950] }]}>{titleFor(name, t)}</Text>
          <Text style={[styles.unlocks, { color: theme.colors.ink[500] }]}>{unlocks}</Text>
        </View>

        <View
          style={[
            styles.statePill,
            {
              backgroundColor: granted
                ? theme.palette.green[100]
                : denied
                  ? theme.palette.red[100]
                  : theme.colors.ink[100],
            },
          ]}
          accessibilityLabel={`${titleFor(name, t)}: ${stateLabel(state, t)}`}
        >
          <Text
            style={[
              styles.stateText,
              {
                color: granted
                  ? theme.palette.green[700]
                  : denied
                    ? theme.palette.red[600]
                    : theme.colors.ink[700],
              },
            ]}
          >
            {stateLabel(state, t)}
          </Text>
        </View>
      </View>

      {denied ? (
        <Text style={[styles.deniedBody, { color: theme.colors.ink[500] }]}>
          {t('permissions.deniedBody')}
        </Text>
      ) : null}

      {/*
        A granted permission needs no action, so no button is rendered. An
        undetermined one gets "Ask again" — the OS will still prompt. A
        denied one gets "Open system settings" — the OS will not prompt, and
        pretending otherwise would waste the citizen's time.
      */}
      {granted ? null : (
        <Button
          label={denied ? t('permissions.openSettings') : t('permissions.request')}
          icon={denied ? 'settings' : 'refresh'}
          variant="secondary"
          size="md"
          disabled={working}
          onPress={() => void onPress()}
        />
      )}
    </View>
  )
}

/** The permission's name, in the user's language. */
function titleFor(name: PermissionName, t: (key: string) => string): string {
  switch (name) {
    case 'camera':
      return t('permissions.camera')
    case 'microphone':
      return t('permissions.microphone')
    case 'mediaLibrary':
      return t('permissions.mediaLibrary')
    case 'location':
      return t('permissions.location')
  }
}

/** The permission's state, in the user's language. */
function stateLabel(state: PermissionState, t: (key: string) => string): string {
  switch (state) {
    case 'granted':
      return t('permissions.granted')
    case 'denied':
      return t('permissions.denied')
    case 'undetermined':
      return t('permissions.notDetermined')
  }
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  unlocks: {
    fontSize: 11,
    marginTop: 2,
  },
  statePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deniedBody: {
    fontSize: 12,
    lineHeight: 17,
  },
})
