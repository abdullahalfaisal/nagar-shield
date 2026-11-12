import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/shared/ui';

/**
 * Placeholder route.
 *
 * The More Help / wrong-number surface is built by unit `003-help-seek`
 * (bolt 009). FR-SEEK-1 names three categories; the prototype sheet shows six
 * flat rows. The build keeps all six rows 1:1 and each row opens its category.
 */
export default function MoreHelpScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen title={t('help.moreHelpTitle')} onBack={() => router.back()}>
      <EmptyState
        icon="support_agent"
        title={t('help.wrongNumberTitle')}
        description={t('help.wrongNumberSubtitle')}
      />
    </Screen>
  );
}
