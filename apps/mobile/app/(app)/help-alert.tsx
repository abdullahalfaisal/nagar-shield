import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/theme';
import { Icon } from '@/shared/ui/Icon';
import { openDialer } from '@/shared/services/dialer';
import { useContacts } from '@/shared/api/contacts';
import { toBengaliDigits } from '@/shared/utils/relativeTime';

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
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: contacts } = useContacts();
  const contactCount = useMemo(() => contacts?.length ?? 0, [contacts]);

  const dial = async (number: string) => {
    await openDialer(number);
  };

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
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <HelpTile
          variant="police"
          title={t('help.police')}
          subtitle={t('help.policeSub')}
          english="Police"
          number="999"
          onPress={() => dial('999')}
        />
        <HelpTile
          variant="medical"
          title={t('help.medical')}
          subtitle={t('help.medicalSub')}
          english="Medical"
          number="999"
          onPress={() => dial('999')}
        />
        <HelpTile
          variant="fire"
          title={t('help.fire')}
          subtitle={t('help.fireSub')}
          english="Fire Service"
          number="102"
          onPress={() => dial('102')}
        />
        <HelpTile
          variant="personal"
          title={t('help.personalContacts')}
          subtitle={t('help.personalSub')}
          english="Personal Contacts"
          number={`${toBengaliDigits(String(contactCount))} জন`}
          onPress={() => router.push('/(app)/contacts')}
        />

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

      {/* The More Help bottom sheet. */}
      {sheetOpen ? (
        <View style={styles.sheetScrim}>
          <Pressable
            accessibilityLabel={t('common.close')}
            style={styles.sheetDismissArea}
            onPress={() => setSheetOpen(false)}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface.white,
                paddingBottom: 20 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.ink[200] }]} />
            <Text style={[styles.sheetTitle, { color: theme.colors.ink[950] }]}>
              {t('help.moreHelpTitle')}
            </Text>

            <View style={styles.sheetRows}>
              <SheetRow title={t('help.womenChildren')} number="109" onPress={() => dial('109')} />
              <SheetRow title={t('help.disaster')} number="333" onPress={() => dial('333')} />
              <SheetRow title={t('help.ambulance')} number="999" onPress={() => dial('999')} />
              <SheetRow title={t('help.electricity')} number="16116" onPress={() => dial('16116')} />
              <SheetRow
                title={t('help.nearestStation')}
                subtitle={t('help.nearestStationSub')}
                note={t('help.stationFallbackNote')}
                onPress={() => router.push('/(app)/station-map')}
              />
              <SheetRow
                title={t('help.stationMap')}
                subtitle={t('help.stationMapSub')}
                icon="map"
                onPress={() => router.push('/(app)/station-map')}
              />
            </View>

            <Text
              accessibilityRole="button"
              onPress={() => router.push('/(app)/more-help')}
              style={[styles.wrongNumber, { color: theme.palette.violet[700] }]}
            >
              {t('help.wrongNumber')}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setSheetOpen(false)}
              style={[styles.sheetClose, { backgroundColor: theme.palette.violet[50] }]}
            >
              <Text style={[styles.sheetCloseText, { color: theme.palette.violet[700] }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

type TileVariant = 'police' | 'medical' | 'fire' | 'personal';

function HelpTile({
  variant,
  title,
  subtitle,
  english,
  number,
  onPress,
}: {
  variant: TileVariant;
  title: string;
  subtitle: string;
  english: string;
  number: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  const gradients: Record<TileVariant, readonly [string, string, ...string[]]> = {
    police: theme.gradients.hero,
    medical: theme.gradients.emergency,
    fire: theme.gradients.amber,
    personal: theme.gradients.green,
  };

  const icons: Record<TileVariant, string> = {
    police: 'local_police',
    medical: 'local_hospital',
    fire: 'local_fire_department',
    personal: 'groups_2',
  };

  const shadowColor =
    variant === 'police'
      ? '#7C3AED'
      : variant === 'medical'
        ? '#DC2626'
        : variant === 'fire'
          ? '#D97706'
          : '#059669';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} ${english} ${number}`}
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
          <Text style={styles.helpCardEn} numberOfLines={1}>
            {english}
          </Text>
        </View>
        <View style={styles.helpCardRight}>
          <Text style={styles.helpCardPhone}>{number}</Text>
          <View style={styles.helpCardCircle}>
            <Icon name="call" size={18} color="#FFFFFF" filled />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function SheetRow({
  title,
  subtitle,
  number,
  note,
  icon = 'call',
  onPress,
}: {
  title: string;
  subtitle?: string;
  number?: string;
  note?: string;
  icon?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${number ? ` ${number}` : ''}`}
      onPress={onPress}
      style={[styles.sheetRow, { backgroundColor: theme.colors.ink[50] }]}
    >
      <View style={styles.sheetRowText}>
        <Text style={[styles.sheetRowTitle, { color: theme.colors.ink[950] }]}>{title}</Text>
        {number ? (
          <Text style={[styles.sheetRowNumber, { color: theme.colors.ink[500] }]}>{number}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.sheetRowNumber, { color: theme.colors.ink[500] }]}>{subtitle}</Text>
        ) : null}
        {note ? (
          <Text style={[styles.sheetRowNote, { color: theme.colors.ink[400] }]}>{note}</Text>
        ) : null}
      </View>
      <Icon name={icon} size={20} color={theme.palette.violet[700]} />
    </Pressable>
  );
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
    width: 40,
    height: 40,
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
    height: 80,
    borderRadius: 22,
    overflow: 'hidden',
  },
  helpCardFill: {
    flex: 1,
    paddingHorizontal: 20,
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
  helpCardEn: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
    marginTop: 2,
  },
  helpCardRight: {
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
  sheetScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetDismissArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  sheetRows: {
    gap: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  sheetRowText: {
    flex: 1,
  },
  sheetRowTitle: {
    fontWeight: '600',
    fontSize: 14,
  },
  sheetRowNumber: {
    fontSize: 11,
    marginTop: 2,
  },
  sheetRowNote: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 14,
  },
  wrongNumber: {
    marginTop: 14,
    paddingHorizontal: 4,
    fontSize: 11,
    textAlign: 'right',
    fontWeight: '600',
  },
  sheetClose: {
    marginTop: 16,
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
