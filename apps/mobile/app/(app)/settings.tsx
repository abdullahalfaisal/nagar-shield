import { Children, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useThemeControls } from '@/shared/theme';
import { Button, Icon, ListRow, Screen, Toggle } from '@/shared/ui';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { setLocale } from '@/shared/i18n';
import { logOut } from '@/shared/auth/authService';
import { softDeleteAccount } from '@/shared/api/account';

/**
 * Screen 16 — Settings.
 *
 * A 1:1 port of the prototype's Settings screen, with two enforced deviations:
 *
 * 1. **The SMS-OTP row is hidden.** Waiver W-2 turns SMS delivery off for
 *    Phase 1. The prototype's row promises "OTP over SMS, carrier charges may
 *    apply" — rendering it would be a promise the build cannot keep.
 * 2. **The dark-mode toggle drives the real theme.** The prototype's toggle
 *    flips a `data-theme` attribute; here it drives the React Native theme
 *    provider, which is persisted.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { toggleTheme, setTheme } = useThemeControls();

  const [biometric, setBiometric] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const isBangla = i18n.language === 'bn';

  /**
   * Soft-deletes the account, then ends the local session.
   *
   * The delete is a **soft** delete: the row is kept for the 30-day recovery
   * window and the PII purge job removes it after that. The session is ended
   * locally — the server-side refresh token is not revoked, so signing back in
   * within the window restores the account.
   */
  const onConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await softDeleteAccount();
      await logOut();
      router.replace('/(auth)/welcome');
    } catch {
      setDeleteError(t('errors.internal'));
      setDeleting(false);
    }
  };

  return (
    <Screen title={t('settings.title')} onBack={() => router.back()} scroll>
      {/* `.profile-card` */}
      <View
        style={[
          styles.profileCard,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: theme.colors.ink[100],
          },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: theme.palette.violet[600] }]}>
          <Text style={styles.avatarText}>না</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.colors.ink[950] }]}>
            {t('auth.fullNameLabel')}
          </Text>
          <Text style={[styles.profileEmail, { color: theme.colors.ink[500] }]}>
            {t('auth.emailLabel')}
          </Text>
        </View>
        <Text style={[styles.profileEdit, { color: theme.palette.violet[700] }]}>
          {t('common.save')}
        </Text>
      </View>

      {/* Account */}
      <Section title={t('more.accountHeader')}>
        <ListRow icon="account_circle" tone="purple" title={t('settings.profileEdit')} />
        <ListRow
          icon="badge"
          tone="purple"
          title={t('settings.changeIdentity')}
          showArrow
        />
      </Section>

      {/* Preferences */}
      <Section title={t('settings.preferences')}>
        <ListRow
          icon="language"
          tone="green"
          title={t('settings.language')}
          badge={{
            text: isBangla ? 'বাংলা' : 'English',
            background: theme.palette.violet[100],
            color: theme.palette.violet[700],
          }}
          onPress={() => {
            void setLocale(isBangla ? 'en' : 'bn');
          }}
        />
        <ListRow
          icon="dark_mode"
          tone="gray"
          title={t('settings.themeDark')}
          subtitle={t('settings.themeDarkSub')}
          onPress={toggleTheme}
          showArrow={false}
          trailing={
            <Toggle
              value={theme.colors.isDark}
              onValueChange={(next) => setTheme(next ? 'dark' : 'light')}
              accessibilityLabel={t('settings.themeDark')}
            />
          }
        />
      </Section>

      {/* Security — the SMS row is intentionally absent (waiver W-2). */}
      <Section title={t('settings.security')}>
        <ListRow
          icon="fingerprint"
          tone="amber"
          title={t('settings.biometric')}
          subtitle={t('settings.biometricSub')}
          onPress={() => setBiometric((value) => !value)}
          showArrow={false}
          trailing={
            <Toggle
              value={biometric}
              onValueChange={setBiometric}
              accessibilityLabel={t('settings.biometric')}
            />
          }
        />
      </Section>

      {/* About */}
      <Section title={t('settings.aboutHeader')}>
        <ListRow
          icon="info"
          tone="purple"
          title={t('more.about')}
          subtitle={`${t('settings.version')} 1.0.0`}
        />
        <ListRow icon="star" tone="amber" title={t('settings.rateApp')} />
        <ListRow icon="ios_share" tone="green" title={t('settings.shareApp')} />
      </Section>

      {/* Privacy + account deletion */}
      <Section title={t('settings.privacy')}>
        <ListRow icon="privacy_tip" tone="gray" title={t('settings.privacyPolicy')} />
        <ListRow
          icon="delete"
          tone="red"
          title={t('settings.deleteAccount')}
          subtitle={t('settings.deleteWarning')}
          onPress={() => {
            setDeleteError(undefined);
            setConfirmDelete(true);
          }}
        />
      </Section>

      <Text
        accessibilityRole="button"
        onPress={async () => {
          await logOut();
          router.replace('/(auth)/welcome');
        }}
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

      {/*
        The delete confirmation. It states plainly what happens and — more
        importantly — what does NOT happen: the account is not erased on the
        spot. It is kept for 30 days, and signing back in inside that window
        restores it. A delete that sounds irreversible but is not would train
        users not to believe the warning.
      */}
      <BottomSheet
        visible={confirmDelete}
        title={t('settings.deleteAccount')}
        helper={t('settings.deleteWarning')}
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
      >
        <Text style={[styles.deleteBody, { color: theme.colors.ink[600] }]}>
          {t('settings.deleteBody')}
        </Text>

        {deleteError ? (
          <Text style={[styles.deleteError, { color: theme.palette.red[600] }]}>{deleteError}</Text>
        ) : null}

        <View style={styles.deleteActions}>
          <Button
            label={t('common.cancel')}
            variant="secondary"
            size="lg"
            disabled={deleting}
            onPress={() => setConfirmDelete(false)}
          />
          <Button
            label={t('settings.deleteConfirm')}
            variant="emergency"
            size="lg"
            disabled={deleting}
            onPress={onConfirmDelete}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** A `.list-section` card with an uppercase header. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children);

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
        },
      ]}
    >
      <Text style={[styles.sectionHeader, { color: theme.colors.ink[500] }]}>{title}</Text>
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
  );
}

const styles = StyleSheet.create({
  profileCard: {
    marginHorizontal: 20,
    marginVertical: 16,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  profileEdit: {
    fontSize: 13,
    fontWeight: '600',
  },
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
  deleteBody: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
  },
  deleteError: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  deleteActions: {
    gap: 8,
  },
  logoutRow: {
    marginHorizontal: 20,
    marginTop: 8,    marginBottom: 32,
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
});
