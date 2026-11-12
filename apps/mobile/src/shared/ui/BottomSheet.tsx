import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon } from './Icon';

interface BottomSheetProps {
  visible: boolean;
  title?: string;
  helper?: string;
  onClose: () => void;
  children: ReactNode;
  /** Replaces the default close icon in the header. */
  hideHeader?: boolean;
}

/**
 * The shared bottom sheet.
 *
 * The prototype's sheets (`#flag-dialog`, `#wrong-number-dialog`, the More Help
 * sheet) all share one shape: a scrim, a rounded top, a drag handle, a title
 * and a close affordance. React Native's `Modal` gives the same stacking
 * behaviour the HTML `<dialog>` had, including the scrim.
 */
export function BottomSheet({
  visible,
  title,
  helper,
  onClose,
  children,
  hideHeader = false,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.scrimDismiss}
          onPress={onClose}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface.white,
              paddingBottom: 20 + insets.bottom,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.ink[200] }]} />

          {!hideHeader ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                {title ? (
                  <Text style={[styles.title, { color: theme.colors.ink[950] }]}>{title}</Text>
                ) : null}
                {helper ? (
                  <Text style={[styles.helper, { color: theme.colors.ink[500] }]}>{helper}</Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={onClose}
                style={styles.closeButton}
              >
                <Icon name="close" size={20} color={theme.colors.ink[500]} />
              </Pressable>
            </View>
          ) : null}

          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrimDismiss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.01,
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
