import { useState, type ComponentProps, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '../../components/ds/Avatar'
import { Button } from '../../components/ds/Button'
import { Chip, InterestChip } from '../../components/ds/Chip'
import { DateField, type DateParts } from '../../components/ds/DateField'
import { LookingForCard } from '../../components/ds/LookingForCard'
import { Badge, LivePill, PresenceDot, Price, TimeBadge } from '../../components/ds/MonoFamily'
import { ProgressBar } from '../../components/ds/ProgressBar'
import { RadioCard } from '../../components/ds/RadioCard'
import { SearchField } from '../../components/ds/SearchField'
import { SegmentedControl } from '../../components/ds/SegmentedControl'
import { SettingsGroup, SettingsRow } from '../../components/ds/SettingsRow'
import { Stepper } from '../../components/ds/Stepper'
import { TabBar, type Tab } from '../../components/ds/TabBar'
import { TextArea, TextField } from '../../components/ds/TextField'
import { Toggle } from '../../components/ds/Toggle'
import { TopBar } from '../../components/ds/TopBar'
import { Icon } from '../../components/ui/Icon'
import { COLOR, MATERIAL, RADIUS, SIZE, SPACE, TYPE, VENUE_PLATES } from '../../lib/design/tokens'
import type { RoomButtonTarget } from '../../lib/roomButton'

/**
 * Every P1 input in every state it draws, on demand (ROUND3 B4;
 * guidelines/components/<Name>.html).
 *
 * Deep-link `exp+blendn:///preview/ds-p1`. Each cell has a testID
 * (`ds-<component>-<state>`) for a device driver to scroll to and screenshot;
 * cells named `…-live` are interactive, for driving the haptics and the motion.
 *
 * The platform and the accessibility settings are the device's, so drive it
 * twice (iOS, Android) and again with each setting on: Reduce Motion, Reduce
 * Transparency, Increase Contrast (iOS) / high-contrast text (Android), Bold
 * Text (iOS), and the largest text size. The components read them live.
 */
export default function DsP1Preview() {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P1 · inputs</Text>
        <TextFields />
        <TextAreas />
        <DateFields />
        <SearchFields />
        <Chips />
        <Toggles />
        <Segments />
        <RadioCards />
        <LookingFor />
        <Steppers />
        <Progress />
        <TabBars />
        <TopBars />
        <Mono />
      </ScrollView>
    </View>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.cells}>{children}</View>
    </View>
  )
}

/** A labelled stage; `testID` is the cell's. */
function Cell({ label, testID, children, style }: { label: string; testID: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={testID} style={styles.cell}>
      <Text style={styles.caption}>{label}</Text>
      <View style={[styles.stage, style]}>{children}</View>
    </View>
  )
}

const noop = () => {}
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 }

function TextFields() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const states = [
    ['empty', { placeholder: 'you@example.com' }],
    ['filled', { value: 'sam@blendn.app' }],
    ['focused', { value: 'sam@blendn.a', previewState: 'focused' }],
    ['error', { value: 'sam@blendn', error: 'That doesn’t look like an email.' }],
    ['disabled', { value: 'sam@blendn.app', disabled: true }],
    ['hint', { label: 'Age', placeholder: '18 or over', hint: 'Blend’n is for people 18 and over.' }],
    ['counter', { label: 'Crew name', value: 'Nebula', limit: 32 }],
  ] as const
  return (
    <Section title="TextField" note="56 pt surface capsule · focus is the 2 pt white ring · no haptic (H.error is the submit button’s)">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-textfield-${state}`}>
          <TextField label="Email" value="" onChangeText={noop} {...props} />
        </Cell>
      ))}
      <Cell label="secure · eye off" testID="ds-textfield-secure">
        <TextField label="Password" value="hunter2hunter2" onChangeText={noop} secure />
      </Cell>
      <Cell label="secure · eye on (revealed)" testID="ds-textfield-secure-revealed">
        <TextField label="Password" value="hunter2hunter2" onChangeText={noop} secure defaultRevealed />
      </Cell>
      <Cell label="live · type, focus, reveal" testID="ds-textfield-live">
        <TextField testID="ds-textfield-live-email" label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField testID="ds-textfield-live-password" label="Password" value={password} onChangeText={setPassword} placeholder="At least 12 characters" secure error={password && password.length < 12 ? 'Use at least 12 characters.' : undefined} />
      </Cell>
    </Section>
  )
}

const BIO = 'Records, late trains, and arguing about B-sides. Usually at Toit on Fridays.'

function TextAreas() {
  const [bio, setBio] = useState(BIO)
  const states = [
    ['placeholder', { value: '', placeholder: 'Ask me about… the best coffee in the city, a trip I’m planning, or what I’m reading.' }],
    ['filled', { value: BIO }],
    ['focused', { value: BIO, previewState: 'focused' }],
    ['near-cap', { value: `${BIO} `.repeat(6) + 'Also pottery.' }],
    ['error', { value: 'My number is 98…', error: 'Keep contact details out of your bio.' }],
    ['disabled', { value: BIO, disabled: true }],
  ] as const
  return (
    <Section title="TextArea" note="radius 24, 160 minimum · the counter in the label row, amber in the last 40 · nothing buzzes">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-textarea-${state}`}>
          <TextArea label="About me" onChangeText={noop} limit={500} {...props} />
        </Cell>
      ))}
      <Cell label="a crew’s line · 72 minimum" testID="ds-textarea-short">
        <TextArea label="A line about the crew" value="Friday people. Loud ones." onChangeText={noop} limit={140} minHeight={72} />
      </Cell>
      <Cell label="live" testID="ds-textarea-live">
        <TextArea testID="ds-textarea-live-input" label="About me" value={bio} onChangeText={setBio} limit={500} />
      </Cell>
    </Section>
  )
}

function DateFields() {
  const [dob, setDob] = useState<DateParts>(['', '', ''])
  const states = [
    ['empty', { value: ['', '', ''] }],
    ['day-focused', { value: ['', '', ''], previewFocus: 0 }],
    ['month-focused', { value: ['14', '', ''], previewFocus: 1 }],
    ['filled', { value: ['14', '03', '1998'] }],
    ['invalid', { value: ['31', '02', '1998'], invalid: true }],
    ['under-18', { value: ['14', '03', '2012'], error: 'Blend’n is for people 18 and over.' }],
    ['disabled', { value: ['14', '03', '1998'], disabled: true }],
  ] as const
  return (
    <Section title="DateField" note="DD · MM · YYYY at 1 : 1 : 1.5 · focus moves on when a box is full">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-datefield-${state}`}>
          <DateField label="Date of birth" onChange={noop} {...props} />
        </Cell>
      ))}
      <Cell label="live" testID="ds-datefield-live">
        <DateField testID="ds-datefield-live-input" label="Date of birth" value={dob} onChange={setDob} />
      </Cell>
    </Section>
  )
}

function SearchFields() {
  const [q, setQ] = useState('')
  const states = [
    ['rest', { value: '' }],
    ['focused', { value: '', previewState: 'focused' }],
    ['typing', { value: 'jazz', busy: true }],
    ['filled', { value: 'jazz' }],
    ['disabled', { value: '', disabled: true }],
  ] as const
  return (
    <Section title="SearchField" note="48 pt, 8% white + 38% hairline, never glass · silent · Android in a sheet: surfaceSunken">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-searchfield-${state}`} style={styles.plate}>
          <SearchField placeholder="Search events…" onChangeText={noop} {...props} />
        </Cell>
      ))}
      <Cell label="in a sheet" testID="ds-searchfield-sheet" style={styles.surface}>
        <SearchField placeholder="Search cities" value="" onChangeText={noop} inSheet />
      </Cell>
      <Cell label="live · with the filter button" testID="ds-searchfield-live" style={[styles.plate, styles.row]}>
        <View style={styles.grow}>
          <SearchField testID="ds-searchfield-live-input" placeholder="Search events…" value={q} onChangeText={setQ} resultsLabel={q ? '12 events' : undefined} />
        </View>
        <FilterButton count={2} />
      </Cell>
    </Section>
  )
}

/** The Pulse's filter button beside the search (a stand-in: a 48 pt 8% disc with its count). */
function FilterButton({ count }: { count: number }) {
  return (
    <View style={styles.filter}>
      <Icon name="sliders-horizontal" />
      <View style={styles.filterBadge}>
        <Badge text={count} ring={COLOR.ink} />
      </View>
    </View>
  )
}

const INTERESTS = ['Live music', 'Vinyl', 'Techno', 'Jazz', 'Indie', 'Carnatic']
const CAP = 3

function Chips() {
  const [picked, setPicked] = useState<string[]>(['Live music', 'Vinyl'])
  const [filters, setFilters] = useState(['This weekend', 'Free'])
  const states = [
    ['off', {}],
    ['on', { selected: true }],
    ['pressed', { previewState: 'pressed' }],
    ['pressed-on', { selected: true, previewState: 'pressed' }],
    ['focused', { previewState: 'focused' }],
    ['dimmed', { dimmed: true, capHint: 'Up to 10' }],
    ['disabled', { disabled: true }],
    ['icon', { icon: 'music-2' }],
  ] as const
  return (
    <Section title="Chip · InterestChip" note="H.select on every change · dimmed at the cap, never hidden · Android: ripple and an 8 dp corner">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-chip-${state}`} style={styles.row}>
          <Chip label="Live music" onPress={noop} {...props} />
        </Cell>
      ))}
      <Cell label="filters · × removes (live)" testID="ds-chip-filter" style={styles.row}>
        {filters.map((f) => (
          <Chip key={f} label={f} selected onRemove={() => setFilters((all) => all.filter((x) => x !== f))} />
        ))}
      </Cell>
      <Cell label={`live · ${picked.length} of ${CAP}`} testID="ds-chip-live" style={styles.row}>
        {INTERESTS.map((t) => {
          const on = picked.includes(t)
          return (
            <Chip
              key={t}
              label={t}
              selected={on}
              dimmed={!on && picked.length >= CAP}
              capHint={`Up to ${CAP}`}
              onPress={() => setPicked((all) => (on ? all.filter((x) => x !== t) : [...all, t]))}
            />
          )
        })}
      </Cell>
      <Cell label="InterestChip · 2 shared" testID="ds-chip-interest" style={styles.row}>
        {['Live music', 'Design', 'Filter coffee', 'Trekking', 'Vinyl', 'Street food'].map((t, i) => (
          <InterestChip key={t} label={t} shared={i === 0 || i === 4} />
        ))}
      </Cell>
    </Section>
  )
}

function Toggles() {
  const [on, setOn] = useState(true)
  const [rows, setRows] = useState({ updates: true, likes: false })
  const states = [
    ['default', {}],
    ['pressed', { previewState: 'pressed' }],
    ['focused', { previewState: 'focused' }],
    ['disabled', { disabled: true }],
  ] as const
  return (
    <Section title="Toggle" note="on: white track, ink thumb (F1) · H.toggle · M.snap travel, Reduce Motion jumps · Android: Material’s outline and 16 → 24 → 28 thumb">
      {states.map(([state, props]) => (
        <Cell key={state} label={`${state} · off, on`} testID={`ds-toggle-${state}`} style={styles.row}>
          <Toggle value={false} accessibilityLabel="Off" {...props} />
          <Toggle value accessibilityLabel="On" {...props} />
        </Cell>
      ))}
      <Cell label="live" testID="ds-toggle-live" style={styles.row}>
        <Toggle testID="ds-toggle-live-switch" value={on} onValueChange={setOn} accessibilityLabel="Event updates" />
      </Cell>
      <Cell label="in a SettingsRow · busy" testID="ds-toggle-row">
        <SettingsGroup title="Notifications">
          <SettingsRow icon="bell" title="Event updates" hint="Changes to time or venue" trail="switch" value={rows.updates} onValueChange={(v) => setRows((r) => ({ ...r, updates: v }))} />
          <SettingsRow icon="heart" title="Likes and matches" trail="switch" value={rows.likes} onValueChange={(v) => setRows((r) => ({ ...r, likes: v }))} />
          <SettingsRow icon="users" title="Crew messages" trail="switch" value busy />
        </SettingsGroup>
      </Cell>
    </Section>
  )
}

const SIGN_IN = ['Sign in', 'Create account']

function Segments() {
  const [two, setTwo] = useState(0)
  const [three, setThree] = useState(1)
  return (
    <Section title="SegmentedControl" note="solid surface, never glass · the thumb slides on M.snap · H.select when it lands on another">
      <Cell label="live · two" testID="ds-segmented-live">
        <SegmentedControl testID="ds-segmented-live-control" items={SIGN_IN} selected={two} onChange={setTwo} />
      </Cell>
      <Cell label="second selected" testID="ds-segmented-second">
        <SegmentedControl items={SIGN_IN} selected={1} onChange={noop} />
      </Cell>
      <Cell label="pressed · the other dims" testID="ds-segmented-pressed">
        <SegmentedControl items={SIGN_IN} selected={0} onChange={noop} previewPressed={1} />
      </Cell>
      <Cell label="focused" testID="ds-segmented-focused">
        <SegmentedControl items={SIGN_IN} selected={0} onChange={noop} previewState="focused" />
      </Cell>
      <Cell label="disabled · 45%" testID="ds-segmented-disabled">
        <SegmentedControl items={SIGN_IN} selected={1} onChange={noop} disabled />
      </Cell>
      <Cell label="live · three" testID="ds-segmented-three">
        <SegmentedControl items={['Tonight', 'This week', 'Later']} selected={three} onChange={setThree} />
      </Cell>
    </Section>
  )
}

const PHOTO = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256'

function RadioCards() {
  const [named, setNamed] = useState(false)
  const pair = (a: object, b: object) => (
    <>
      <RadioCard title="Anonymous" hint="Nobody here sees your name or photo." avatar={<Avatar kind="creature" pseudonym="Night Cat" size={56} />} onPress={noop} {...a} />
      <RadioCard title="Named" hint="People here see your name and photo." avatar={<Avatar kind="photo" uri={PHOTO} size={56} />} onPress={noop} {...b} />
    </>
  )
  return (
    <Section title="RadioCard" note="the 2 pt white ring and the check disc · H.select on a change · Android: no ripple, the ring is the feedback">
      <Cell label="live" testID="ds-radiocard-live" style={styles.pair}>
        {pair({ selected: !named, onPress: () => setNamed(false), testID: 'ds-radiocard-live-anon' }, { selected: named, onPress: () => setNamed(true), testID: 'ds-radiocard-live-named' })}
      </Cell>
      <Cell label="pressed" testID="ds-radiocard-pressed" style={styles.pair}>
        {pair({ selected: true }, { previewState: 'pressed' })}
      </Cell>
      <Cell label="focused" testID="ds-radiocard-focused" style={styles.pair}>
        {pair({ selected: true }, { previewState: 'focused' })}
      </Cell>
      <Cell label="disabled · blocked, with the reason" testID="ds-radiocard-disabled" style={styles.pair}>
        {pair({ selected: true }, { disabled: true, hint: 'Add a photo to your profile first. That’s what other people would see.' })}
      </Cell>
      <Cell label="the glyph form" testID="ds-radiocard-glyph" style={styles.pair}>
        <RadioCard title="I have space" hint="You’re offering a ride or a table." icon="car" selected onPress={noop} />
        <RadioCard title="I’m looking" hint="You want to join someone’s." icon="hand" onPress={noop} />
      </Cell>
    </Section>
  )
}

const LOOKING = [
  ['Dating', require('../../assets/onboarding/looking-dating.jpg')],
  ['Friendship', require('../../assets/onboarding/looking-friendship.jpg')],
  ['Networking', require('../../assets/onboarding/looking-networking.jpg')],
  ['Just here', require('../../assets/onboarding/looking-open.jpg')],
] as const

function LookingFor() {
  const [picked, setPicked] = useState<string[]>(['Friendship', 'Networking'])
  const grid = (minor: boolean) =>
    LOOKING.filter(([word]) => !(minor && word === 'Dating')).map(([word, art]) => {
      const on = picked.includes(word)
      return (
        <View key={word} style={styles.half}>
          <LookingForCard label={word} image={art} selected={on} onPress={() => setPicked((all) => (on ? all.filter((x) => x !== word) : [...all, word]))} />
        </View>
      )
    })
  const one = (props: object) => <LookingForCard label="Friendship" image={LOOKING[1][1]} onPress={noop} {...props} />
  return (
    <Section title="LookingForCard" note="112 pt photo tiles, multi-select · H.select · under 18 the Dating tile is not drawn">
      <Cell label="live · the five" testID="ds-lookingfor-live" style={styles.grid}>
        {grid(false)}
      </Cell>
      <Cell label="under 18 · four" testID="ds-lookingfor-minor" style={styles.grid}>
        {grid(true)}
      </Cell>
      {(
        [
          ['pressed', { previewState: 'pressed' }],
          ['focused', { previewState: 'focused' }],
          ['disabled', { disabled: true, selected: true }],
        ] as const
      ).map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-lookingfor-${state}`} style={styles.grid}>
          <View style={styles.half}>{one(props)}</View>
        </Cell>
      ))}
    </Section>
  )
}

function Steppers() {
  const [n, setN] = useState(2)
  const row = (props: Partial<ComponentProps<typeof Stepper>>) => (
    <View style={styles.spread}>
      <Text style={styles.body}>Spaces</Text>
      <Stepper label="Spaces" value={2} onChange={noop} {...props} />
    </View>
  )
  return (
    <Section title="Stepper" note="H.select per step, none at a bound · one adjustable element · iOS glass sheet: 8% discs, Android: surfaceSunken">
      <Cell label="live · on glass" testID="ds-stepper-live" style={styles.plate}>
        {row({ value: n, onChange: setN, onGlass: true, testID: 'ds-stepper-live-control' })}
      </Cell>
      <Cell label="at the floor" testID="ds-stepper-floor" style={styles.plate}>
        {row({ value: 1, onGlass: true })}
      </Cell>
      <Cell label="at the ceiling" testID="ds-stepper-ceiling" style={styles.plate}>
        {row({ value: 20, onGlass: true })}
      </Cell>
      <Cell label="pressed · plus" testID="ds-stepper-pressed" style={styles.plate}>
        {row({ onGlass: true, previewState: 'pressed-plus' })}
      </Cell>
      <Cell label="disabled · while posting" testID="ds-stepper-disabled" style={styles.plate}>
        {row({ onGlass: true, disabled: true })}
      </Cell>
      <Cell label="on a solid sheet" testID="ds-stepper-solid" style={styles.surface}>
        {row({})}
      </Cell>
    </Section>
  )
}

function Progress() {
  const [step, setStep] = useState(3)
  return (
    <Section title="ProgressBar" note="4 pt, white on surfaceSunken · grows on M.settle after 200 ms; Reduce Motion jumps · hidden from screen readers">
      {[1, 2, 4, 6, 8].map((s) => (
        <Cell key={s} label={`step ${s} of 5`} testID={`ds-progress-${s}`}>
          <Counter step={s} />
          <ProgressBar progress={s / 8} />
        </Cell>
      ))}
      <Cell label="live" testID="ds-progress-live">
        <Counter step={step} />
        <ProgressBar testID="ds-progress-live-bar" progress={step / 8} />
        <Button testID="ds-progress-next" label="Next step" kind="secondary" size="md" onPress={() => setStep((s) => (s % 8) + 1)} />
      </Cell>
    </Section>
  )
}

/** The header's "Step n of 5", which is what a screen reader hears. */
function Counter({ step }: { step: number }) {
  return <Text style={styles.counter}>{`Step ${step} of 5`}</Text>
}

const IDLE: RoomButtonTarget = { state: 'idle', eventId: null, badge: 0 }
const LIVE_UNREAD: RoomButtonTarget = { state: 'live', eventId: 'e1', badge: 3 }

function TabBars() {
  const [tab, setTab] = useState<Tab>('pulse')
  const bar = (id: string, selected: Tab, target: RoomButtonTarget = IDLE, onSelect: (t: Tab) => void = noop) => (
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <TabBar
        selected={selected}
        onSelect={onSelect}
        disc={{ target, onPress: noop, venue: 'Toit', testID: `ds-tabbar-${id}-disc` }}
        mePhoto={PHOTO}
        testID={`ds-tabbar-${id}-bar`}
      />
    </SafeAreaInsetsContext.Provider>
  )
  return (
    <Section title="TabBar" note="no haptic on a tab switch (§10, §13) · iOS: 22% pill · Android: 56 × 32 indicator, solid tier">
      <Cell label="live" testID="ds-tabbar-live" style={styles.barStage}>
        {bar('live', tab, IDLE, setTab)}
      </Cell>
      {(['pulse', 'going', 'me'] as const).map((t) => (
        <Cell key={t} label={t} testID={`ds-tabbar-${t}`} style={styles.barStage}>
          {bar(t, t)}
        </Cell>
      ))}
      <Cell label="banter · 3 unread on the disc" testID="ds-tabbar-banter" style={styles.barStage}>
        {bar('banter', 'banter', LIVE_UNREAD)}
      </Cell>
    </Section>
  )
}

function TopBars() {
  const states = [
    ['rest', { title: 'Edit profile' }],
    ['scrolled', { title: 'Edit profile', state: 'scrolled' }],
    ['condensed', { title: 'Edit profile', state: 'condensed' }],
    ['actions', { title: 'Friends', actions: [{ icon: 'user-plus', label: 'Add a friend', onPress: noop }] }],
    ['save', { title: 'Edit profile', save: { onPress: noop } }],
    ['saving', { title: 'Edit profile', save: { onPress: noop, saving: true } }],
    ['sub', { title: 'Nebula', sub: '4 people · 2 here now', actions: [{ icon: 'ellipsis', label: 'More', onPress: noop }] }],
    [
      'long-title',
      {
        title: 'The Very Long Festival of Independent Bengaluru Bands',
        actions: [
          { icon: 'share', label: 'Share', onPress: noop },
          { icon: 'ellipsis', label: 'More', onPress: noop },
        ],
      },
    ],
  ] as const
  return (
    <Section title="TopBar" note="no bar at rest · the bar glass mounted once scrolled (glass never fades) · back is silent, Save plays H.primary">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-topbar-${state}`} style={[styles.topStage, state === 'scrolled' || state === 'condensed' ? styles.plate : null]}>
          <SafeAreaInsetsContext.Provider value={NO_INSETS}>
            <TopBar onBack={noop} {...props} />
          </SafeAreaInsetsContext.Provider>
        </Cell>
      ))}
    </Section>
  )
}

function Mono() {
  return (
    <Section title="The Geist Mono family" note="on the 12 pt floor · white, the live green, or the scrim pill · none tappable, none plays">
      <Cell label="badge · 18 on an icon" testID="ds-mono-badge-18" style={[styles.row, styles.plate]}>
        {[1, 2, 12].map((n) => (
          <FilterButton key={n} count={n} />
        ))}
      </Cell>
      <Cell label="badge · 22 as a label" testID="ds-mono-badge-22" style={styles.row}>
        <Badge text="3 new" size={22} />
        <Badge text="99+" size={22} />
      </Cell>
      <Cell label="presence · unread, live, on a face" testID="ds-mono-presence" style={styles.row}>
        <PresenceDot />
        <PresenceDot kind="live" />
        <View>
          <Avatar kind="photo" uri={PHOTO} size={56} />
          <View style={styles.faceDot}>
            <PresenceDot kind="live" size={12} ring={COLOR.ink} />
          </View>
        </View>
      </Cell>
      <Cell label="live pill · the four buckets" testID="ds-mono-livepill" style={[styles.row, styles.plate]}>
        {['Under 5 live', '5–9 live', '10–19 live', '20+ live'].map((t) => (
          <LivePill key={t} text={t} />
        ))}
      </Cell>
      <Cell label="time badge" testID="ds-mono-timebadge" style={[styles.row, styles.plate]}>
        {['Live', '9 PM', '10:30 PM', 'In 25 min', '42:00'].map((t) => (
          <TimeBadge key={t} when={t} />
        ))}
      </Cell>
      <Cell label="price · lg · md · sm · free" testID="ds-mono-price" style={styles.rowEnd}>
        <Price amount="₹199" per="/ month" size="lg" />
        <Price amount="₹49" per="tonight" />
        <Price amount="₹199" size="sm" />
        <Price amount="Free" size="sm" />
      </Cell>
    </Section>
  )
}

/** The narrowest supported phone (360 dp), so a cell shows what wraps. */
const CELL_WIDTH = 360
const BAR_STAGE = 120
const TOP_STAGE = 96

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  note: { ...TYPE.meta, color: COLOR.textSecondary },
  body: { ...TYPE.bodyStrong, color: COLOR.textPrimary },
  counter: { ...TYPE.label, color: COLOR.textSecondary, textAlign: 'center' },
  cells: { gap: SPACE.lg },
  cell: { gap: SPACE.sm, maxWidth: CELL_WIDTH },
  caption: { ...TYPE.label, color: COLOR.textTertiary },
  stage: {
    borderRadius: RADIUS.rowInCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
  rowEnd: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: SPACE.xl },
  pair: { flexDirection: 'row', gap: SPACE.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  half: { width: '47%' },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grow: { flex: 1 },
  plate: { backgroundColor: VENUE_PLATES.club[0] },
  surface: { backgroundColor: COLOR.surface },
  filter: {
    width: SIZE.control,
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: { position: 'absolute', right: -SPACE.xxs, top: -SPACE.xxs },
  faceDot: { position: 'absolute', right: 0, bottom: 0 },
  barStage: { height: BAR_STAGE, padding: 0, backgroundColor: VENUE_PLATES.club[0] },
  topStage: { height: TOP_STAGE, padding: 0 },
})
