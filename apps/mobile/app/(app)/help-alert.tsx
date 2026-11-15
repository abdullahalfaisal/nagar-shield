import { useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Icon } from '@/shared/ui/Icon'
import { ManualDialGuidance } from '@/shared/ui/ManualDialGuidance'
import { MoreHelpSheet } from '@/shared/ui/MoreHelpSheet'
import { useDegradedHelp } from '@/shared/services/useDegradedHelp'
import { useContacts } from '@/shared/api/contacts'
import { toBengaliDigits } from '@/shared/utils/relativeTime'
import { haptic } from '@/shared/services/haptics'

/**
 * Screen 18 — Help Alert.
 *
 * A 1:1 port of the prototype's Help Alert surface:
 *   - the red `.help-header` with the emergency icon
 *   - four `.help-card` tiles (Police, Medical, Fire Service, Personal)
 *   - the dashed "More Help" card
 *   - the More Help bottom sheet with six rows
 *   - the wrong-number link and the close button
 *
 * **Locked numbers (PRD fact A-7):** Police = 999, Medical = 999,
 * Fire = **102**. Fire is not 999 and not 16123.
 *
 * The dial path is **client-only** — `openDialer` hands the number to the OS.
 * The app never places a call and never observes call state (C-1).
 */
export default function HelpAlertScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  // A number on a tile reads in the tile's language; the dialler gets ASCII.
  const digits = (value: string) => (i18n.language === 'bn' ? toBengaliDigits(value) : value)
  const insets = useSafeAreaInsets()

  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: contacts } = useContacts()
  // Until the list has loaded (or when it failed) there is no count to show:
  // "0 saved" would tell someone with saved contacts that they have none.
  const contactCount = contacts ? contacts.length : null

  // The degraded-mode flow. The dial path is client-only — the number is
  // bundled and the intent goes straight to the OS — so a phone with no
  // signal, no location, and battery saver on still reaches help.
  const degradedHelp = useDegradedHelp()

  // The guidance renders below the tiles, which on a short screen is off
  // screen. Its position is kept so a failed dial scrolls it into view.
  const scrollRef = useRef<ScrollViewInstance>(null)
  const guidanceY = useRef(0)
  const revealGuidance = () => scrollRef.current?.scrollTo({ y: guidanceY.current, animated: true })

  const dial = async (number: string) => {
    haptic('tap')
    await degradedHelp.dial(number)
    // A second failed dial does not re-lay-out the guidance, so `onLayout`
    // alone would not bring it back after the user scrolled away.
    requestAnimationFrame(revealGuidance)
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      {/* `.help-header` */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.appBarBg,
            borderBottomColor: theme.colors.ink[100],
            paddingTop: 16 + insets.top,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="arrow_back" size={22} color={theme.palette.violet[700]} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Icon name="emergency" size={22} color={theme.palette.red[600]} />
            <Text style={[styles.headerTitle, { color: theme.palette.red[600] }]}>
              {t('help.police')} · {t('home.helpTitle')}
            </Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.colors.ink[500] }]}>
            {t('home.helpSubtitle')}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <HelpTile
          variant="police"
          title={t('help.police')}
          subtitle={t('help.policeSub')}
          number={digits('999')}
          onPress={() => dial('999')}
        />
        <HelpTile
          variant="medical"
          title={t('help.medical')}
          subtitle={t('help.medicalSub')}
          number={digits('999')}
          onPress={() => dial('999')}
        />
        <HelpTile
          variant="fire"
          title={t('help.fire')}
          subtitle={t('help.fireSub')}
          number={digits('102')}
          onPress={() => dial('102')}
        />
        <HelpTile
          variant="personal"
          title={t('help.personalContacts')}
          subtitle={t('help.personalSub')}
          number={contactCount === null ? null : t('help.peopleCount', { count: contactCount })}
          onPress={() => router.push('/(app)/contacts')}
        />

        {/* The manual-dial guidance. It renders after the tiles, so the
            number on the tile the user tapped and the guidance about it
            appear together. */}
        {degradedHelp.showGuidance && degradedHelp.guidanceNumber ? (
          <View
            onLayout={(event) => {
              guidanceY.current = event.nativeEvent.layout.y
              revealGuidance()
            }}
          >
            <ManualDialGuidance
              number={degradedHelp.guidanceNumber}
              showPowerSaveWarning={degradedHelp.showPowerSaveWarning}
              showOfflineNotice={degradedHelp.showOfflineNotice}
            />
          </View>
        ) : null}

        {/* The dashed "More Help" card. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('help.moreHelp')}
          onPress={() => setSheetOpen(true)}
          style={[
            styles.moreHelpCard,
            {
              backgroundColor: theme.colors.surface.white,
              borderColor: theme.colors.ink[300],
            },
          ]}
        >
          <View style={[styles.moreHelpIcon, { backgroundColor: theme.colors.ink[100] }]}>
            <Icon name="more_horiz" size={24} color={theme.colors.ink[700]} />
          </View>
          <View style={styles.moreHelpText}>
            <Text style={[styles.moreHelpTitle, { color: theme.colors.ink[950] }]}>
              {t('help.moreHelp')}
            </Text>
            <Text style={[styles.moreHelpSub, { color: theme.colors.ink[500] }]}>
              {t('help.moreHelpSub')}
            </Text>
          </View>
          <Icon name="chevron_right" size={20} color={theme.colors.ink[400]} />
        </Pressable>

        <Text style={[styles.footnote, { color: theme.colors.ink[500] }]}>
          {t('help.routingNote')}
        </Text>
      </ScrollView>

      {/* The More Help bottom sheet. The sheet is a **shared** component, so
          the Home entry point and this one show the identical rows in the
          identical order — the story requires both entry points to show the
          same sheet. */}
      <MoreHelpSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  )
}

type TileVariant = 'police' | 'medical' | 'fire' | 'personal'

function HelpTile({
  variant,
  title,
  subtitle,
  number,
  onPress,
}: {
  variant: TileVariant
  title: string
  subtitle: string
  /** Absent while a count is unknown (loading, or the load failed). */
  number: string | null
  onPress: () => void
}) {
  const theme = useTheme()

  const gradients: Record<TileVariant, readonly [string, string, ...string[]]> = {
    police: theme.gradients.hero,
    medical: theme.gradients.emergency,
    fire: theme.gradients.amber,
    personal: theme.gradients.green,
  }

  const icons: Record<TileVariant, string> = {
    police: 'local_police',
    medical: 'local_hospital',
    fire: 'local_fire_department',
    personal: 'groups_2',
  }

  const shadowColor =
    variant === 'police'
      ? '#7C3AED'
      : variant === 'medical'
        ? '#DC2626'
        : variant === 'fire'
          ? '#D97706'
          : '#059669'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={number ? `${title} ${number}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.helpCard,
        {
          shadowColor,
          shadowOpacity: 0.3,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 12 },
          elevation: 8,
          transform: [{ translateY: pressed ? -2 : 0 }],
        },
      ]}
    >
      <LinearGradient
        colors={[...gradients[variant]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.helpCardFill}
      >
        <View style={styles.helpCardIcon}>
          <Icon name={icons[variant]} size={28} color="#FFFFFF" filled />
        </View>
        <View style={styles.helpCardContent}>
          <Text style={styles.helpCardTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.helpCardSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.helpCardRight}>
          {number ? (
            <Text style={styles.helpCardPhone} numberOfLines={1}>
              {number}
            </Text>
          ) : null}
          <View style={styles.helpCardCircle}>
            <Icon name="call" size={18} color="#FFFFFF" filled />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.01,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  helpCard: {
    marginHorizontal: 20,
    marginVertical: 12,
    minHeight: 80,
    borderRadius: 22,
    overflow: 'hidden',
  },
  helpCardFill: {
    flexGrow: 1,
    minHeight: 80,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  helpCardIcon: {
    width: 56,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCardContent: {
    flex: 1,
    minWidth: 0,
  },
  helpCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  helpCardSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  helpCardRight: {
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
  },
  helpCardPhone: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  helpCardCircle: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreHelpCard: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  moreHelpIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreHelpText: {
    flex: 1,
  },
  moreHelpTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  moreHelpSub: {
    fontSize: 12,
    marginTop: 2,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
})
