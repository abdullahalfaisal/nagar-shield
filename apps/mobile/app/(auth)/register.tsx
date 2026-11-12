import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppError, phoneSchema } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui';
import { signUp } from '@/shared/auth/authService';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * Screen 12 — Registration.
 *
 * MVP Phase 1 is email-primary (waiver W-1): the account is created with the
 * email + password and the phone is stored on `profiles`.
 *
 * The prototype's "SMS-এও OTP পাঠান" checkbox is **hidden** while the SMS
 * flag is off — the copy claims SMS delivery, and the checkbox would be a
 * promise the build cannot keep.
 */
export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    phone?: string;
    email?: string;
    password?: string;
    alternatePhone?: string;
  }>();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState(params.password ?? '');
  const [phone, setPhone] = useState(params.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // The phone is checked with the shared schema, not a length test: the
  // schema normalises the number to E.164 and refuses anything that is not a
  // valid Bangladesh number. A length check would let `1234567890` through to
  // the server, which would reject it with a less useful message.
  const isPhoneValid = phoneSchema.safeParse(phone).success;

  const canSubmit =
    email.includes('@') && password.length >= 8 && isPhoneValid && !submitting;

  const onSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!email.includes('@')) nextErrors.email = t('errors.validationFailed');
    if (password.length < 8) nextErrors.password = t('errors.validationFailed');
    if (!isPhoneValid) nextErrors.phone = t('errors.validationFailed');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);
    try {
      await signUp({ email, password, phone, fullName: fullName || undefined });
      router.replace('/(app)/home');
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error);
      setFormError(t(`errors.${appError.code.toLowerCase()}`));
      setSubmitting(false);
    }
  };

  return (
    <WizardScreen
      step={3}
      totalSteps={4}
      eyebrow={t('auth.registerTitle')}
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          <Button
            label={submitting ? t('capture.submitting') : t('auth.registerCta')}
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            onPress={onSubmit}
          />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      {formError ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
          <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
        </View>
      ) : null}

      <InputField
        label={t('auth.fullNameLabel')}
        value={fullName}
        onChangeText={setFullName}
        placeholder={t('auth.fullNameLabel')}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        icon="person"
        testID="reg-name"
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
        testID="reg-email"
      />
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
        testID="reg-phone"
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
        helper={t('auth.newPasswordSubtitle')}
        testID="reg-password"
      />
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
});
