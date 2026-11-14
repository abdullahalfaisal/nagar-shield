import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface WizardScreenProps {
  children: React.ReactNode
  /** 1-based step index. `0` hides the progress bar (Welcome / Done). */
  step?: number
  totalSteps?: number
  eyebrow?: string
  title?: React.ReactNode
  subtitle?: string
  /** Sticky footer content — the primary CTA and escape links. */
  footer?: React.ReactNode
  scroll?: boolean
}

/**
 * The wizard chrome shared by the onboarding screens.
 * Mirrors `.wizard-screen`, `.wizard-progress`, `.wizard-step-label`,
 * `.wizard-hero`, `.wizard-body` and `.wizard-sticky`.
 */
export function WizardScreen({
  children,
  step = 0,
  totalSteps = 4,
  eyebrow,
  title,
  subtitle,
  footer,
  scroll = false,
}: WizardScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const body = <View style={styles.body}>{children}</View>

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.surface.lavender }]}>
      {step > 0 ? (
        <View style={styles.progress}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.seg,
                {
                  backgroundColor:
                    index + 1 < step
                      ? theme.palette.violet[600]
                      : index + 1 === step
                        ? theme.palette.violet[400]
                        : theme.colors.ink[200],
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      {step > 0 ? (
        <View style={styles.stepLabel}>
          <Text style={[styles.stepLabelText, { color: theme.colors.ink[500] }]}>
            Setup ·{' '}
            <Text style={{ color: theme.palette.violet[700] }}>
              Step {step} of {totalSteps}
            </Text>
          </Text>
        </View>
      ) : null}

      {eyebrow ? (
        <View style={styles.eyebrow}>
          <View style={[styles.eyebrowDot, { backgroundColor: theme.palette.violet[600] }]} />
          <Text style={[styles.eyebrowText, { color: theme.palette.violet[700] }]}>{eyebrow}</Text>
        </View>
      ) : null}

      {title ? (
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: theme.colors.ink[950] }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.heroSubtitle, { color: theme.colors.ink[600] }]}>{subtitle}</Text>
          ) : null}
        </View>
      ) : null}

      {scroll ? <View style={styles.scrollBody}>{body}</View> : body}

      {footer ? (
        <View style={[styles.sticky, { paddingBottom: 22 + insets.bottom }]}>{footer}</View>
      ) : null}
    </View>
  )
}

/**
 * `.wizard-center .badge` — the 88 dp gradient circle with the shield glyph.
 * The Done screen uses a green variant.
 */
export function WizardBadge({
  icon = 'shield',
  tone = 'primary',
}: {
  icon?: string
  tone?: 'primary' | 'success'
}) {
  const theme = useTheme()
  const colors = tone === 'success' ? theme.gradients.success : theme.gradients.primary

  return (
    <LinearGradient
      colors={[...colors]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badge,
        {
          shadowColor: tone === 'success' ? '#10B981' : '#7C3AED',
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
      ]}
    >
      <Icon name={icon} size={42} color="#FFFFFF" filled />
    </LinearGradient>
  )
}

/** `.wizard-sticky .escape` — the muted text action under the primary CTA. */
export function EscapeLink({ label, onPress }: { label: string; onPress?: () => void }) {
  const theme = useTheme()
  return (
    // A `Pressable` rather than a `Text` with an `onPress`, so the link has a
    // real 48 dp box. The label itself is unchanged.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.escapeHit}
    >
      <Text style={[styles.escape, { color: theme.colors.ink[500] }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 14,
    paddingHorizontal: 24,
  },
  seg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepLabel: {
    paddingTop: 10,
    paddingHorizontal: 24,
  },
  stepLabelText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  eyebrow: {
    paddingTop: 28,
    paddingBottom: 6,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -0.52,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  body: {
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 24,
    flex: 1,
  },
  scrollBody: {
    flex: 1,
  },
  sticky: {
    paddingTop: 12,
    paddingHorizontal: 24,
    gap: 8,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  escape: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 8,
  },
  escapeHit: {
    // The 48 dp tap target for the escape link (FR-UX-4). The padding is
    // transparent, so the visual is unchanged.
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
