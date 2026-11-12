import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '@/shared/ui';

/**
 * Placeholder route.
 *
 * The station map is built by unit `003-help-seek` (bolt 010) using the shared
 * MapLibre wrapper. FR-SEEK-3 requires a 10 km radius; with no station inside
 * that radius the call routes to **999**.
 */
export default function StationMapScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen title={t('help.stationMapTitle')} onBack={() => router.back()}>
      <EmptyState
        icon="map"
        title={t('help.stationMapTitle')}
        description={t('help.stationMapSubtitle')}
      />
    </Screen>
  );
}
