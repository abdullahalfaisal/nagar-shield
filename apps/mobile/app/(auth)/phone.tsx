import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { phoneSchema } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui';
import { Icon } from '@/shared/ui/Icon';

/**
 * Screen 2 — S-01 Own Phone.
 *
 * The prototype collects a phone number and advances to the alternate-phone
 * step. Because MVP Phase 1 is email-primary (waiver W-1), this screen also
 * collects the email and password that the Auth user is actually created
 * with. The phone stays a required unique profile attribute.
 *
 * Open decision Q-1: `profiles.alternate_phone` has no locked column in the
 * confirmed schema — the alternate-phone step stores nothing until that is
 * resolved.
 */
export default function PhoneScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The phone is checked with the shared schema, not a length test: the schema
  // normalises the number to E.164 and refuses anything that is not a valid
  // Bangladesh number.
  const isPhoneValid = phoneSchema.safeParse(phone).success;

  const canContinue = isPhoneValid && email.includes('@') && password.length >= 8;

  const onContinue = () => {
    const nextErrors: Record<string, string> = {};
    if (!isPhoneValid) nextErrors.phone = t('errors.validationFailed');
    if (!email.includes('@')) nextErrors.email = t('errors.validationFailed');
    if (password.length < 8) nextErrors.password = t('errors.validationFailed');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    router.push({
      pathname: '/(auth)/register',
      params: { phone, email, password },
    });
  };

  return (
    <WizardScreen
      step={1}
      totalSteps={4}
      eyebrow={t('auth.phoneTitle')}
      title={
        <>
          {t('auth.phoneLabel')} <Text style={{ color: theme.palette.violet[700] }}>·</Text>{' '}
          {t('auth.emailLabel')}
        </>
      }
      subtitle={t('auth.phoneSubtitle')}
      footer={
        <>
          <Button
            label={t('common.continue')}
            variant="primary"
            size="lg"
            disabled={!canContinue}
            onPress={onContinue}
          />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      <InputField
        label={t('auth.phoneLabel')}
        value={phone}
        onChangeText={setPhone}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        icon="phone"
        error={errors.phone}
        testID="wiz-phone-1"
      />
      <InputField
        label={t('auth.emailLabel')}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        icon="mail"
        error={errors.email}
        testID="wiz-email-1"
      />
      <InputField
        label={t('auth.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="password-new"
        icon="lock"
        error={errors.password}
        testID="wiz-password-1"
      />

      <View style={styles.lockRow}>
        <Icon name="lock" size={16} color={theme.palette.violet[600]} />
        <Text style={[styles.lockText, { color: theme.colors.ink[500] }]}>
          {t('auth.welcomeSubtitle')}
        </Text>
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  lockText: {
    fontSize: 12,
    flex: 1,
  },
});
