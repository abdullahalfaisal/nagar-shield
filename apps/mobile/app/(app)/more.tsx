import { Children, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Icon, ListRow, Screen } from '@/shared/ui'

/**
 * Screen 15 — More Options.
 *
 * A 1:1 port of the prototype's grouped list. Each group is a `.list-section`
 * card with a `.list-section-header` label; each row is a `.list-row`.
 *
 * The prototype's notification count (3) is a static demo value — the build
 * shows a real count when there is one, and omits the badge otherwise.
 */
export default function MoreOptionsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <Screen title={t('more.title')} onBack={() => router.back()} scroll>
      <ListSection header={t('more.servicesHeader')}>
        <ListRow
          icon="notifications"
          tone="red"
          title={t('settings.notifications')}
          subtitle={t('alerts.feedTitle')}
          onPress={() => router.push('/(app)/alerts')}
        />
        <ListRow
          icon="contact_page"
          tone="amber"
          title={t('more.emergencyContacts')}
          subtitle={t('more.emergencyContactsSub')}
          onPress={() => router.push('/(app)/contacts')}
        />
        <ListRow
          icon="emergency"
          tone="red"
          title={t('help.police')}
          subtitle={t('help.moreHelpSub')}
          onPress={() => router.push('/(app)/help-alert')}
        />
      </ListSection>

      <ListSection header={t('more.accountHeader')}>
        <ListRow
          icon="tune"
          tone="gray"
          title={t('more.settings')}
          subtitle={t('more.settingsSub')}
          onPress={() => router.push('/(app)/settings')}
        />
        <ListRow
          icon="monitoring"
          tone="purple"
          title={t('more.crimeHistory')}
          subtitle={t('more.crimeHistorySub')}
          onPress={() => router.push('/(app)/history')}
        />
      </ListSection>

      <Text
        accessibilityRole="button"
        onPress={() => router.push('/(app)/settings')}
        style={[
          styles.logoutRow,
          {
            backgroundColor: theme.palette.red[50],
            borderColor: theme.palette.red[100],
            color: theme.palette.red[600],
          },
        ]}
      >
        <Icon name="logout" size={20} color={theme.palette.red[600]} />
        {t('more.logout')}
      </Text>
    </Screen>
  )
}

/**
 * `.list-section` — a white card with a hairline border, an uppercase header
 * and the rows clipped to its rounded corners.
 */
export function ListSection({ header, children }: { header: string; children: ReactNode }) {
  const theme = useTheme()
  const rows = Children.toArray(children)

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
          shadowColor: '#0F172A',
          shadowOpacity: 0.04,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
      ]}
    >
      <Text style={[styles.sectionHeader, { color: theme.colors.ink[500] }]}>{header}</Text>
      {rows.map((row, index) => (
        <View
          key={index}
          style={
            index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.ink[100] } : undefined
          }
        >
          {row}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  logoutRow: {
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 32,
    padding: 16,
    textAlign: 'center',
    borderRadius: 18,
    borderWidth: 1,
    fontWeight: '600',
    fontSize: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
})
