import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/shared/theme';
import { Button, EscapeLink, Icon, WizardScreen } from '@/shared/ui';

/**
 * Screen 8 — S-05 Location.
 *
 * The just-in-time permission surface (FR-PERMS-1).
 *
 * The permission is requested **when the user asks for it**, not when this
 * screen mounts. A permission prompt that appears the moment a screen opens
 * teaches the user to dismiss prompts without reading them, and the
 * prototype's screen order puts this step *after* the account exists — so a
 * prompt here is a prompt about an app they have already signed up for.
 *
 * "Continue without location" is a first-class path, not an error state. The
 * profile completes with no location, the app still functions, and the
 * permission can be granted later from Settings.
 */
export default function LocationPermissionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [requesting, setRequesting] = useState(false);

  const onAllow = useCallback(async () => {
    setRequesting(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // A permission request that fails outright is treated as a denial. The
      // user is not blocked and the wizard continues.
    }
    setRequesting(false);
    router.replace('/(app)/home');
  }, [router]);

  const onSkip = useCallback(() => {
    router.replace('/(app)/home');
  }, [router]);

  return (
    <WizardScreen
      step={4}
      totalSteps={4}
      eyebrow={t('wizardLocation.eyebrow')}
      title={
        <>
          {t('wizardLocation.title')} <Text style={{ color: theme.palette.violet[700] }}>
            {t('wizardLocation.highlight')}
          </Text>
        </>
      }
      subtitle={t('wizardLocation.subtitle')}
      footer={
        <>
          <Button
            label={requesting ? t('capture.submitting') : t('wizardLocation.allowCta')}
            variant="primary"
            size="lg"
            disabled={requesting}
            onPress={onAllow}
          />
          <EscapeLink label={t('wizardLocation.skipCta')} onPress={onSkip} />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      {/* `.location-illustration` — the violet gradient panel with the pin. */}
      <View
        style={[
          styles.illustration,
          {
            borderColor: theme.colors.ink[200],
            backgroundColor: theme.palette.violet[50],
          },
        ]}
      >
        <View
          style={[styles.ring, styles.ringLarge, { borderColor: theme.palette.violet[300] }]}
        />
        <View
          style={[styles.ring, styles.ringSmall, { borderColor: theme.palette.violet[300] }]}
        />
        <LinearGradient
          colors={theme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pin}
        >
          <Icon name="my_location" size={32} color="#FFFFFF" filled />
        </LinearGradient>
      </View>

      {/* `.location-reassure` — the lock panel. */}
      <View
        style={[
          styles.reassure,
          { backgroundColor: theme.palette.violet[50], borderColor: theme.palette.violet[200] },
        ]}
      >
        <Icon name="lock" size={16} color={theme.palette.violet[700]} filled />
        <Text style={[styles.reassureText, { color: theme.colors.ink[700] }]}>
          <Text style={{ fontWeight: '700' }}>{t('wizardLocation.reassureTitle')}</Text>{' '}
          {t('wizardLocation.reassureBody')}
        </Text>
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  illustration: {
    marginTop: 12,
    height: 160,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.6,
  },
  ringSmall: {
    width: 120,
    height: 120,
  },
  ringLarge: {
    width: 200,
    height: 200,
  },
  pin: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reassure: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  reassureText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
