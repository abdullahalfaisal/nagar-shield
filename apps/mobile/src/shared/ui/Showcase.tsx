import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTheme, useThemeControls } from '../theme'
import { AppBar } from './AppBar'
import { AreaChipRow, type AreaChip } from './AreaChipRow'
import { BottomSheet } from './BottomSheet'
import { Brand } from './Brand'
import { Button } from './Button'
import { Card, HelpCard } from './Card'
import { EmptyState } from './EmptyState'
import { InputField } from './InputField'
import { ListRow } from './ListRow'
import { LocationPill } from './LocationPill'
import { PulseDot } from './PulseDot'
import { RadioGroup } from './RadioGroup'
import { SectionTitle, QuickActionGrid, ActionCard } from './SectionTitle'
import { SegmentedTabs } from './SegmentedTabs'
import { Skeleton } from './Skeleton'
import { StatusBanner } from './StatusBanner'
import { StickyFooter } from './StickyFooter'
import { Toggle } from './Toggle'
import { WizardBadge } from './WizardScreen'

/**
 * The design-system showcase — the visual acceptance surface for the story.
 *
 * Every primitive the story's list names is rendered here, and the whole
 * screen can be flipped between the light and the dark theme so a primitive
 * that only reads in one theme is visible immediately.
 *
 * The screen is deliberately dumb: it takes no props, fetches nothing, and
 * holds no app state. It exists so a regression in one primitive is visible.
 */

const SHOWCASE_PRIMITIVES = [
  'Brand',
  'Button',
  'AppBar',
  'HelpCard',
  'InputField',
  'QuickActionCard',
  'ListRow',
  'Toggle',
  'Chip',
  'SegmentedTabs',
  'StickyFooter',
  'BottomSheet',
  'PulseDot',
  'Skeleton',
] as const

export function Showcase() {
  const theme = useTheme()
  const controls = useThemeControls()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [tab, setTab] = useState('all')
  const [chipId, setChipId] = useState('all')
  const [toggle, setToggle] = useState(true)
  const [text, setText] = useState('')
  const [reason, setReason] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const chips: AreaChip[] = [
    { id: 'all', label: 'All', value: null },
    { id: 'north', label: 'North', value: { division: 'North' } },
    { id: 'south', label: 'South', value: { division: 'South' } },
  ]

  const isDark = theme.colors.isDark

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar
        title="Design system"
        subtitle={isDark ? 'Dark theme' : 'Light theme'}
        onBack={() => router.back()}
        action={{
          icon: isDark ? 'light_mode' : 'dark_mode',
          onPress: controls.toggleTheme,
          accessibilityLabel: isDark ? 'Switch to the light theme' : 'Switch to the dark theme',
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionTitle title="Primitives" />

        <Text style={[styles.note, { color: theme.colors.ink[500] }]}>
          {SHOWCASE_PRIMITIVES.length} primitives · every one rendered in{' '}
          {isDark ? 'dark' : 'light'}
        </Text>

        <View style={styles.block}>
          <Brand name="নগর শিল্ড" tagline="শহরে, সদা সতর্ক" />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>Button</Text>
          <Button label="Primary" onPress={() => {}} />
          <View style={styles.gap} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <View style={styles.gap} />
          <Button label="Large" size="lg" onPress={() => {}} />
          <View style={styles.gap} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>HelpCard</Text>
          <HelpCard
            variant="police"
            title="পুলিশ"
            subtitle="Police"
            englishLabel="Emergency"
            onPress={() => {}}
          />
          <View style={styles.gap} />
          <HelpCard
            variant="medical"
            title="স্বাস্থ্য সেবা"
            subtitle="Medical"
            englishLabel="Emergency"
            onPress={() => {}}
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>InputField</Text>
          <InputField
            label="Phone number"
            value={text}
            onChangeText={setText}
            placeholder="01XXXXXXXXX"
            icon="phone"
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>QuickActionCard</Text>
          <QuickActionGrid>
            <ActionCard icon="campaign" label="Report" sub="অভিযোগ" onPress={() => {}} />
            <ActionCard icon="volunteer_activism" label="Help" tone="green" onPress={() => {}} />
            <ActionCard icon="map" label="Map" tone="sky" onPress={() => {}} />
          </QuickActionGrid>
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>ListRow</Text>
          <Card padded={false}>
            <ListRow
              title="Share my location"
              subtitle="Turn on to share"
              icon="my_location"
              tone="purple"
            />
            <ListRow title="Emergency contacts" icon="contact_phone" tone="red" showArrow />
          </Card>
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>Toggle</Text>
          <View style={styles.inline}>
            <Toggle value={toggle} onValueChange={setToggle} accessibilityLabel="Auto-refresh" />
            <Text style={[styles.inlineText, { color: theme.colors.ink[700] }]}>Auto-refresh</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>Chip</Text>
          <AreaChipRow chips={chips} activeId={chipId} onSelect={(c) => setChipId(c.id)} />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>SegmentedTabs</Text>
          <SegmentedTabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
            ]}
            activeId={tab}
            onSelect={setTab}
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>RadioGroup</Text>
          <RadioGroup
            options={[
              { id: 'police', label: 'Police' },
              { id: 'medical', label: 'Medical' },
            ]}
            selectedId={reason}
            onSelect={setReason}
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>PulseDot</Text>
          <View style={styles.inline}>
            <PulseDot />
            <Text style={[styles.inlineText, { color: theme.colors.ink[700] }]}>Live</Text>
            <PulseDot paused />
            <Text style={[styles.inlineText, { color: theme.colors.ink[700] }]}>Paused</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>Skeleton</Text>
          <View style={styles.gap} />
          <Skeleton height={18} />
          <View style={styles.gap} />
          <Skeleton width="60%" height={13} />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>StatusBanner</Text>
          <StatusBanner
            tone="saved"
            title="Two reports are queued"
            body="They will be sent when the network returns."
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>LocationPill</Text>
          <LocationPill label="Mohammadpur" />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>EmptyState</Text>
          <EmptyState
            icon="inbox"
            title="No alerts yet"
            description="When a citizen reports an incident, it appears here."
            action={{ label: 'Refresh', onPress: () => {} }}
          />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>WizardBadge</Text>
          <WizardBadge />
          <View style={styles.gap} />
          <WizardBadge icon="check" tone="success" />
        </View>

        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>BottomSheet</Text>
          <Button
            label="Open the bottom sheet"
            variant="secondary"
            onPress={() => setSheetOpen(true)}
          />
        </View>
      </ScrollView>

      <StickyFooter>
        <Button label="Primary action" onPress={() => {}} />
      </StickyFooter>

      <BottomSheet
        visible={sheetOpen}
        title="Bottom sheet"
        helper="The sheet's helper line."
        onClose={() => setSheetOpen(false)}
      >
        <Text style={{ color: theme.colors.ink[700], fontSize: 14 }}>The sheet body.</Text>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  block: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  note: {
    paddingHorizontal: 20,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 16,
  },
  gap: {
    height: 10,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineText: {
    fontSize: 13,
  },
})
