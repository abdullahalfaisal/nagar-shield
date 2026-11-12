import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/shared/ui';

/**
 * Placeholder route.
 *
 * The History overview (prototype screen 21) is built by unit `006-alerts`
 * (bolt 020–021). Its Distribution tab renders **counts per category only** —
 * no chart, no percentage, no trend, no heatmap (FR-NG-3 / FR-NG-4 / ADR-010).
 */
export default function HistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen title={t('alerts.historyTitle')} onBack={() => router.back()}>
      <EmptyState icon="monitoring" title={t('alerts.noHistory')} description={t('alerts.noHistorySub')} />
    </Screen>
  );
}
