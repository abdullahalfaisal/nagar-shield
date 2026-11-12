import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export interface SegmentedTab {
  id: string;
  label: string;
}

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * `.segmented-tabs` — the prototype's pill switcher.
 *
 * `margin: 0 20px 16px`, `background: var(--ink-100)`, `border-radius:
 * var(--r-md)`, `padding: 4px`. The active segment is a white pill; every
 * segment is at least 48 dp tall so the control is reachable.
 */
export function SegmentedTabs({ tabs, activeId, onSelect }: SegmentedTabsProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: theme.colors.ink[100] }]}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.id)}
            style={[
              styles.segment,
              active
                ? { backgroundColor: theme.colors.surface.white }
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: active ? theme.colors.ink[950] : theme.colors.ink[500],
                  fontWeight: active ? '700' : '600',
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  label: {
    fontSize: 13,
  },
});
