import { useEffect, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AmenityGrid, AmenityTile } from '../../components/ds/AmenityTile'
import { Avatar } from '../../components/ds/Avatar'
import { Button } from '../../components/ds/Button'
import { DayHeading } from '../../components/ds/DayHeading'
import { EventCard } from '../../components/ds/EventCard'
import { FaceMark, Facepile, type Face } from '../../components/ds/Facepile'
import { GridFace } from '../../components/ds/GridFace'
import { HoldToConfirm } from '../../components/ds/HoldToConfirm'
import { MapCard, MapCluster, MapPin } from '../../components/ds/MapCard'
import { MeetNextCard } from '../../components/ds/MeetNextCard'
import { PersonCard, PersonCardContent, type PersonCardContentProps, type PersonCardPerson, type PersonState } from '../../components/ds/PersonCard'
import { RevealBar } from '../../components/ds/RevealBar'
import { RollingNumber } from '../../components/ds/RollingNumber'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { TimeRing } from '../../components/ds/TimeRing'
import { TonightCard, type DeckEvent } from '../../components/ds/TonightCard'
import { DoorCode, VenuePass } from '../../components/ds/VenuePass'
import { Material } from '../../components/ui/Material'
import { COLOR, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'

/**
 * Every P2 component in every state it draws, on demand (ROUND3 B4;
 * guidelines/components/<Name>.html).
 *
 * Deep-link `exp+blendn:///preview/ds-p2`. Each cell has a testID
 * (`ds-<component>-<state>`) for a device driver to scroll to and screenshot;
 * cells named `…-live` are interactive, for driving the haptics and the motion
 * (the hold's ticks and commit, the deck's swipe, the roll, the PersonCard).
 *
 * The platform and the accessibility settings are the device's, so drive it
 * twice (iOS, Android) and again with each setting on: Reduce Motion, Reduce
 * Transparency, Increase Contrast (iOS) / high-contrast text (Android), Bold
 * Text (iOS), and the largest text size. The components read them live.
 */
export default function DsP2Preview() {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P2 · events and people</Text>
        <Amenities />
        <EventCards />
        <Tonight />
        <DayHeadings />
        <SectionHeaders />
        <Facepiles />
        <GridFaces />
        <MeetNext />
        <Holds />
        <VenuePasses />
        <DoorCodes />
        <Maps />
        <PersonCards />
        <RollingNumbers />
        <RevealBars />
        <TimeRings />
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
const COVER = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800'
const COVER_2 = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800'
const PHOTO = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256'
const PHOTO_2 = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256'

const photo = (uri: string): Face => ({ kind: 'photo', uri })
const creature = (pseudonym: string): Face => ({ kind: 'creature', pseudonym })
const FACES: Face[] = [photo(PHOTO_2), creature('Cosmic Panda'), creature('Quiet Heron'), photo(PHOTO), creature('Night Cat'), creature('Velvet Otter')]

const VINYL = { title: 'Vinyl Night', time: '9 PM', venue: 'Toit', distance: '1.2 km', going: 42, cover: COVER }
const OPEN_MIC = { title: 'Open mic · late set', time: 'Live', venue: 'The Courtyard', distance: '800 m', going: 18, cover: COVER_2 }
const QUIZ = { title: 'Pub quiz', time: 'In 25 min', venue: 'Arbor', distance: '2.4 km', going: 9 }

function Amenities() {
  return (
    <Section title="AmenityTile" note="76 pt surface tile · Geist Mono label · mono for numbers and times · 2-up, 12 pt gutters · no haptic">
      <Cell label="label + mono value" testID="ds-amenity-mono">
        <AmenityTile label="DOORS" value="8:30 PM" mono />
      </Cell>
      <Cell label="label + words" testID="ds-amenity-words">
        <AmenityTile label="WHERE" value="Toit, Indiranagar" />
      </Cell>
      <Cell label="a count" testID="ds-amenity-count">
        <AmenityTile label="GOING" value="42" mono />
      </Cell>
      <Cell label="with an icon" testID="ds-amenity-icon">
        <AmenityTile label="OUTDOOR SEATING" value="Yes" icon="tree-palm" />
      </Cell>
      <Cell label="long value truncates" testID="ds-amenity-truncates">
        <AmenityTile label="WHERE" value="The Very Long Festival Grounds, Whitefield" />
      </Cell>
      <Cell label="pushes (Where → the map) · a button" testID="ds-amenity-push">
        <AmenityTile label="WHERE" value="Toit, Indiranagar" onPress={noop} />
      </Cell>
      <Cell label="the Scene bento" testID="ds-amenity-grid">
        <AmenityGrid
          tiles={[
            { label: 'DOORS', value: '8:30 PM', mono: true },
            { label: 'WHERE', value: 'Toit, Indiranagar' },
            { label: 'GOING', value: '42', mono: true },
            { label: 'DOOR', value: '18+ · ID' },
          ]}
        />
      </Cell>
      <Cell label="one amenity · full width" testID="ds-amenity-one">
        <AmenityGrid tiles={[{ label: 'HERE TONIGHT', value: 'Rooftop', icon: 'trees' }]} />
      </Cell>
      <Cell label="7+ · the +N tile expands" testID="ds-amenity-fold">
        <AmenityGrid
          tiles={['Rooftop', 'Live band', 'Cocktails', 'Board games', 'Card payments', 'Parking', 'Dance floor', 'Late kitchen'].map((value) => ({
            label: 'HERE TONIGHT',
            value,
          }))}
        />
      </Cell>
    </Section>
  )
}

function EventCards() {
  return (
    <Section title="EventCard" note="hero 32 · compact 24 · row · words on the photo over the 62% scrim · a push: no haptic">
      <Cell label="hero" testID="ds-eventcard-hero">
        <EventCard kind="hero" {...OPEN_MIC} onPress={noop} style={styles.heroCard} />
      </Cell>
      <Cell label="compact · 240 × 170" testID="ds-eventcard-compact">
        <EventCard kind="compact" {...VINYL} onPress={noop} />
      </Cell>
      <Cell label="row" testID="ds-eventcard-row">
        <EventCard kind="row" {...VINYL} onPress={noop} />
        <EventCard kind="row" {...QUIZ} onPress={noop} />
      </Cell>
      <Cell label="saved · the ribbon" testID="ds-eventcard-saved">
        <EventCard kind="compact" {...VINYL} saved="9 PM" onPress={noop} />
      </Cell>
      <Cell label="pressed (iOS scale · Android ripple)" testID="ds-eventcard-pressed">
        <EventCard kind="compact" {...VINYL} previewState="pressed" onPress={noop} />
      </Cell>
      <Cell label="focused" testID="ds-eventcard-focused">
        <EventCard kind="compact" {...VINYL} previewState="focused" onPress={noop} />
      </Cell>
      <Cell label="row · pressed" testID="ds-eventcard-row-pressed">
        <EventCard kind="row" {...VINYL} previewState="pressed" onPress={noop} />
      </Cell>
      <Cell label="360 dp · two compacts, 158 each" testID="ds-eventcard-360">
        <View style={styles.pair}>
          <EventCard kind="compact" {...VINYL} onPress={noop} style={styles.narrowCard} />
          <EventCard kind="compact" {...OPEN_MIC} onPress={noop} style={styles.narrowCard} />
        </View>
      </Cell>
    </Section>
  )
}

const DECK: DeckEvent[] = [VINYL, OPEN_MIC, QUIZ]

function Tonight() {
  const [index, setIndex] = useState(0)
  const deck = (events: DeckEvent[], extra: { previewState?: 'pressed' } = {}) => (
    <TonightCard events={events} index={0} onIndexChange={noop} onOpen={noop} width={DECK_WIDTH} height={DECK_HEIGHT} {...extra} />
  )
  return (
    <Section title="TonightCard" note="the hero card with a 2 pt ink outline · two fanned back-cards · pips · H.select as a swiped card settles">
      <Cell label="one card · no fan" testID="ds-tonight-one">
        {deck(DECK.slice(0, 1))}
      </Cell>
      <Cell label="two" testID="ds-tonight-two">
        {deck(DECK.slice(0, 2))}
      </Cell>
      <Cell label="three" testID="ds-tonight-three">
        {deck(DECK)}
      </Cell>
      <Cell label="saved · the ribbon" testID="ds-tonight-saved">
        {deck([{ ...VINYL, saved: '9 PM' }, OPEN_MIC, QUIZ])}
      </Cell>
      <Cell label="pressed" testID="ds-tonight-pressed">
        {deck(DECK, { previewState: 'pressed' })}
      </Cell>
      <Cell label="live · swipe it" testID="ds-tonight-live">
        <TonightCard events={DECK} index={index} onIndexChange={setIndex} onOpen={noop} width={DECK_WIDTH} height={DECK_HEIGHT} testID="ds-tonight-live-deck" />
      </Cell>
    </Section>
  )
}

function DayHeadings() {
  return (
    <Section title="DayHeading" note="the date at 17 in 700 · the weekday in meta · a heading, never sticky">
      <Cell label="a date" testID="ds-dayheading-date">
        <DayHeading date="Sat 4 Oct" weekday="Saturday" accessibilityLabel="Saturday 4 October" />
      </Cell>
      <Cell label="today" testID="ds-dayheading-today">
        <DayHeading date="Today" weekday="Friday" />
      </Cell>
      <Cell label="tomorrow" testID="ds-dayheading-tomorrow">
        <DayHeading date="Tomorrow" weekday="Saturday" />
      </Cell>
      <Cell label="next month" testID="ds-dayheading-nextmonth">
        <DayHeading date="Sun 2 Nov" weekday="Sunday" />
      </Cell>
      <Cell label="in a list" testID="ds-dayheading-list">
        <DayHeading date="Sat 4 Oct" weekday="Saturday" />
        <EventCard kind="row" {...VINYL} onPress={noop} />
        <EventCard kind="row" {...QUIZ} onPress={noop} />
        <DayHeading date="Sun 5 Oct" weekday="Sunday" />
        <EventCard kind="row" {...OPEN_MIC} onPress={noop} />
      </Cell>
    </Section>
  )
}

function SectionHeaders() {
  const states = [
    ['title', { title: 'Tonight' }],
    ['count', { title: 'Everyone here', count: 14 }],
    ['action', { title: 'Tonight', action: { label: 'See all', onPress: noop } }],
    ['count-action', { title: 'Interests', count: 6, action: { label: 'Edit', onPress: noop } }],
    ['caption', { title: 'Orientation', caption: 'Select all that apply to you — up to three.' }],
    ['live', { title: 'Live now', live: true }],
    ['busy', { title: 'Tonight', action: { label: 'Saving…', onPress: noop, busy: true } }],
    ['long', { title: 'People you might have missed tonight', count: 14, action: { label: 'See all', onPress: noop } }],
  ] as const
  return (
    <Section title="SectionHeader" note="heading 20 · “· N” in Geist Mono · the action 700 14 white (R3) · silent">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-section-${state}`}>
          <SectionHeader {...props} />
        </Cell>
      ))}
      <Cell label="a built right slot" testID="ds-section-slot">
        <SectionHeader
          title="Crews here"
          count={2}
          right={
            <View style={styles.row}>
              <Text style={styles.note}>Liking as</Text>
              <Avatar kind="creature" pseudonym="Night Cat" size={24} />
            </View>
          }
        />
      </Cell>
    </Section>
  )
}

function Facepiles() {
  return (
    <Section title="Facepile" note="up to 5 at 32 · 8 pt overlap · ink cut-out ring · “+N” · one element · never tappable">
      <Cell label="3 · no overflow" testID="ds-facepile-three">
        <Facepile faces={FACES.slice(0, 3)} />
      </Cell>
      <Cell label="5 + N" testID="ds-facepile-overflow">
        <Facepile faces={FACES} total={14} />
      </Cell>
      <Cell label="an arrival · the white ring" testID="ds-facepile-arrival">
        <Facepile faces={FACES} total={14} highlight={0} />
      </Cell>
      <Cell label="creatures only" testID="ds-facepile-creatures">
        <Facepile faces={FACES.filter((f) => f.kind === 'creature')} />
      </Cell>
      <Cell label="size 24" testID="ds-facepile-24">
        <Facepile faces={FACES} size={24} total={9} />
      </Cell>
      <Cell label="size 40" testID="ds-facepile-40">
        <Facepile faces={FACES.slice(0, 4)} size={40} />
      </Cell>
      <Cell label="on a card · the ring takes its colour" testID="ds-facepile-surface" style={styles.surface}>
        <Facepile faces={FACES} total={14} ring={COLOR.surface} />
      </Cell>
      <Cell label="FaceMark · liked · matched · requested" testID="ds-facemark-all" style={styles.row}>
        <FaceMark kind="liked" />
        <FaceMark kind="matched" />
        <FaceMark kind="requested" />
      </Cell>
    </Section>
  )
}

const COLUMN = 110
const COLUMN_360 = 96
const NOVA = { face: photo(PHOTO_2), name: 'Priya', reason: 'Both into vinyl' }

function GridFaces() {
  const marks = [
    ['here', {}],
    ['liked', { liked: true }],
    ['matched', { matched: true }],
    ['away', { here: false }],
    ['pressed', { previewState: 'pressed' }],
    ['focused', { previewState: 'focused' }],
  ] as const
  return (
    <Section title="GridFace" note="the column less 16 · here (live dot), liked (heart), matched (message) · away at 60% · silent tap">
      {marks.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-gridface-${state}`}>
          <GridFace {...NOVA} width={COLUMN} onPress={noop} {...props} />
        </Cell>
      ))}
      <Cell label="the grid · 3 across at 402" testID="ds-gridface-grid">
        <SectionHeader title="Everyone here" count={14} />
        <View style={styles.grid}>
          {FACES.map((face, i) => (
            <GridFace key={i} face={face} name={['Priya', 'Cosmic Panda', 'Quiet Heron', 'Sam', 'Night Cat', 'Velvet Otter'][i]} reason="Both into vinyl" width={COLUMN_360} liked={i === 1} here={i !== 5} onPress={noop} />
          ))}
        </View>
      </Cell>
    </Section>
  )
}

function MeetNext() {
  const states = [
    ['default', {}],
    ['liked', { liked: true }],
    ['pressed', { previewState: 'pressed' }],
    ['focused', { previewState: 'focused' }],
  ] as const
  return (
    <Section title="MeetNextCard" note="164 pt surface card · the face at the card less 32 · the liked mark · silent tap">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-meetnext-${state}`}>
          <MeetNextCard {...NOVA} width={COLUMN} onPress={noop} {...props} />
        </Cell>
      ))}
      <Cell label="a creature" testID="ds-meetnext-creature">
        <MeetNextCard face={creature('Cosmic Panda')} name="Cosmic Panda" reason="Here for the music" width={COLUMN} onPress={noop} />
      </Cell>
      <Cell label="the row at 360 · 96 each" testID="ds-meetnext-row-360">
        <View style={styles.pair}>
          <MeetNextCard {...NOVA} width={COLUMN_360} onPress={noop} />
          <MeetNextCard face={creature('Cosmic Panda')} name="Cosmic Panda" reason="Both open to dating" width={COLUMN_360} liked onPress={noop} />
          <MeetNextCard face={photo(PHOTO)} name="Sam" reason="Both at 3 nights before" width={COLUMN_360} onPress={noop} />
        </View>
      </Cell>
    </Section>
  )
}

/** The gallery's stand-in for the server's answer to a check-in. */
const ANSWER_MS = 1500

function Holds() {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => setBusy(false), ANSWER_MS)
    return () => clearTimeout(timer)
  }, [busy])
  const states = [
    ['armed', {}],
    ['25', { previewProgress: 0.25 }],
    ['50', { previewProgress: 0.5 }],
    ['75', { previewProgress: 0.75 }],
    ['100', { previewProgress: 1 }],
    ['disabled', { disabled: true, label: 'Go live when you’re here · 350 m' }],
    ['refused', { refused: true }],
    ['busy', { busy: true, busyLabel: 'Checking you in…' }],
  ] as const
  return (
    <Section title="HoldToConfirm" note="900 ms · H.tick at 25 / 50 / 75 · H.commit at 100 · a release rewinds on M.settle · a screen reader gets one button">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-hold-${state}`}>
          <HoldToConfirm label="Hold to blend in" onConfirm={noop} consequence="Checks you in. Other people at this event will see you." {...props} />
        </Cell>
      ))}
      <Cell label="live · hold it (busy for 1.5 s, then it drains)" testID="ds-hold-live">
        <HoldToConfirm
          label="Hold to blend in"
          srLabel="Check in"
          consequence="Checks you in. Other people at this event will see you."
          busy={busy}
          busyLabel="Checking you in…"
          onConfirm={() => setBusy(true)}
          testID="ds-hold-live-pill"
        />
      </Cell>
    </Section>
  )
}

function VenuePasses() {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => setBusy(false), ANSWER_MS)
    return () => clearTimeout(timer)
  }, [busy])
  const pass = { title: 'Vinyl Night', cover: COVER, hereCount: 14, tasteCount: 4, onConfirm: noop }
  const states = [
    ['armed', {}],
    ['mid', { previewProgress: 0.6 }],
    ['busy', { busy: true }],
    ['refused', { refused: true }],
    ['outside', { disabled: true, holdLabel: 'Go live when you’re here · 350 m', note: 'Walk in and the pass arms itself.' }],
    ['switch', { holdLabel: 'Hold to switch', note: 'Checking in here takes you out of Fandom.' }],
    ['first', { hereCount: 0, tasteCount: 0 }],
  ] as const
  return (
    <Section title="VenuePass" note="the sheet tier (solid on Android) · thumb, You’re here, the count, the tease, the hold, the consequence">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-venuepass-${state}`} style={styles.backdrop}>
          <VenuePass {...pass} {...props} />
        </Cell>
      ))}
      <Cell label="live · hold to check in" testID="ds-venuepass-live" style={styles.backdrop}>
        <VenuePass {...pass} busy={busy} onConfirm={() => setBusy(true)} />
      </Cell>
    </Section>
  )
}

/** The gallery's stand-in for the server's code, turning every 30 s. */
const CODES = ['K7QM2X', 'P4WN8R', 'H3TJ9C', 'Z2MV6Q']
const CODE_MS = 30_000

function DoorCodes() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CODE_MS / 30)
    return () => clearInterval(id)
  }, [])
  const turn = Math.floor(now / CODE_MS)
  return (
    <Section title="DoorCode" note="ROUND3 G3 · staff type the code: no hold on the phone · the 30-second ring and the code change stay under Reduce Motion">
      <Cell label="live · the code turns every 30 s" testID="ds-doorcode-live" style={styles.surface}>
        <DoorCode state="live" code={CODES[turn % CODES.length]} rotatesAt={(turn + 1) * CODE_MS} />
      </Cell>
      <Cell label="offline" testID="ds-doorcode-offline" style={styles.surface}>
        <DoorCode state="offline" />
      </Cell>
      <Cell label="redeemed" testID="ds-doorcode-redeemed" style={styles.surface}>
        <DoorCode state="redeemed" redeemedAt="21:43" />
      </Cell>
      <Cell label="used tonight" testID="ds-doorcode-used" style={styles.surface}>
        <DoorCode state="used" />
      </Cell>
      <Cell label="ended" testID="ds-doorcode-ended" style={styles.surface}>
        <DoorCode state="ended" endedLabel="ENDED SUNDAY" />
      </Cell>
    </Section>
  )
}

/** A stand-in for the map the screen draws (the Scene's MapView): the ground and two roads. */
function Ground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.road, styles.roadA]} />
      <View style={[styles.road, styles.roadB]} />
    </View>
  )
}

function Maps() {
  return (
    <Section title="MapCard · MapPin · MapCluster" note="the 200 pt band · the ember pin at the centre · Open in Maps · pins 10 pt in an ink ring · a cluster zooms, never lists">
      <Cell label="default" testID="ds-mapcard-default">
        <MapCard venue="Toit" map={<Ground />} onPress={noop} />
      </Cell>
      <Cell label="with the address and you" testID="ds-mapcard-address-you">
        <MapCard venue="Toit" address="12th Main, Indiranagar" you map={<Ground />} onPress={noop} />
      </Cell>
      <Cell label="focused" testID="ds-mapcard-focused">
        <MapCard venue="Toit" map={<Ground />} previewState="focused" onPress={noop} />
      </Cell>
      <Cell label="the pin family · event · venue · live · you · selected" testID="ds-mappin-family" style={[styles.row, styles.mapStage]}>
        <MapPin kind="event" />
        <MapPin kind="venue" />
        <MapPin kind="live" />
        <MapPin kind="you" />
        <MapPin kind="event" selected />
        <MapPin kind="event" label="Vinyl Night, 9 PM" onPress={noop} />
      </Cell>
      <Cell label="clusters · 3 · 12 · 120" testID="ds-mapcluster-all" style={[styles.row, styles.mapStage]}>
        <MapCluster count={3} onPress={noop} />
        <MapCluster count={12} onPress={noop} />
        <MapCluster count={120} onPress={noop} />
      </Cell>
    </Section>
  )
}

const PRIYA: PersonCardPerson = {
  face: photo(PHOTO_2),
  name: 'Priya',
  age: 27,
  reason: 'Both open to dating',
  reasons: ['Both open to dating', 'Both at 3 nights before', 'You both picked Filter coffee over Chai'],
  chips: ['Vinyl', 'Techno', 'Filter coffee'],
}
const HANDLERS = { onLike: noop, onWave: noop, onMessage: noop, onSayHi: noop, onMore: noop, onViewProfile: noop, onClose: noop }

/** The L3 sheet, drawn in place (the live cell opens the real one). */
function SheetFrame({ children }: { children: ReactNode }) {
  return (
    <View style={styles.sheetFrame}>
      <Material role="sheet" style={[StyleSheet.absoluteFill, styles.sheetRadius]} />
      <View style={styles.handle} />
      {children}
    </View>
  )
}

function PersonCards() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<PersonState>('none')
  useEffect(() => {
    if (state !== 'waveBusy') return
    const timer = setTimeout(() => setState('waved'), ANSWER_MS)
    return () => clearTimeout(timer)
  }, [state])
  const cards: [string, Partial<PersonCardContentProps>][] = [
    ['here', { variant: 'here' }],
    ['was', { variant: 'was' }],
    ['pre', { variant: 'pre' }],
    ['matched', { variant: 'matched' }],
    ['friend', { variant: 'friend' }],
    ['gone', { variant: 'gone' }],
    ['thin', { variant: 'thin', person: { face: creature('Cosmic Panda'), name: 'Cosmic Panda', age: 27, city: 'Bengaluru' } }],
    ['liked', { variant: 'here', state: 'liked' }],
    ['requested', { variant: 'here', state: 'requested' }],
    ['wavebusy', { variant: 'here', state: 'waveBusy' }],
    ['waved', { variant: 'here', state: 'waved' }],
    ['wavedatyou', { variant: 'here', wavedAtYou: '2 min' }],
    ['wavedback', { variant: 'here', wavedAtYou: '2 min', state: 'waved' }],
    ['refused', { variant: 'was', refusal: { text: 'That didn’t go through.' } }],
    ['refused-checkin', { variant: 'here', refusal: { text: 'Check in to wave at people here.', action: { label: 'Check in', onPress: noop } } }],
  ]
  return (
    <Section title="PersonCard" note="D · 4.1 variants a b d e f g h · Like is the gradient primary (H.like) · Say hi H.primary · Wave, Message, ⋯ silent · Waved is still, with the word">
      {cards.map(([name, props]) => (
        <Cell key={name} label={name} testID={`ds-person-${name}`} style={styles.backdrop}>
          <SheetFrame>
            <PersonCardContent person={PRIYA} variant="here" {...HANDLERS} {...props} />
          </SheetFrame>
        </Cell>
      ))}
      <Cell label="live · open the sheet: Like, Wave, Message" testID="ds-person-live">
        <Button label="Open the PersonCard" kind="secondary" size="md" onPress={() => setOpen(true)} testID="ds-person-open" />
        <Button label="Reset its state" kind="tertiary" size="md" onPress={() => setState('none')} />
        <PersonCard
          visible={open}
          person={PRIYA}
          variant="here"
          state={state}
          {...HANDLERS}
          onClose={() => setOpen(false)}
          onLike={() => setState('liked')}
          onWave={() => setState('waveBusy')}
          onMessage={() => setState('requested')}
          testID="ds-person-sheet"
        />
      </Cell>
    </Section>
  )
}

function RollingNumbers() {
  const [n, setN] = useState(14)
  return (
    <Section title="RollingNumber" note="only the changing digit rolls, on M.settle · Geist Mono 700 tabular · Reduce Motion crossfades · no haptic">
      <Cell label="40 · the Room" testID="ds-rolling-40">
        <RollingNumber value={14} />
      </Cell>
      <Cell label="the recap tile (title)" testID="ds-rolling-28">
        <RollingNumber value={2} role="title" />
      </Cell>
      <Cell label="17 · beside a heading" testID="ds-rolling-17">
        <RollingNumber value={14} role="bodyStrong" color={COLOR.textSecondary} />
      </Cell>
      {[0.25, 0.5, 0.75].map((q) => (
        <Cell key={q} label={`14 → 15 · q = ${q}`} testID={`ds-rolling-q${q * 100}`}>
          <RollingNumber value={15} preview={{ from: 14, q }} />
        </Cell>
      ))}
      <Cell label="99 → 100 · both roll, the width grows" testID="ds-rolling-100">
        <RollingNumber value={100} preview={{ from: 99, q: 0.5 }} />
      </Cell>
      <Cell label="in place · the Room’s count" testID="ds-rolling-room" style={styles.baseline}>
        <RollingNumber value={14} />
        <Text style={styles.note}>here now</Text>
      </Cell>
      <Cell label="live · step it" testID="ds-rolling-live">
        <View style={styles.baseline}>
          <RollingNumber value={n} />
          <Text style={styles.note}>here now</Text>
        </View>
        <View style={styles.row}>
          <Button label="+1" kind="secondary" size="sm" onPress={() => setN((v) => v + 1)} />
          <Button label="−1" kind="secondary" size="sm" onPress={() => setN((v) => Math.max(0, v - 1))} />
          <Button label="+87" kind="secondary" size="sm" onPress={() => setN((v) => v + 87)} />
        </View>
      </Cell>
    </Section>
  )
}

function RevealBars() {
  const you = { face: creature('Night Cat'), name: 'Night Cat' }
  const them = { face: creature('Cosmic Panda'), name: 'Cosmic Panda' }
  const states = [
    ['none', { state: 'none' }],
    ['youonly', { state: 'youOnly', you: { face: photo(PHOTO), name: 'Sam' } }],
    ['theyonly', { state: 'theyOnly', them: { face: photo(PHOTO_2), name: 'Priya' } }],
    ['asked', { state: 'asked' }],
    ['pressed', { state: 'none', previewState: 'pressed' }],
    ['focused', { state: 'none', previewState: 'focused' }],
  ] as const
  return (
    <Section title="RevealBar" note="the sheet tier · you ↔ them, seen or anonymous · Show them (a sheet confirms) · Ask them · silent">
      {states.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-reveal-${state}`} style={styles.backdrop}>
          <RevealBar you={you} them={them} onShow={noop} onAsk={noop} {...props} />
        </Cell>
      ))}
    </Section>
  )
}

function TimeRings() {
  return (
    <Section title="TimeRing" note="Satoshi 500 at the 12 pt floor, 0.8 tracking, on the circle · fixed size · Bold 700, Increase Contrast white">
      <Cell label="the Room" testID="ds-timering-room" style={styles.centre}>
        <TimeRing text="In the room · 1h 12m">
          <Avatar kind="photo" uri={PHOTO} size={72} />
        </TimeRing>
      </Cell>
      <Cell label="a venue room · countdown" testID="ds-timering-venue" style={styles.centre}>
        <TimeRing text="Live · 42 min left">
          <Avatar kind="photo" uri={PHOTO} size={72} />
        </TimeRing>
      </Cell>
      <Cell label="anonymous · the creature" testID="ds-timering-anon" style={styles.centre}>
        <TimeRing text="In the room · 4m">
          <Avatar kind="creature" pseudonym="Night Cat" size={72} />
        </TimeRing>
      </Cell>
    </Section>
  )
}

/** The narrowest supported phone (360 dp), so a cell shows what wraps. */
const CELL_WIDTH = 360
const DECK_WIDTH = 280
const DECK_HEIGHT = 300
const HERO_HEIGHT = 300
const NARROW_CARD = 158
const MAP_STAGE = 96
const ROAD = SPACE.xs

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  note: { ...TYPE.meta, color: COLOR.textSecondary },
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
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  pair: { flexDirection: 'row', gap: SPACE.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  centre: { alignItems: 'center' },
  surface: { backgroundColor: COLOR.surface },
  backdrop: { backgroundColor: COLOR.surfaceRaised },
  heroCard: { height: HERO_HEIGHT },
  narrowCard: { width: NARROW_CARD, height: HERO_HEIGHT / 2 + SPACE.xl },
  mapStage: { height: MAP_STAGE, backgroundColor: COLOR.surfaceSunken, justifyContent: 'space-around' },
  road: { position: 'absolute', backgroundColor: COLOR.hairline },
  roadA: { left: 0, right: 0, top: '35%', height: ROAD, transform: [{ rotate: '-8deg' }] },
  roadB: { top: 0, bottom: 0, left: '62%', width: ROAD, transform: [{ rotate: '6deg' }] },
  sheetFrame: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.lg, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, overflow: 'hidden' },
  sheetRadius: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet },
  handle: { position: 'absolute', top: SPACE.sm, alignSelf: 'center', width: SPACE.xxl + SPACE.xs, height: SPACE.xs, borderRadius: RADIUS.capsule, backgroundColor: COLOR.hairlineStrong },
})
