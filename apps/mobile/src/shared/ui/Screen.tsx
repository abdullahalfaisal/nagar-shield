import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { AppBar } from './AppBar';

interface ScreenProps {
  children: React.ReactNode;
  /** Renders the app bar above the content. */
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  action?: { icon: string; onPress: () => void; accessibilityLabel: string; badge?: boolean };
  scroll?: boolean;
  /** Sticky footer rendered above the safe-area inset. */
  footer?: React.ReactNode;
  background?: string;
  /** Extra bottom padding so a sticky CTA never covers the last row. */
  contentBottomPadding?: number;
}

/**
 * The standard screen frame: app bar, scrolling content, optional sticky footer.
 * Every feature screen in the app uses this so the chrome stays identical.
 */
export function Screen({
  children,
  title,
  subtitle,
  onBack,
  action,
  scroll = true,
  footer,
  background,
  contentBottomPadding = 0,
}: ScreenProps) {
  const theme = useTheme();

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: contentBottomPadding + 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flexBody}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: background ?? theme.colors.surface.lavender }]}>
      {title ? (
        <AppBar title={title} subtitle={subtitle} onBack={onBack} action={action} />
      ) : null}
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  flexBody: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
