import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Skeleton } from './Skeleton'

interface AlertFeedSkeletonProps {
  /** How many placeholder cards to draw. */
  count?: number
}

/**
 * The feed's loading state: placeholder cards in the real card's box model
 * (20/10 margins, 14/16 padding, 14 radius, the 4 dp accent bar, the 40 dp icon
 * tile), so the list does not jump when the first page arrives.
 *
 * The group is one accessibility element with a "Loading" label and a polite
 * live region; the blocks inside are hidden from the screen reader.
 */
export function AlertFeedSkeleton({ count = 3 }: AlertFeedSkeletonProps) {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <View
      accessible
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface.white,
              borderColor: theme.colors.ink[100],
              borderLeftColor: theme.colors.ink[200],
            },
          ]}
        >
          <Skeleton width={40} height={40} radius={20} />
          <View style={styles.body}>
            <Skeleton width="38%" height={11} />
            <Skeleton width="70%" height={15} />
            <Skeleton width="92%" height={13} />
            <Skeleton width="55%" height={11} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
})
