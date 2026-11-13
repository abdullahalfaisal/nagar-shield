import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
} from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { AppBar, Button, EmptyState, FlagSheet, Icon } from '@/shared/ui';
import {
  signAlertMediaUrls,
  usePublicAlertDetail,
} from '@/shared/api/alertDetail';
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime';

/**
 * The **public** alert detail.
 *
 * `006-alerts / 009-alert-detail-screen` — the surface the feed card's
 * `✎ বিস্তারিত দেখুন` link opens, and the surface the History map's marker
 * tap opens. The two entry points render the identical surface.
 *
 * There are two distinct surfaces behind the prototype's `21a`
 * ---------------------------------------------------------
 * The prototype's `data-nav="21a"` target exists only as the **author's own**
 * report-detail / category-refinement surface, which is unit `004-capture`'s
 * and is reached from History. There is **no** prototype screen for the
 * *public* alert detail. This screen is the public one, created from the
 * alert card plus unit `004`'s report-detail pattern.
 *
 * The author never appears
 * ------------------------
 * The public read path returns no author id and no author display name unless
 * the author explicitly chose `identified`. The screen has **no** author
 * field, no "reported by" row, and no avatar. The author is not erased — the
 * database keeps `author_id` for moderation — but the public surface has
 * nothing to render.
 *
 * The flag action is the same component, not a copy
 * -------------------------------------------------
 * The detail opens the **same** `FlagSheet` the feed card opens: the same five
 * reason radios, the same optional note, the same submit / cancel, the same
 * success toast, and the same `CONFLICT` / `FLAG_RATE_LIMIT` mapping. A copy
 * is how two surfaces drift.
 *
 * A civic-information surface
 * ---------------------------
 * The screen never presents a citizen report as a verified incident and never
 * claims the app notified, dispatched, or escalated anything to an authority
 * (C-6).
 */
export default function AlertDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const reportId = params.id;

  const { data: alert, isLoading } = usePublicAlertDetail(reportId);

  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [flagOpen, setFlagOpen] = useState(false);

  // The signed URLs are fetched once the media rows are known. The bucket is
  // private, so a URL is needed to render the image — and it is fetched on
  // demand, never stored.
  useEffect(() => {
    let active = true;

    if (!alert || alert.media.length === 0) {
      setMediaUrls({});
      return;
    }

    void signAlertMediaUrls(alert.media).then((urls) => {
      if (!active) return;
      setMediaUrls(urls);
    });

    return () => {
      active = false;
    };
  }, [alert]);

  const category = alert?.category ?? null;
  const categoryLabel = category ? REPORT_CATEGORY_LABELS[category] : null;
  const accent = category ? REPORT_CATEGORY_ACCENTS[category] : theme.colors.ink[400];

  const areaLine = useMemo(() => {
    const area = alert?.areaHierarchy;
    if (!area) return null;
    const english = area.neighborhood ?? area.thana ?? area.city ?? area.division;
    const bangla = area.neighborhood ?? area.thana ?? area.city ?? area.division;
    if (!english) return null;
    return english === bangla ? english : `${english} · ${bangla}`;
  }, [alert]);

  const relativeTime = alert ? formatRelativeTimeForLocale(alert.capturedAt, i18n.language) : '';
  const absoluteTime = alert ? new Date(alert.capturedAt).toLocaleString(i18n.language) : '';

  // A report that does not resolve — because it never existed, because it was
  // removed by moderation, or because it was soft-deleted — renders the "no
  // longer available" state and **no** report content. The three are
  // indistinguishable from outside, so the state cannot be used to discover
  // which reports were hidden.
  if (isLoading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.colors.surface.lavender }]}>
        <ActivityIndicator color={theme.palette.violet[600]} />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
        <AppBar title={t('alerts.detailTitle')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <EmptyState
            icon="info"
            title={t('alerts.detailUnavailableTitle')}
            description={t('alerts.detailUnavailableBody')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('alerts.detailTitle')} onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* The media block. A report with no media renders no media block at
            all — no empty placeholder box, no broken image frame. */}
        {alert.media.length > 0 ? (
          <View style={styles.mediaStrip}>
            {alert.media.map((media) => {
              const url = mediaUrls[media.storagePath];
              return (
                <View
                  key={media.id}
                  accessibilityLabel={t('alerts.mediaLabel')}
                  style={[styles.mediaTile, { backgroundColor: theme.colors.ink[100] }]}
                >
                  {url ? (
                    <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
                  ) : (
                    <Icon name="image" size={28} color={theme.colors.ink[400]} />
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* The description. A report with no description renders no
            description block — no empty gap and no empty string. */}
        {alert.description ? (
          <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
            <Text style={[styles.description, { color: theme.colors.ink[950] }]}>
              {alert.description}
            </Text>
          </View>
        ) : null}

        {/* The category. The Bangla / English pair, exactly as the feed card
            renders it. A report with no category shows the neutral
            placeholder — the category is never invented. */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
          <View style={styles.categoryRow}>
            <View style={[styles.categoryIcon, { backgroundColor: `${accent}1A` }]}>
              <Icon
                name={category ? REPORT_CATEGORY_ICONS[category] : 'help'}
                size={20}
                color={accent}
                filled
              />
            </View>
            <View style={styles.categoryText}>
              <Text style={[styles.factLabel, { color: theme.colors.ink[500] }]}>
                {t('alerts.categoryLabel')}
              </Text>
              <Text style={[styles.categoryValue, { color: theme.colors.ink[950] }]}>
                {categoryLabel
                  ? `${categoryLabel.bn} — ${categoryLabel.en}`
                  : t('alerts.uncategorized')}
              </Text>
            </View>
          </View>
        </View>

        {/* The facts: the area, the relative time, and the absolute capture
            time. Both times are shown — the relative one is how fresh the
            report is, the absolute one places the event precisely. */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
          <FactRow
            icon="location_on"
            label={t('alerts.locationLabel')}
            value={areaLine ?? '—'}
          />
          <View style={[styles.hairline, { backgroundColor: theme.colors.ink[100] }]} />
          <FactRow icon="schedule" label={t('alerts.capturedAtLabel')} value={relativeTime} />
          <View style={[styles.hairline, { backgroundColor: theme.colors.ink[100] }]} />
          <FactRow
            icon="event"
            label={t('alerts.absoluteTimeLabel')}
            value={absoluteTime}
          />
        </View>

        {/* The flag action — the same shared sheet the feed card opens. */}
        <Button
          label={t('alerts.flag')}
          variant="secondary"
          icon="flag"
          onPress={() => setFlagOpen(true)}
          style={styles.flagButton}
        />

        {/* The civic-information note. It is not a disclaimer bolted on — it
            is the truth about what a citizen report is. */}
        <Text style={[styles.note, { color: theme.colors.ink[500] }]}>
          {t('alerts.detailNote')}
        </Text>
      </ScrollView>

      <FlagSheet
        visible={flagOpen}
        reportId={alert.id}
        onClose={() => setFlagOpen(false)}
        onFlagged={() => {
          // A flag that crosses the 3-flag threshold hides the report. The
          // detail then shows its "no longer available" state — the same
          // state a removed report shows.
          setFlagOpen(false);
        }}
      />
    </View>
  );
}

/** One label/value pair — the area, the relative time, the absolute time. */
function FactRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={styles.factRow}>
      <View style={[styles.factIcon, { backgroundColor: theme.colors.ink[100] }]}>
        <Icon name={icon} size={18} color={theme.colors.ink[700]} />
      </View>
      <View style={styles.factText}>
        <Text style={[styles.factLabel, { color: theme.colors.ink[500] }]}>{label}</Text>
        <Text style={[styles.factValue, { color: theme.colors.ink[950] }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  mediaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  mediaTile: {
    width: 104,
    height: 104,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  categoryIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    flex: 1,
    minWidth: 0,
  },
  categoryValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 1,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    minWidth: 0,
  },
  factLabel: {
    fontSize: 11,
    marginBottom: 1,
  },
  factValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  flagButton: {
    marginTop: 6,
  },
  note: {
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 14,
  },
});
