import { useState, type ComponentRef, type Ref } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface InputFieldProps {
  label: string
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  helper?: string
  error?: string
  icon?: string
  secureTextEntry?: boolean
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: TextInputProps['autoCapitalize']
  autoComplete?: TextInputProps['autoComplete']
  textContentType?: TextInputProps['textContentType']
  editable?: boolean
  onSubmitEditing?: () => void
  returnKeyType?: TextInputProps['returnKeyType']
  maxLength?: number
  testID?: string
  /** Lets a form move focus to this field from the previous one's "next" key. */
  inputRef?: Ref<ComponentRef<typeof TextInput>>
}

/**
 * `.input-field` — 56 dp tall, `--surface-white` fill, 1.5 dp
 * `--surface-outline` border, radius `--r-lg`.
 *
 * The prototype floats the label above the border on focus/fill. React Native
 * has no `:placeholder-shown`, so the label lifts when `value` is non-empty or
 * the field is focused — same behaviour, tracked explicitly.
 */
export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  icon,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  editable = true,
  onSubmitEditing,
  returnKeyType,
  maxLength,
  testID,
  inputRef,
}: InputFieldProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)

  const floated = focused || value.length > 0
  const borderColor = error
    ? theme.palette.red[600]
    : focused
      ? theme.palette.violet[500]
      : theme.colors.surface.outline

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor,
            borderRadius: theme.radius.lg,
            shadowColor: '#0F172A',
            shadowOpacity: focused ? 0.16 : 0.04,
            shadowRadius: focused ? 24 : 2,
            shadowOffset: { width: 0, height: focused ? 8 : 1 },
          },
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={focused ? theme.palette.violet[500] : theme.colors.ink[400]}
            style={styles.leadingIcon}
          />
        ) : null}

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          // The placeholder is only shown once the label has floated up. While
          // the field is empty and unfocused, the label itself sits in the
          // field as the hint — rendering the placeholder there too would put
          // two strings on top of each other.
          placeholder={floated ? placeholder : undefined}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          testID={testID}
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: theme.colors.ink[950],
              fontSize: 15,
              paddingTop: floated ? 20 : 18,
              paddingBottom: floated ? 6 : 8,
              paddingLeft: icon ? 0 : 16,
            },
          ]}
        />

        <Text
          pointerEvents="none"
          style={[
            styles.label,
            {
              left: icon ? 42 : 16,
              top: floated ? -7 : 17,
              color: error
                ? theme.palette.red[600]
                : focused
                  ? theme.palette.violet[700]
                  : theme.colors.ink[500],
              fontSize: floated ? 11 : 15,
              backgroundColor: theme.colors.surface.white,
              fontWeight: floated
                ? theme.typography.weight.semibold
                : theme.typography.weight.regular,
              paddingHorizontal: 4,
            },
          ]}
        >
          {label}
        </Text>
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.helper, { color: theme.palette.red[600] }]}
        >
          {error}
        </Text>
      ) : helper ? (
        <Text style={[styles.helper, { color: theme.colors.ink[500] }]}>{helper}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 4,
  },
  field: {
    height: 56,
    borderWidth: 1.5,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingRight: 16,
  },
  leadingIcon: {
    marginLeft: 14,
    marginRight: 8,
  },
  label: {
    position: 'absolute',
  },
  helper: {
    fontSize: 12,
    marginTop: 6,
    paddingLeft: 4,
  },
})
