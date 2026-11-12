import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/theme';
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui';
import { Icon } from '@/shared/ui/Icon';

/**
 * Screen 3 — S-02 Alternate Phone.
 *
 * Open decision Q-1: `profiles.alternate_phone` is **not** a locked column in
 * the confirmed schema. This step collects the value and keeps it in local
 * state; the value is written only once the column question is resolved.
 * The layout, label, helper copy and "must be different" validation are
 * ported 1:1 from the prototype.
 */
export default function AlternatePhoneScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ phone?: string }>();

  const [alternatePhone, setAlternatePhone] = useState('');
  const [error, setError] = useState<string | undefined>();

  const onContinue = () => {
    const primary = params.phone ?? '';
    if (alternatePhone.trim() && alternatePhone.trim() === primary.trim()) {
      setError(t('errors.validationFailed'));
      return;
    }
    setError(undefined);
    router.push({
      pathname: '/(auth)/register',
      params: { phone: primary, alternatePhone },
    });
  };

  return (
    <WizardScreen
      step={2}
      totalSteps={4}
      eyebrow={t('auth.alternatePhoneTitle')}
      title={t('auth.alternatePhoneTitle')}
      subtitle={t('auth.alternatePhoneSubtitle')}
      footer={
        <>
          <Button
            label={t('common.continue')}
            variant="primary"
            size="lg"
            onPress={onContinue}
          />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      <InputField
        label={t('auth.phoneLabel')}
        value={alternatePhone}
        onChangeText={setAlternatePhone}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        icon="phone"
        error={error ?? (alternatePhone ? t('errors.validationFailed') : undefined)}
        helper={t('auth.alternatePhoneSubtitle')}
        testID="wiz-phone-2"
      />

      <View style={styles.noteRow}>
        <Icon name="info" size={16} color={theme.palette.violet[600]} />
        <Text style={[styles.noteText, { color: theme.colors.ink[500] }]}>
          {t('auth.alternatePhoneSubtitle')}
        </Text>
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
  },
  noteText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});
