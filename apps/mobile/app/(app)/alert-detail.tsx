import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/shared/ui';

/**
 * Placeholder route.
 *
 * The public alert-detail surface is built by unit `006-alerts` (bolt 021).
 * The prototype's `data-nav="21a"` is a dead target — its 21a is the author's
 * own report detail, owned by unit `004-capture`. A distinct **public**
 * alert-detail screen is required and is built by unit 006.
 */
export default function AlertDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <Screen title={t('alerts.detailTitle')} onBack={() => router.back()}>
      <EmptyState icon="article" title={t('alerts.detailTitle')} description={id ?? undefined} />
    </Screen>
  );
}
