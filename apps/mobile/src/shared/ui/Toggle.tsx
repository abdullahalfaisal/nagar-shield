import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

/**
 * `.toggle` — 44 × 26 pill, `--ink-200` track, `--violet-600` when on,
 * 22 dp white knob with a 18 dp travel.
 *
 * The visual track is 44 dp wide, but the tap target is padded to 48 dp to
 * satisfy FR-UX-4 (Material 48 dp minimum).
 */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled = false }: ToggleProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={11}
      style={styles.hitArea}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? theme.palette.violet[600] : theme.colors.ink[200],
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.knob,
            {
              backgroundColor: theme.staticColors.white,
              transform: [{ translateX: value ? 18 : 0 }],
              shadowColor: '#0F172A',
              shadowOpacity: 0.18,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    // The track is 44 dp; the padded hit area brings it to the 48 dp minimum.
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    position: 'absolute',
    left: 2,
  },
});
