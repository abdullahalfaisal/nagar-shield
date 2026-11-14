import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AppError,
  emergencyContactSchema,
  type EmergencyContact,
} from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { AppBar, Button, InputField, RadioGroup, Toggle } from '@/shared/ui';
import {
  clearPrimary,
  createContact,
  makePrimary,
  updateContact,
  useContact,
  useInvalidateContacts,
} from '@/shared/api/contacts';
import { fromSupabaseError } from '@/shared/api/errors';
import { errorCopy } from '@/shared/i18n/errorCopy';

/**
 * The contact editor — the one screen behind both "add a contact" and
 * "edit a contact".
 *
 * Two capture paths
 * -----------------
 * The onboarding wizard (S-04a/b/c) and this screen write through the **same**
 * owner-scoped API and the **same** shared `contactSchema`. The wizard has
 * its own screens because the prototype has them; the schema and the API are
 * not duplicated between them.
 *
 * What the screen validates
 * -------------------------
 * The phone is checked with the shared schema, which normalises it to E.164
 * and refuses anything that is not a valid Bangladesh number. So `01712-345678`
 * is stored as `+8801712345678`, and `12345` never reaches the database.
 * The database's CHECK constraint is the second line of defence, not the first.
 *
 * There is **no cap** on how many contacts may be saved (A-4).
 */
export default function ContactEditorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const invalidate = useInvalidateContacts();

  const params = useLocalSearchParams<{ id?: string }>();
  const contactId = params.id;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupName, setGroupName] = useState<EmergencyContact['groupName']>('other');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // The contact being edited, if any. The form is pre-filled from it, so an
  // edit never overwrites a contact with a blank form.
  const { data: existing } = useContact(contactId);

  // Whether the row was primary **before** this edit. The demotion is only
  // worth writing when the flag was set and the user has now turned it off;
  // the app never silently promotes a different contact to compensate.
  const wasPrimary = existing?.isPrimary ?? false;

  useEffect(() => {
    if (!existing) return;

    setName(existing.name);
    setPhone(existing.phone);
    setGroupName(existing.groupName);
    setIsPrimary(existing.isPrimary);
  }, [existing]);

  // The group options come from the shared schema's enum, so the screen and
  // the database can never disagree about which groups exist.
  const groupOptions = useMemo(
    () =>
      (['family', 'friend', 'colleague', 'other'] as const).map((group) => ({
        id: group as string,
        label: groupLabel(group, t),
      })),
    [t],
  );

  const onSave = useCallback(async () => {
    const parsed = emergencyContactSchema.safeParse({
      name,
      phone,
      isPrimary,
      groupName,
      sortOrder: 0,
    });

    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      nextErrors[field === 'phone' ? 'phone' : 'name'] = t('errors.validationFailed');
    }
    setErrors(nextErrors);
    if (!parsed.success) return;

    setSubmitting(true);
    setFormError(undefined);

    try {
      if (contactId) {
        // The primary flag is deliberately **not** part of this update.
        //
        // A promotion has to clear every other primary in the same pass, and
        // that is `makePrimary`'s job. Writing `is_primary: true` here first
        // and clearing the others afterwards would leave a window in which
        // the list held two primaries — and the picker in unit 003 would then
        // have to guess which one to dial first.
        //
        // A **demotion** is the opposite: it only ever clears this row's own
        // flag, so it is an ordinary update.
        await updateContact(contactId, {
          name: parsed.data.name,
          phone: parsed.data.phone,
          groupName: parsed.data.groupName,
        });

        if (parsed.data.isPrimary) {
          await makePrimary(contactId);
        } else if (wasPrimary) {
          await clearPrimary(contactId);
        }
      } else {
        const created = await createContact({
          name: parsed.data.name,
          phone: parsed.data.phone,
          groupName: parsed.data.groupName,
        });

        if (parsed.data.isPrimary) {
          await makePrimary(created.id);
        }
      }

      await invalidate();
      router.back();
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error);

      // A validation failure that names the phone field is shown **on that
      // field**, not as a banner above the form.
      if (appError.code === 'VALIDATION_FAILED' && appError.details?.field === 'phone') {
        setErrors({ phone: t('errors.validationFailed') });
        setFormError(undefined);
      } else {
        setFormError(errorCopy(t, appError.code));
      }

      setSubmitting(false);
    }
  }, [contactId, groupName, invalidate, isPrimary, name, phone, router, t, wasPrimary]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar
        title={contactId ? t('contacts.editTitle') : t('contacts.addTitle')}
        onBack={() => router.back()}
      />

      <View style={styles.content}>
        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        <InputField
          label={t('contacts.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('contacts.nameLabel')}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          icon="person"
          error={errors.name}
          testID="contact-name"
        />

        <InputField
          label={t('contacts.phoneLabel')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('contacts.phonePlaceholder')}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          icon="phone"
          helper={t('contacts.phoneHelper')}
          error={errors.phone}
          testID="contact-phone"
        />

        <Text style={[styles.sectionLabel, { color: theme.colors.ink[500] }]}>
          {t('contacts.groupLabel')}
        </Text>
        <RadioGroup
          options={groupOptions}
          selectedId={groupName}
          onSelect={(id) => setGroupName(id as EmergencyContact['groupName'])}
        />

        {/*
          The primary toggle.

          Turning it **on** is a promotion, not a second flag: the write goes
          through `makePrimary`, which clears every other primary in the same
          pass, so the list never shows two. Turning it **off** is a demotion
          — it writes `is_primary: false` through the ordinary update, and the
          list is left with no primary at all rather than silently promoting
          someone else.
        */}
        <View style={[styles.primaryRow, { borderColor: theme.colors.ink[100] }]}>
          <View style={styles.primaryText}>
            <Text style={[styles.primaryLabel, { color: theme.colors.ink[950] }]}>
              {t('contacts.primaryLabel')}
            </Text>
            <Text style={[styles.primaryHelper, { color: theme.colors.ink[500] }]}>
              {t('contacts.primaryHelper')}
            </Text>
          </View>
          <Toggle
            value={isPrimary}
            onValueChange={setIsPrimary}
            accessibilityLabel={t('contacts.primaryLabel')}
          />
        </View>

        <Button
          label={submitting ? t('capture.submitting') : t('contacts.saveCta')}
          variant="primary"
          size="lg"
          disabled={submitting}
          onPress={onSave}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

function groupLabel(group: EmergencyContact['groupName'], t: (key: string) => string): string {
  switch (group) {
    case 'family':
      return t('contacts.groupFamily');
    case 'friend':
      return t('contacts.groupFriend');
    case 'colleague':
      return t('contacts.groupColleague');
    default:
      return t('contacts.groupOther');
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 6,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  primaryText: {
    flex: 1,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryHelper: {
    fontSize: 12,
    marginTop: 2,
  },
  cta: {
    marginTop: 24,
  },
});
