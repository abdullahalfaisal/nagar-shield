import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { alternatePhoneSchema, bnDigitsToAscii, phoneSchema } from '@nagar-shield/shared'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTheme } from '@/shared/theme'
import { appFont } from '@/shared/theme/appFont'
import { Button, InputField, Screen, useToast } from '@/shared/ui'
import { supabase } from '@/shared/api/supabase'
import { loadProfile, updateProfile, type ProfileRow } from '@/shared/api/profile'
import { useAuthSession } from '@/shared/auth/useAuthSession'

const NAME_MAX_LENGTH = 80

/**
 * My profile: the signed-in person's name, phone, email and alternative number.
 *
 * Name and alternative number can be changed. Phone and email are how the
 * person signs in, so they are shown but not editable here.
 */
export default function ProfileScreen() {
  const theme = useTheme()
  const router = useRouter()
  const toast = useToast()
  const { t, i18n } = useTranslation()
  const { session } = useAuthSession()
  const userId = session?.user?.id

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [alternatePhone, setAlternatePhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | undefined>()

  const fill = useCallback((row: ProfileRow) => {
    setFullName(row.full_name ?? '')
    setAlternatePhone(row.alternate_phone ?? '')
    setPhoneError(undefined)
    setFormError(undefined)
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    setLoadFailed(false)
    try {
      const row = await loadProfile(userId)
      setProfile(row)
      fill(row)
    } catch {
      setLoadFailed(true)
    }
  }, [userId, fill])

  useEffect(() => {
    void load()
  }, [load])

  const cancel = () => {
    if (profile) fill(profile)
    setEditing(false)
  }

  const save = async () => {
    if (!userId || !profile) return

    const name = fullName.trim()
    const alternate = alternatePhone.trim()
    let normalized: string | null = null

    if (alternate) {
      const parsed = alternatePhoneSchema.safeParse(alternate)
      if (!parsed.success) {
        setPhoneError(t('errors.phoneInvalid'))
        return
      }
      const primary = phoneSchema.safeParse(profile.phone)
      if (primary.success && parsed.data === primary.data) {
        setPhoneError(t('errors.alternatePhoneSameAsPrimary'))
        return
      }
      normalized = parsed.data
    }

    setSaving(true)
    setFormError(undefined)
    try {
      const row = await updateProfile(userId, {
        full_name: name || null,
        alternate_phone: normalized,
      })
      // The Settings card reads the name from the session, so keep it in step.
      await supabase.auth.updateUser({ data: { full_name: name } })
      setProfile(row)
      fill(row)
      setEditing(false)
      toast.show({ message: t('profile.savedToast'), tone: 'success' })
    } catch {
      setFormError(t('errors.internal'))
    } finally {
      setSaving(false)
    }
  }

  const initial = (profile?.full_name ?? '').trim().charAt(0).toUpperCase()

  return (
    <Screen
      title={t('profile.title')}
      onBack={() => router.back()}
      scroll
      footer={
        profile ? (
          editing ? (
            <View style={styles.footerButtons}>
              <Button
                label={saving ? t('profile.saving') : t('common.save')}
                variant="primary"
                size="lg"
                disabled={saving}
                onPress={() => void save()}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                size="lg"
                disabled={saving}
                onPress={cancel}
              />
            </View>
          ) : (
            <Button
              label={t('profile.edit')}
              variant="primary"
              size="lg"
              onPress={() => setEditing(true)}
            />
          )
        ) : undefined
      }
    >
      {!profile && !loadFailed ? (
        <ActivityIndicator style={styles.loading} color={theme.palette.violet[600]} />
      ) : null}

      {loadFailed ? (
        <View style={styles.block}>
          <Text style={[styles.error, { color: theme.palette.red[600] }]}>
            {t('errors.internal')}
          </Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            size="lg"
            onPress={() => void load()}
          />
        </View>
      ) : null}

      {profile ? (
        <View style={styles.block}>
          <View style={styles.header}>
            <View style={[styles.avatar, { backgroundColor: theme.palette.violet[600] }]}>
              <Text style={styles.avatarText}>{initial || t('common.appNameInitial')}</Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.name,
                { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
              ]}
            >
              {profile.full_name?.trim() || t('auth.fullNameLabel')}
            </Text>
          </View>

          {formError ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.palette.red[600] }]}
            >
              {formError}
            </Text>
          ) : null}

          <InputField
            label={t('auth.fullNameLabel')}
            value={fullName}
            onChangeText={setFullName}
            editable={editing}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            maxLength={NAME_MAX_LENGTH}
            returnKeyType="next"
            icon="person"
          />
          <InputField
            label={t('auth.phoneLabel')}
            value={profile.phone}
            onChangeText={() => undefined}
            editable={false}
            icon="phone"
          />
          <InputField
            label={t('auth.emailLabel')}
            value={profile.email}
            onChangeText={() => undefined}
            editable={false}
            icon="mail"
          />
          <InputField
            label={t('auth.alternatePhoneLabel')}
            value={alternatePhone}
            onChangeText={(next) => {
              setAlternatePhone(bnDigitsToAscii(next))
              if (phoneError) setPhoneError(undefined)
            }}
            editable={editing}
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            returnKeyType="done"
            icon="phone"
            error={phoneError}
          />

          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            {t('profile.signInNote')}
          </Text>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: {
    marginTop: 48,
  },
  block: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  header: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    fontSize: 20,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  footerButtons: {
    gap: 10,
  },
})
