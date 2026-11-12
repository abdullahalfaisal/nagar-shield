import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppError } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { Button, InputField, Toggle } from '@/shared/ui';
import { Icon } from '@/shared/ui/Icon';
import { logIn } from '@/shared/auth/authService';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * Screen 11 — Login.
 *
 * The prototype's login is a phone/email + OTP flow with a simulated
 * `display:block` toggle. The build replaces that with the **real**
 * email-primary Supabase password flow (waiver W-1), keeping the prototype's
 * layout, brand block, hero, input styling and the "no account" footer.
 *
 * The password input and the Remember-me switch are additions that use the
 * prototype's own input and toggle styles.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    setSubmitting(true);
    setFormError(undefined);
    setErrors({});
    try {
      await logIn({ identifier, password, rememberMe });
      router.replace('/(app)/home');
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error);
      setErrors({
        password: t(`errors.${appError.code.toLowerCase()}`),
      });
      setFormError(t(`errors.${appError.code.toLowerCase()}`));
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <View
            style={[
              styles.brandLogo,
              {
                shadowColor: '#7C3AED',
                shadowOpacity: 0.32,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 12 },
                elevation: 8,
              },
            ]}
          >
            <Icon name="shield" size={44} color="#FFFFFF" filled />
          </View>
          <Text style={[styles.brandName, { color: theme.colors.ink[950] }]}>
            {t('common.appName')}
          </Text>
          <Text style={[styles.brandTag, { color: theme.colors.ink[500] }]}>শহরে, সদা সতর্ক</Text>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: theme.colors.ink[950] }]}>
            {t('auth.loginTitle')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.ink[600] }]}>
            {t('auth.loginSubtitle')}
          </Text>
        </View>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        <InputField
          label={t('auth.identifierLabel')}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={t('auth.phonePlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          icon="mail"
          helper={t('auth.loginSubtitle')}
          testID="login-identifier"
        />

        <InputField
          label={t('auth.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          icon="lock"
          error={errors.password}
          onSubmitEditing={onSubmit}
          returnKeyType="go"
          testID="login-password"
        />

        <View style={styles.rememberRow}>
          <Toggle
            value={rememberMe}
            onValueChange={setRememberMe}
            accessibilityLabel={t('auth.rememberMe')}
          />
          <Text style={[styles.rememberLabel, { color: theme.colors.ink[600] }]}>
            {t('auth.rememberMe')}
          </Text>
        </View>

        <Text
          accessibilityRole="button"
          onPress={() => router.push('/(auth)/forgot-password')}
          style={[styles.forgotLink, { color: theme.palette.violet[700] }]}
        >
          {t('auth.forgotPassword')}
        </Text>

        <Button
          label={submitting ? t('capture.submitting') : t('auth.signIn')}
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onPress={onSubmit}
          style={styles.cta}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: theme.colors.ink[600] }]}>{t('auth.noAccount')}</Text>
          <Text
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/register')}
            style={[styles.link, { color: theme.palette.violet[500] }]}
          >
            {t('auth.createAccount')}
          </Text>
        </View>
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
    paddingTop: 40,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandLogo: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandTag: {
    fontSize: 12,
    marginTop: 4,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  rememberLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 8,
  },
  cta: {
    marginTop: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
});
