import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Icon } from './Icon'
import { manualDialGuidance } from '../services/degradation'

/**
 * The manual-dial guidance.
 *
 * Story `003-help-seek / 004-graceful-degradation`. This is the **one**
 * degraded-mode surface: the Police card, the Medical card, the Fire card,
 * the Personal Emergency picker, the hotline rows, the thana line, and the map
 * all render this same component, so the behaviour is consistent and testable
 * in one place.
 *
 * ## What this component is allowed to say
 *
 * The app **never** places, connects, or delivers a call. `openDialer` hands a
 * number to the OS dialler and the user presses call (constraint C-1, which
 * forbids call-state detection and call monitoring entirely). So this
 * component never claims a call was placed, connected, or delivered — the
 * copy below says only what is true: *this is the number, dial it yourself*.
 *
 * The same rule is why the battery-saver line says the dialer **may** be
 * suppressed rather than that it was. The app cannot know what the OEM
 * dialler did after the intent fired.
 */
interface ManualDialGuidanceProps {
  /** The number to dial. Rendered in both Bangla numerals and ASCII digits. */
  number: string
  /** Whether the power-saver warning should appear alongside the guidance. */
  showPowerSaveWarning?: boolean
  /** Whether the device is offline — the guidance then says so explicitly. */
  showOfflineNotice?: boolean
}

export function ManualDialGuidance({
  number,
  showPowerSaveWarning = false,
  showOfflineNotice = false,
}: ManualDialGuidanceProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const guidance = manualDialGuidance(number)

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={t('degradation.manualDialLabel', { number: guidance.combined })}
      style={[
        styles.root,
        {
          backgroundColor: theme.palette.amber[50],
          borderColor: theme.palette.amber[100],
        },
      ]}
    >
      <Icon name="phone_in_talk" size={20} color={theme.palette.amber[600]} filled />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('degradation.manualDialTitle')}
        </Text>

        {/* The number, in both scripts. The user reads it off the screen and
            dials it from the keypad. */}
        <Text style={[styles.number, { color: theme.palette.amber[600] }]}>
          {guidance.combined}
        </Text>

        <Text style={[styles.text, { color: theme.colors.ink[500] }]}>
          {t('degradation.manualDialBody')}
        </Text>

        {showPowerSaveWarning ? (
          <Text style={[styles.text, { color: theme.colors.ink[700] }]}>
            {t('degradation.batterySaverWarning')}
          </Text>
        ) : null}

        {showOfflineNotice ? (
          <Text style={[styles.text, { color: theme.colors.ink[700] }]}>
            {t('degradation.offlineNotice')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  number: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  text: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 17,
  },
})
