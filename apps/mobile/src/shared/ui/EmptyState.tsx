import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}

/**
 * The prototype has no dedicated empty-state component; this standardises the
 * pattern used across History (no reports in range), Alerts (no alerts) and
 * Emergency Contacts (no contacts saved).
 */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.ink[100] }]}>
        <Icon name={icon} size={30} color={theme.colors.ink[400]} />
      </View>
      <Text
        style={{
          color: theme.colors.ink[950],
          fontSize: 15,
          fontWeight: theme.typography.weight.semibold,
          marginTop: 14,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: theme.colors.ink[500],
            fontSize: 13,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 19,
            paddingHorizontal: 32,
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <Text
          accessibilityRole="button"
          onPress={action.onPress}
          style={{
            color: theme.palette.violet[700],
            fontSize: 14,
            fontWeight: theme.typography.weight.semibold,
            marginTop: 16,
          }}
        >
          {action.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  iconTile: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
