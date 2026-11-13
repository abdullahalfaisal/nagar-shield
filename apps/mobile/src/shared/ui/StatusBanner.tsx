import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './Icon';

/**
 * The queue status banner.
 *
 * Two states need a surface, and neither of them is an error:
 *
 *   * **`saved`** — one or more reports are on the device and will be sent
 *     when the network returns. The evidence is safe; the banner says so.
 *   * **`warning`** — the queue's 20-item bound evicted the oldest report.
 *     The user is told, because silently deleting a citizen's evidence is
 *     not acceptable.
 *
 * The banner is deliberately **not** a toast and **not** a dialog. A queued
 * report is a state the app is in, and a state does not shout.
 */
export type StatusBannerTone = 'saved' | 'warning';

interface StatusBannerProps {
  tone: StatusBannerTone;
  title: string;
  body?: string;
}

export function StatusBanner({ tone, title, body }: StatusBannerProps) {
  const theme = useTheme();

  const isWarning = tone === 'warning';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={[
        styles.banner,
        {
          backgroundColor: isWarning ? theme.palette.amber[50] : theme.palette.violet[50],
          borderColor: isWarning ? theme.palette.amber[100] : theme.palette.violet[100],
        },
      ]}
    >
      <Icon
        name={isWarning ? 'warning' : 'cloud_done'}
        size={20}
        color={isWarning ? theme.palette.amber[600] : theme.palette.violet[700]}
        filled
      />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>{title}</Text>
        {body ? (
          <Text style={[styles.text, { color: theme.colors.ink[500] }]}>{body}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  text: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
});
