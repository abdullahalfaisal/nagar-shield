import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { useTranslation } from 'react-i18next'
import type { AreaChip } from './AreaChipRow'
import { LineIcon } from './LineIcon'
import { SolidIcon } from './SolidIcon'
import { surfaceShadow } from './surface'

interface AreaDropdownProps {
  chips: AreaChip[]
  activeId: string
  onSelect: (chip: AreaChip) => void
}

/** The area filter: one button that opens a searchable, scrollable list of areas. */
export function AreaDropdown({ chips, activeId, onSelect }: AreaDropdownProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const activeLabel = chips.find((chip) => chip.id === activeId)?.label ?? ''
  const needle = query.trim().toLowerCase()
  const shown = needle ? chips.filter((chip) => chip.label.toLowerCase().includes(needle)) : chips
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={activeLabel}
        onPress={() => (open ? close() : setOpen(true))}
        hitSlop={10}
        style={[
          styles.trigger,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: open ? theme.palette.violet[600] : theme.colors.ink[200],
          },
        ]}
      >
        <SolidIcon name="pin" size={16} color={violet} />
        <Text
          numberOfLines={1}
          style={[
            styles.triggerLabel,
            { color: theme.colors.ink[950], fontFamily: appFont('semibold', i18n.language) },
          ]}
        >
          {activeLabel}
        </Text>
        <View style={open ? styles.flipped : undefined}>
          <SolidIcon name="chevronDown" size={18} color={theme.colors.ink[600]} />
        </View>
      </Pressable>

      {open ? (
        <View
          style={[
            styles.menu,
            { backgroundColor: theme.colors.surface.white, borderColor: theme.colors.ink[100] },
          ]}
        >
          <View style={[styles.search, { borderBottomColor: theme.colors.ink[100] }]}>
            <LineIcon name="search" size={18} color={theme.colors.ink[500]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('alerts.areaSearch')}
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={t('alerts.areaSearch')}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[
                styles.searchInput,
                { color: theme.colors.ink[950], fontFamily: appFont('medium', i18n.language) },
              ]}
            />
          </View>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {shown.length === 0 ? (
              <Text style={[styles.noMatch, { color: theme.colors.textMuted }]}>
                {t('alerts.areaNoMatch')}
              </Text>
            ) : null}
            {shown.map((chip) => {
              const active = chip.id === activeId
              const disabled = chip.disabled === true

              return (
                <Pressable
                  key={chip.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled }}
                  accessibilityLabel={chip.label}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(chip)
                    close()
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: pressed ? theme.colors.ink[50] : 'transparent',
                      opacity: disabled ? 0.45 : 1,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.optionLabel,
                      {
                        color: active ? violet : theme.colors.ink[950],
                        fontFamily: appFont(active ? 'bold' : 'medium', i18n.language),
                      },
                    ]}
                  >
                    {chip.label}
                  </Text>
                  {active ? <SolidIcon name="check" size={20} color={violet} /> : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // The list sits in the layout, not floating over the feed: Android does not
  // pass touches to a view drawn outside its parent, so a floating list could
  // not be scrolled and the feed behind it scrolled instead.
  wrap: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  trigger: {
    height: 40,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triggerLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  menu: {
    marginTop: 6,
    maxHeight: 400,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    ...surfaceShadow,
    shadowOpacity: 0.16,
    elevation: 8,
  },
  search: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    padding: 0,
  },
  noMatch: {
    padding: 16,
    fontSize: 14,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
  },
})
