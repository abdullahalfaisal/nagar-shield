import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import { Icon } from './Icon';

interface CardProps {
  children: React.ReactNode;
  style?: object;
  /** `raised` uses `--shadow-card`; `flat` uses a hairline border only. */
  elevation?: 'raised' | 'flat';
  padded?: boolean;
}

/**
 * The base card surface used by the Alerts feed, History list, contact rows
 * and the location address card. Maps to the prototype's `--surface-card` +
 * `--shadow-card` combination.
 */
export function Card({ children, style, elevation = 'raised', padded = true }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface.card,
          borderRadius: theme.radius.lg,
          padding: padded ? 16 : 0,
        },
        elevation === 'raised'
          ? {
              shadowColor: '#0F172A',
              shadowOpacity: 0.05,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            }
          : { borderWidth: 1, borderColor: theme.colors.ink[100] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * `.help-card` — the Help Alert grid tile. 80 dp tall, gradient fill, a 56 dp
 * translucent icon tile on the left, and a circular call affordance on the
 * right.
 *
 * The four emergency variants keep the prototype's exact gradients:
 *   Police  → `--grad-hero`     (purple)
 *   Medical → `--grad-emergency`(red)
 *   Fire    → `#D97706 → #F59E0B`(amber)
 *   Personal→ `#059669 → #10B981`(green)
 */
export const HELP_CARD_VARIANTS = {
  police: { gradient: ['#4C2BB5', '#7C3AED', '#A78BFA'] as const, icon: 'local_police', number: '999' },
  medical: { gradient: ['#E94B45', '#F87171'] as const, icon: 'medical_services', number: '999' },
  fire: { gradient: ['#D97706', '#F59E0B'] as const, icon: 'local_fire_department', number: '102' },
  personal: { gradient: ['#059669', '#10B981'] as const, icon: 'contact_phone', number: null },
} as const;

export type HelpCardVariant = keyof typeof HELP_CARD_VARIANTS;

interface HelpCardProps {
  variant: HelpCardVariant;
  title: string;
  subtitle: string;
  englishLabel: string;
  number?: string | null;
  onPress: () => void;
  disabled?: boolean;
}

export function HelpCard({
  variant,
  title,
  subtitle,
  englishLabel,
  number,
  onPress,
  disabled = false,
}: HelpCardProps) {
  const spec = HELP_CARD_VARIANTS[variant];
  const shownNumber = number ?? spec.number;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} ${englishLabel}${shownNumber ? ` ${shownNumber}` : ''}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.helpCard,
        { opacity: disabled ? 0.5 : pressed ? 0.92 : 1 },
      ]}
    >
      <LinearGradient
        colors={[...spec.gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.helpCardFill}
      >
        <View style={styles.helpIconTile}>
          <Icon name={spec.icon} size={26} color="#FFFFFF" filled />
        </View>
        <View style={styles.helpText}>
          <Text style={styles.helpTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.helpSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          <Text style={styles.helpEnglish} numberOfLines={1}>
            {englishLabel}
          </Text>
        </View>
        <View style={styles.helpCall}>
          {shownNumber ? (
            <Text style={styles.helpNumber} numberOfLines={1}>
              {shownNumber}
            </Text>
          ) : null}
          <Icon name="call" size={16} color="#FFFFFF" filled />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  helpCard: {
    height: 80,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
    overflow: 'hidden',
  },
  helpCardFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  helpIconTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    flex: 1,
    minWidth: 0,
  },
  helpTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 1,
  },
  helpSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginBottom: 1,
  },
  helpEnglish: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '500',
  },
  helpCall: {
    width: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpNumber: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
});
