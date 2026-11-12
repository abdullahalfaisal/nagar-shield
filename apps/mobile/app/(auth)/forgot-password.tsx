import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppError } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { Button, InputField } from '@/shared/ui';
import { requestPasswordReset, updatePassword } from '@/shared/auth/authService';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * Screen 13 — Forgot Password.
 *
 * Requests a password-reset email (email-primary, waiver W-1) and then lets
 * the user set a new password. The two steps live on one screen because the
 * reset link lands the user straight into the new-password field.
 *
 * **No account-existence oracle.** An unknown identifier and a registered one
 * produce the same screen and the same message — the identifier is resolved
 * server-side by `resolve_login_identifier`, which deliberately does not
 * distinguish the two cases.
 *
 * **The recovery session is the authority.** The emailed link opens the app
 * with a recovery token that Supabase exchanges for a session. The new
 * password is applied to **that** session, so the reset can only ever be
 * completed by someone who followed the emailed link.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [identifier, setIdentifier] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const onRequestCode = async () => {
    const nextErrors: Record<string, string> = {};
    if (identifier.trim().length === 0) nextErrors.identifier = t('errors.validationFailed');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);
    try {
      await requestPasswordReset(identifier);
      setStage('verify');
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error);
      setFormError(t(`errors.${appError.code.toLowerCase()}`));
    } finally {
      setSubmitting(false);
    }
  };

  const onResetPassword = async () => {
    const nextErrors: Record<string, string> = {};
    if (newPassword.length < 8) nextErrors.newPassword = t('errors.validationFailed');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);
    try {
      // The recovery link established the session; the new password is applied
      // to it. Without that session the update is rejected by the server.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setFormError(t('errors.authRequired'));
        setStage('request');
        return;
      }

      await updatePassword(newPassword);
      router.replace('/(auth)/login');
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error);
      setFormError(t(`errors.${appError.code.toLowerCase()}`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('auth.forgotTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {stage === 'request' ? t('auth.forgotSubtitle') : t('auth.newPasswordSubtitle')}
        </Text>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        {stage === 'request' ? (
          <>
            <InputField
              label={t('auth.identifierLabel')}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={t('auth.phonePlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              icon="mail"
              error={errors.identifier}
              testID="forgot-identifier"
            />
            <Button
              label={submitting ? t('capture.submitting') : t('auth.resetCta')}
              variant="primary"
              size="lg"
              disabled={identifier.trim().length === 0 || submitting}
              onPress={onRequestCode}
              style={styles.cta}
            />
          </>
        ) : (
          <>
            <InputField
              label={t('auth.newPasswordTitle')}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              icon="lock"
              error={errors.newPassword}
              testID="forgot-password"
            />
            <Button
              label={submitting ? t('capture.submitting') : t('common.save')}
              variant="primary"
              size="lg"
              disabled={newPassword.length < 8 || submitting}
              onPress={onResetPassword}
              style={styles.cta}
            />
            <Text
              accessibilityRole="button"
              onPress={onRequestCode}
              style={[styles.resend, { color: theme.palette.violet[700] }]}
            >
              {t('auth.resendOtp')}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 28,
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cta: {
    marginTop: 16,
  },
  resend: {
    alignSelf: 'center',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 12,
  },
});
