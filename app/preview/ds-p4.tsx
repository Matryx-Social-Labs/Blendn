import { useEffect, useState, type ReactNode } from 'react'
import { Image as RNImage, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AchievementBadge } from '../../components/ds/AchievementBadge'
import { Button } from '../../components/ds/Button'
import { CountTicks } from '../../components/ds/CountTicks'
import { CrewCard, CrewRow, type CrewCardCrew } from '../../components/ds/CrewCard'
import { CrewStrip, type StripCrew, type TellState } from '../../components/ds/CrewStrip'
import { ExpiryPrompt, NotLiveNotice } from '../../components/ds/ExpiryPrompt'
import { GoLiveSheet, type GoLiveChoice, type GoLiveRefusal } from '../../components/ds/GoLiveSheet'
import { InAppBanner, type InAppBannerProps } from '../../components/ds/InAppBanner'
import { LikingAsChip } from '../../components/ds/LikingAsChip'
import { LinkPreviewCard, type LinkPreview, type ShareEvent } from '../../components/ds/LinkPreviewCard'
import { ManageStatusRow, type PlusStatus } from '../../components/ds/ManageStatusRow'
import { NeverForSalePanel } from '../../components/ds/NeverForSalePanel'
import { NotificationRow, type NotificationRowProps } from '../../components/ds/NotificationRow'
import { OfferCard } from '../../components/ds/OfferCard'
import { OverlapLine } from '../../components/ds/OverlapLine'
import { NightPassRow, PlanCard, PlanList } from '../../components/ds/PlanCard'
import { RevealSheet, RevealSide, type RevealPerson } from '../../components/ds/RevealSheet'
import { SessionSheet, type SessionTime } from '../../components/ds/SessionSheet'
import { ShareSheet, type ShareTarget } from '../../components/ds/ShareSheet'
import { Sheet } from '../../components/ds/Sheet'
import { StoryCard } from '../../components/ds/StoryCard'
import { Toast } from '../../components/ds/Toast'
import { TonightSheet, type TonightPick, type TonightTrigger } from '../../components/ds/TonightSheet'
import { COLOR, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'

/**
 * Every P4 component in every state it draws (ROUND3 B4, "the rest of
 * R2-D0"; guidelines/components/<Name>.html and the flows and deltas they
 * draw from), with a live cell where an interaction has a timeline.
 *
 * Deep-link `exp+blendn:///preview/ds-p4`. Each cell has a testID
 * (`ds-<component>-<state>`); each sheet opens from a button
 * (`ds-open-<sheet>-<state>`), each in-app banner from `ds-show-banner-<kind>`.
 *
 * The platform and the accessibility settings are the device's: drive it on
 * iOS and Android, and again with Reduce Motion, Reduce Transparency,
 * Increase Contrast, Bold Text, a screen reader and the largest text size.
 *
 * Past the 800-line ceiling on purpose: a dev-only harness whose size is its
 * job (every state of 21 components and their live cells), one file like the
 * P0–P5 galleries, since every file in app/ is a route.
 */
export default function DsP4Preview() {
  const insets = useSafeAreaInsets()
  const [banner, setBanner] = useState<{ props: BannerSpec; key: number } | null>(null)
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P4 · the rest</Text>
        <Notifications />
        <Banners onShow={(props) => setBanner({ props, key: Date.now() })} />
        <Ticks />
        <Crews />
        <Strips />
        <LikingAs />
        <Reveal />
        <GoLive />
        <Session />
        <Expiry />
        <Overlap />
        <Badges />
        <Tonight />
        <Plans />
        <NeverForSale />
        <Manage />
        <Offers />
        <Share />
        <Previews />
        <Stories />
      </ScrollView>
      {banner ? <InAppBanner key={banner.key} {...banner.props} testID="ds-banner" onPress={noop} onDismiss={() => setBanner(null)} /> : null}
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

function Cell({ label, testID, children, style }: { label: string; testID: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={testID} style={styles.cell}>
      <Text style={styles.caption}>{label}</Text>
      <View style={[styles.stage, style]}>{children}</View>
    </View>
  )
}

/** A button that opens a sheet. */
function Open({ id, label, onPress }: { id: string; label: string; onPress: () => void }) {
  return <Button testID={`ds-open-${id}`} kind="secondary" size="md" label={label} onPress={onPress} />
}

const noop = () => {}
const uri = (asset: number) => RNImage.resolveAssetSource(asset).uri
const PHOTO = uri(require('../../assets/onboarding/nearby-2.jpg'))
const PHOTO_B = uri(require('../../assets/onboarding/nearby-1.jpg'))
const PHOTO_C = uri(require('../../assets/onboarding/nearby-3.jpg'))
const COVER = uri(require('../../assets/fixtures/sample-clip-poster.jpg'))
const PORTRAIT = uri(require('../../assets/onboarding/you.jpg'))

// ── Notifications (Flow 9) ──────────────────────────────────────────────────

const ROWS: [string, NotificationRowProps][] = [
  ['photo · a friend', { visual: { type: 'photo', uri: PHOTO }, title: 'Priya wants to be friends', context: 'From Vinyl Night · 2h', fresh: true }],
  ['creature · pseudonymous', { visual: { type: 'creature', pseudonym: 'Cosmic Panda' }, title: 'Cosmic Panda liked you', context: 'Vinyl Night · tonight' }],
  ['glyph · the system', { visual: { type: 'glyph', icon: 'sparkles' }, title: 'You’re in. Vinyl Night is live', context: 'Toit · 2h' }],
  ['emblem · a crew', { visual: { type: 'emblem', seed: 'nebula' }, title: 'Someone from Nebula is here', context: 'Vinyl Night · Toit' }],
  ['event · logistics', { visual: { type: 'event', cover: COVER, badge: 'clock' }, title: 'New start time: 9:30 pm', context: 'Open mic · late set · Updated 2×' }],
  [
    'stack · merged',
    { visual: { type: 'stack', people: [{ pseudonym: 'Cosmic Panda' }, { pseudonym: 'Quiet Heron' }], extra: 1 }, title: '3 new matches', context: 'Vinyl Night', fresh: true },
  ],
  ['report acted on (R3-D9 9.2)', { visual: { type: 'glyph', icon: 'shield-check' }, title: 'We looked at your report and took action.', context: '2 days ago', fresh: true }],
]

function Notifications() {
  const request = { visual: { type: 'photo' as const, uri: PHOTO }, title: 'Priya wants to be friends', context: 'From Vinyl Night · 2h' }
  const actions = [
    { label: 'Accept', kind: 'lit' as const, icon: 'user-check' as const, onPress: noop },
    { label: 'Not now', kind: 'secondary' as const, onPress: noop },
  ]
  return (
    <Section title="NotificationRow" note="Accept: H.primary on press-in, H.success when recorded · rows silent · stale dims to 50%">
      {ROWS.map(([label, props]) => (
        <Cell key={label} label={label} testID={`ds-notification-${label.split(' ')[0]}`}>
          <NotificationRow {...props} onPress={noop} />
        </Cell>
      ))}
      <Cell label="request · pending" testID="ds-notification-pending">
        <NotificationRow {...request} fresh state="pending" actions={actions} />
      </Cell>
      <Cell label="request · done" testID="ds-notification-done">
        <NotificationRow {...request} state="done" doneText="You’re friends now" actions={actions} />
      </Cell>
      <Cell label="stale · 50%" testID="ds-notification-stale">
        <NotificationRow visual={{ type: 'event', cover: COVER, badge: 'x', cancelled: true }} title="Open mic · late set was cancelled" context="Yesterday" state="stale" />
      </Cell>
      <LiveRequest />
    </Section>
  )
}

/** Accept → pending → done: drives H.primary and H.success. */
function LiveRequest() {
  const [state, setState] = useState<'pending' | 'done' | undefined>(undefined)
  useEffect(() => {
    if (state !== 'pending') return
    const timer = setTimeout(() => setState('done'), SERVER_MS)
    return () => clearTimeout(timer)
  }, [state])
  return (
    <Cell label="live · tap Accept" testID="ds-notification-live" style={styles.surface}>
      <NotificationRow
        visual={{ type: 'creature', pseudonym: 'Quiet Heron' }}
        title="Quiet Heron asked to join your car"
        context="The Board · Vinyl Night · 5h"
        fresh={!state}
        state={state}
        doneText="You’re in the car"
        ground={COLOR.surface}
        actions={[
          { label: 'Join', kind: 'lit', icon: 'users', onPress: () => setState('pending') },
          { label: 'View', kind: 'secondary', onPress: noop },
        ]}
      />
      <Button kind="tertiary" size="sm" label="Reset" onPress={() => setState(undefined)} />
    </Cell>
  )
}
/** How long the gallery's pretend server takes to answer. */
const SERVER_MS = 600

type BannerSpec = Omit<InAppBannerProps, 'onPress' | 'onDismiss'>
const BANNERS: Record<string, BannerSpec> = {
  person: { visual: { type: 'photo', uri: PHOTO }, title: 'Priya wants to be friends', context: 'From Vinyl Night' },
  crew: { visual: { type: 'emblem', seed: 'nebula' }, title: 'Someone from Nebula is here', context: 'Vinyl Night · Toit' },
  event: { visual: { type: 'event', cover: COVER, badge: 'clock' }, title: 'New start time: 9:30 pm', context: 'Open mic · late set · tonight' },
  merged: { visual: { type: 'stack', people: [{ pseudonym: 'Cosmic Panda' }, { pseudonym: 'Quiet Heron' }] }, title: '2 new matches', context: 'Vinyl Night' },
  wave: { kind: 'wave', visual: { type: 'creature', pseudonym: 'Cosmic Panda' }, title: 'Cosmic Panda waved at you', context: 'Vinyl Night · now' },
}

function Banners({ onShow }: { onShow: (props: BannerSpec) => void }) {
  return (
    <Section title="InAppBanner" note="Drops in at the top · 4 s or a swipe up · the wave plays H.arrive · with a screen reader: Dismiss, no timeout">
      {Object.keys(BANNERS).map((kind) => (
        <Button key={kind} testID={`ds-show-banner-${kind}`} kind="secondary" size="md" label={`Show: ${kind}`} onPress={() => onShow(BANNERS[kind])} />
      ))}
    </Section>
  )
}

// ── Crews (Flow 10) ─────────────────────────────────────────────────────────

function Ticks() {
  const [here, setHere] = useState(1)
  return (
    <Section title="CountTicks" note="A count, never people · a tick fills over base · past eight they narrow">
      {(
        [
          [4, 0],
          [4, 2],
          [4, 4],
          [6, 3],
          [8, 1],
          [2, 2],
          [12, 5],
        ] as const
      ).map(([size, n]) => (
        <Cell key={`${size}-${n}`} label={`${size} · ${n} here`} testID={`ds-ticks-${size}-${n}`}>
          <CountTicks size={size} here={n} />
        </Cell>
      ))}
      <Cell label="live · someone arrives" testID="ds-ticks-live">
        <CountTicks size={6} here={here} />
        <Button kind="tertiary" size="sm" label={here < 6 ? 'Someone arrives' : 'Reset'} onPress={() => setHere(here < 6 ? here + 1 : 1)} />
      </Cell>
    </Section>
  )
}

const NEBULA: CrewCardCrew = {
  name: 'Nebula',
  emblemSeed: 'nebula',
  size: 4,
  here: 0,
  bio: 'Late sets, early trains. Dance floor first, questions later.',
  tags: ['Dance floor', 'Techno heads'],
  intent: 'Friendship',
}

function Crews() {
  const [liked, setLiked] = useState(false)
  const two = { ...NEBULA, here: 2 }
  return (
    <Section title="CrewCard · CrewRow" note="Counts, never people · Like: H.like · liked keeps its check">
      <Cell label="default" testID="ds-crewcard-default">
        <CrewCard crew={NEBULA} like={{ onPress: noop }} onMore={noop} onPress={noop} />
      </Cell>
      <Cell label="2 here · live Like" testID="ds-crewcard-here">
        <CrewCard crew={two} like={{ liked, onPress: () => setLiked(true) }} onMore={noop} onPress={noop} />
      </Cell>
      <Cell label="liked" testID="ds-crewcard-liked">
        <CrewCard crew={two} like={{ liked: true, onPress: noop }} onMore={noop} />
      </Cell>
      <Cell label="liking as my crew" testID="ds-crewcard-as">
        <CrewCard crew={two} like={{ as: 'Orbit', onPress: noop }} onMore={noop} />
      </Cell>
      <Cell label="liked for my crew" testID="ds-crewcard-likedas">
        <CrewCard crew={two} like={{ as: 'Orbit', liked: true, onPress: noop }} onMore={noop} />
      </Cell>
      <Cell label="no Like · your own crew" testID="ds-crewcard-own">
        <CrewCard crew={{ ...NEBULA, here: 3 }} onMore={noop} />
      </Cell>
      <Cell label="with overlap" testID="ds-crewcard-overlap">
        <CrewCard crew={two} overlap="Both crews: Techno heads · out for friendship" like={{ onPress: noop }} onMore={noop} />
      </Cell>
      <Cell label="compact" testID="ds-crewcard-compact">
        <CrewCard crew={two} compact like={{ onPress: noop }} onMore={noop} />
      </Cell>
      <Cell label="rows · 40 emblem · the crew badge (G4)" testID="ds-crewrow" style={styles.surface}>
        <CrewRow name="Nebula" emblemSeed="nebula" size={4} onPress={noop} />
        <CrewRow name="The Usual Suspects" emblemSeed="usual" size={6} onPress={noop} />
        <CrewRow name="Nebula" emblemSeed="nebula" size={4} sub="4 people · Techno heads" badge="nights_together" />
      </Cell>
    </Section>
  )
}

const strip = (o: Partial<StripCrew> = {}): StripCrew => ({
  id: 'n',
  name: 'Nebula',
  emblemSeed: 'nebula',
  size: 4,
  here: 2,
  context: 'Vinyl Night · Toit',
  told: 'no',
  ...o,
})

function Strips() {
  const [told, setTold] = useState<TellState>('no')
  useEffect(() => {
    if (told !== 'sending') return
    const timer = setTimeout(() => setTold('yes'), SERVER_MS)
    return () => clearTimeout(timer)
  }, [told])
  const kinds: [string, StripCrew[], boolean?][] = [
    ['alone', [strip({ here: 1 })]],
    ['two', [strip()]],
    ['all', [strip({ here: 4, context: 'Crew Nebula is here', told: 'yes' })]],
    ['here', [strip({ context: 'Crew Nebula is here', told: 'yes' })]],
    ['sent', [strip({ told: 'yes' })]],
    ['repeated', [strip({ told: 'already' })]],
    ['off', [strip()], true],
    ['twoCrews', [strip(), strip({ id: 'q', name: 'Quiz Night Irregulars', emblemSeed: 'quiz', size: 5, here: 1 })]],
  ]
  return (
    <Section title="CrewStrip" note="After your own check-in · We’re here: H.primary, H.success on OK · a count rising: none">
      {kinds.map(([label, crews, off]) => (
        <Cell key={label} label={label} testID={`ds-crewstrip-${label}`}>
          <CrewStrip crews={crews} off={off} onTell={noop} />
        </Cell>
      ))}
      <Cell label="live · tap We’re here" testID="ds-crewstrip-live">
        <CrewStrip crews={[strip({ told })]} onTell={() => setTold('sending')} />
        <Button kind="tertiary" size="sm" label="Reset" onPress={() => setTold('no')} />
      </Cell>
    </Section>
  )
}

function LikingAs() {
  const [asCrew, setAsCrew] = useState(true)
  return (
    <Section title="LikingAsChip" note="Beside “Crews here” · opening plays nothing; the switch plays H.select">
      <Cell label="as a crew" testID="ds-likingas-crew">
        <LikingAsChip crew={{ name: 'Nebula', emblemSeed: 'nebula' }} pseudonym="Cosmic Panda" onPress={noop} />
      </Cell>
      <Cell label="Just me" testID="ds-likingas-me">
        <LikingAsChip crew={null} pseudonym="Cosmic Panda" onPress={noop} />
      </Cell>
      <Cell label="pressed" testID="ds-likingas-pressed">
        <LikingAsChip crew={{ name: 'Nebula', emblemSeed: 'nebula' }} pseudonym="Cosmic Panda" onPress={noop} previewState="pressed" />
      </Cell>
      <Cell label="focused" testID="ds-likingas-focused">
        <LikingAsChip crew={{ name: 'Nebula', emblemSeed: 'nebula' }} pseudonym="Cosmic Panda" onPress={noop} previewState="focused" />
      </Cell>
      <Cell label="beside the heading · tap to switch" testID="ds-likingas-inplace">
        <View style={styles.headingRow}>
          <Text style={styles.headingSmall}>Crews here · 2</Text>
          <Text style={styles.note}>Liking as</Text>
          <LikingAsChip crew={asCrew ? { name: 'Nebula', emblemSeed: 'nebula' } : null} pseudonym="Cosmic Panda" onPress={() => setAsCrew(!asCrew)} />
        </View>
      </Cell>
    </Section>
  )
}

const BEFORE: RevealPerson[] = [{ pseudonym: 'Brave Turtle' }, { pseudonym: 'Cosmic Panda' }, { pseudonym: 'Early Owl' }, { pseudonym: 'Night Fox' }]
const AFTER: RevealPerson[] = [
  { pseudonym: 'Brave Turtle', photo: PHOTO },
  { pseudonym: 'Cosmic Panda', photo: PHOTO_B },
  { pseudonym: 'Early Owl', photo: PHOTO_C },
  { pseudonym: 'Night Fox' },
]

function Reveal() {
  const [sheet, setSheet] = useState<'crew' | 'solo' | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [revealing, setRevealing] = useState(false)
  useEffect(() => {
    if (!revealing) return
    const timer = setTimeout(() => {
      setRevealing(false)
      setSheet(null)
      setRevealed(true)
    }, SERVER_MS)
    return () => clearTimeout(timer)
  }, [revealing])
  return (
    <Section title="RevealSheet · collage" note="The only confirmed action in crews · discs cross-fade to photos on base, 40 ms apart · H.success with the toast">
      <Open id="reveal-crew" label="Open: Reveal Nebula" onPress={() => setSheet('crew')} />
      <Open id="reveal-solo" label="Open: Reveal yourself" onPress={() => setSheet('solo')} />
      <Cell label="before · your side · their side" testID="ds-reveal-before">
        <RevealSide side={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula' }} people={BEFORE} mine onReveal={noop} />
        <RevealSide side={{ kind: 'crew', name: 'Orbit', emblemSeed: 'orbit' }} people={BEFORE.slice(0, 3)} />
      </Cell>
      <Cell label="after · 3 revealed · 1 private" testID="ds-reveal-after">
        <RevealSide side={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula' }} people={AFTER} mine />
      </Cell>
      <Cell label="solo side" testID="ds-reveal-solo">
        <RevealSide side={{ kind: 'person', name: 'You', pseudonym: 'Cosmic Panda' }} people={[{ pseudonym: 'Cosmic Panda' }]} mine onReveal={noop} />
      </Cell>
      <Cell label="live · Reveal my crew" testID="ds-reveal-live">
        <RevealSide side={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula' }} people={revealed ? AFTER : BEFORE} mine onReveal={() => setSheet('crew')} />
        <Button kind="tertiary" size="sm" label="Reset" onPress={() => setRevealed(false)} />
      </Cell>
      <RevealSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        crew={sheet === 'solo' ? null : 'Nebula'}
        audience={sheet === 'solo' ? 4 : 7}
        revealing={revealing}
        onReveal={() => setRevealing(true)}
      />
      {revealed ? <Toast kind="success" text="3 revealed · 1 keeps it private" onDismiss={noop} /> : null}
    </Section>
  )
}

// ── Places live (Flow 11) ───────────────────────────────────────────────────

const GO_LIVE: Record<string, { choice?: GoLiveChoice; stay?: 'locked'; busy?: boolean; refusal?: GoLiveRefusal }> = {
  first: { choice: 20 },
  '60': { choice: 60 },
  stay: { choice: 'stay' },
  locked: { choice: 45, stay: 'locked' },
  busy: { busy: true },
  notHere: { refusal: 'notHere' },
  eventOn: { refusal: 'eventOn' },
  noArea: { refusal: 'noArea' },
  age: { refusal: 'age' },
  closed: { refusal: 'closed' },
}

function GoLive() {
  const [open, setOpen] = useState<string | null>(null)
  const [choice, setChoice] = useState<GoLiveChoice>(45)
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!busy || open !== 'live') return
    const timer = setTimeout(() => {
      setBusy(false)
      setLive(true)
      setOpen(null)
    }, SERVER_MS)
    return () => clearTimeout(timer)
  }, [busy, open])
  const spec = open && open !== 'live' ? GO_LIVE[open] : {}
  return (
    <Section title="GoLiveSheet" note="Dial then hold · the dial: H.select · the hold: H.tick ×3, H.commit, H.success on the yes · refusals: none">
      <Open
        id="golive-live"
        label="Open: live · dial and hold"
        onPress={() => {
          setLive(false)
          setOpen('live')
        }}
      />
      {Object.keys(GO_LIVE).map((k) => (
        <Open
          key={k}
          id={`golive-${k}`}
          label={`Open: ${k}`}
          onPress={() => {
            setChoice(GO_LIVE[k].choice ?? 45)
            setOpen(k)
          }}
        />
      ))}
      <GoLiveSheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        venue="Toit"
        pseudonym="Night Cat"
        choice={choice}
        onChoice={setChoice}
        stay={spec.stay}
        onStayLocked={() => setOpen(null)}
        busy={busy || !!spec.busy}
        live={live}
        onGoLive={() => setBusy(true)}
        refusal={spec.refusal}
        event="Vinyl Night"
        hours="12 PM – 1 AM"
        onRefusalAction={() => setOpen(null)}
        testID="ds-golive"
      />
      {live ? <Toast kind="info" text="You’re live at Toit · 45 min" onDismiss={() => setLive(false)} /> : null}
    </Section>
  )
}

const SESSIONS: Record<string, { time: SessionTime; extended?: boolean }> = {
  minutes: { time: { kind: 'minutes', left: 32, until: '21:50' } },
  ending: { time: { kind: 'ending', clock: '4:59', extendUntil: '22:10' } },
  extended: { time: { kind: 'minutes', left: 52, until: '22:10' }, extended: true },
  stay: { time: { kind: 'stay', endsBy: '00:40' } },
}

function Session() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Section title="SessionSheet" note="Extend in the last 5 minutes: H.primary, H.success on OK · End confirms (H.destructive on the confirm)">
      {Object.keys(SESSIONS).map((k) => (
        <Open key={k} id={`session-${k}`} label={`Open: ${k}`} onPress={() => setOpen(k)} />
      ))}
      <SessionSheet visible={open !== null} onClose={() => setOpen(null)} venue="Toit" {...SESSIONS[open ?? 'minutes']} onExtend={() => setOpen(null)} onEnd={() => setOpen(null)} />
    </Section>
  )
}

function Expiry() {
  const [open, setOpen] = useState<'plus' | 'first' | 'reset' | null>(null)
  return (
    <Section title="ExpiryPrompt · NotLiveNotice" note="Extend 45 min — free is the gradient primary (G1) · never a Plus row on a night’s first Go Live">
      <Open id="expiry-plus" label="Open: ended · with Blend’n+" onPress={() => setOpen('plus')} />
      <Open id="expiry-first" label="Open: ended · first Go Live" onPress={() => setOpen('first')} />
      <Open id="expiry-reset" label="Open: reset at 06:00" onPress={() => setOpen('reset')} />
      <Cell label="not live · after it ends" testID="ds-expiry-notlive">
        <NotLiveNotice kind="notLive" onPress={noop} />
      </Cell>
      <Cell label="the room closed at 06:00" testID="ds-expiry-roomclosed">
        <NotLiveNotice kind="roomClosed" onPress={noop} />
      </Cell>
      <ExpiryPrompt
        kind={open === 'reset' ? 'reset' : 'ended'}
        visible={open !== null}
        venue="Toit"
        firstGoLiveTonight={open === 'first'}
        onExtend={() => setOpen(null)}
        plus={{ from: '₹49', onPress: () => setOpen(null) }}
        onDone={() => setOpen(null)}
      />
    </Section>
  )
}

// ── Matching v2 (Flow 14) ───────────────────────────────────────────────────

function Overlap() {
  return (
    <Section title="OverlapLine" note="The server’s sentence, never a score · 2 labels before a reveal, 4 after · nothing when there’s nothing">
      <Cell label="before a reveal · 2 labels" testID="ds-overlap-pre">
        <OverlapLine
          line="You both picked Filter coffee over Chai"
          labels={[
            { text: 'Filter coffee', shared: true },
            { text: 'Friendship', shared: true },
            { text: 'Kannada', shared: true },
          ]}
        />
      </Cell>
      <Cell label="after a reveal · 4 labels" testID="ds-overlap-post">
        <OverlapLine
          revealed
          line="Both from Tamil Nadu"
          labels={[
            { text: 'Tamil Nadu', shared: true },
            { text: 'Filter coffee', shared: true },
            { text: 'CSK', shared: true },
            { text: 'Friendship', shared: true },
          ]}
        />
      </Cell>
      <Cell label="weak · one shared, one not" testID="ds-overlap-weak">
        <OverlapLine line="You both picked Cubbon Park over Lalbagh" labels={[{ text: 'Cubbon Park', shared: true }, { text: 'Leo' }]} />
      </Cell>
      <Cell label="intent only" testID="ds-overlap-intent">
        <OverlapLine line="Both here to make friends" labels={[{ text: 'Friendship', shared: true }]} />
      </Cell>
      <Cell label="crew · crew-held" testID="ds-overlap-crew">
        <OverlapLine line="Both crews: Techno heads · out for friendship" labels={[{ text: 'Techno heads', shared: true }, { text: 'Friendship', shared: true }]} />
      </Cell>
      <Cell label="none · the card has no line" testID="ds-overlap-none">
        <OverlapLine line={null} />
      </Cell>
    </Section>
  )
}

function Badges() {
  const [meaning, setMeaning] = useState<string | null>(null)
  return (
    <Section title="Achievement Badge" note="Earned, never bought · a tier, never a count · none">
      <Cell label="the four" testID="ds-badge-all">
        <View style={styles.wrap}>
          <AchievementBadge kind="shows_up" />
          <AchievementBadge kind="nights_out" />
          <AchievementBadge kind="regular_here" />
          <AchievementBadge kind="nights_together" />
        </View>
      </Cell>
      <Cell label="on Me · tap for what it means" testID="ds-badge-me">
        <View style={styles.wrap}>
          <AchievementBadge kind="shows_up" onPress={() => setMeaning('When 80%+ of your RSVPs turn into nights, 3 or more')} />
          <AchievementBadge kind="nights_out" onPress={() => setMeaning('5 or more nights out this month')} />
        </View>
        {meaning ? <Text style={styles.note}>{meaning}</Text> : null}
      </Cell>
    </Section>
  )
}

// ── Blend'n+ (Flow 12) ──────────────────────────────────────────────────────

const PRICES = { night: '₹49', monthly: '₹199' }
const TONIGHT: Record<string, { trigger: TonightTrigger; pick?: TonightPick; status?: 'pending' | 'cancelled' | 'failed'; store?: 'ios' | 'android' }> = {
  stay: { trigger: 'stay' },
  perk: { trigger: 'perk' },
  night: { trigger: 'night' },
  crew: { trigger: 'crew' },
  expiry: { trigger: 'expiry' },
  monthly: { trigger: 'stay', pick: 'monthly' },
  cancelled: { trigger: 'stay', status: 'cancelled' },
  failed: { trigger: 'stay', status: 'failed' },
  pending: { trigger: 'stay', status: 'pending', store: 'android' },
}

function Tonight() {
  const [open, setOpen] = useState<string | null>(null)
  const [pick, setPick] = useState<TonightPick>('night')
  const [toast, setToast] = useState<'success' | 'launch' | null>(null)
  const spec = TONIGHT[open ?? 'stay']
  return (
    <Section title="TonightSheet" note="Night Pass first, preselected · Continue: H.primary · success is a toast with H.success · during launch it never opens">
      {Object.keys(TONIGHT).map((k) => (
        <Open
          key={k}
          id={`tonight-${k}`}
          label={`Open: ${k}`}
          onPress={() => {
            setPick(TONIGHT[k].pick ?? 'night')
            setOpen(k)
          }}
        />
      ))}
      <Button testID="ds-show-tonight-success" kind="secondary" size="md" label="Show: success toast" onPress={() => setToast('success')} />
      <Button testID="ds-show-tonight-launch" kind="secondary" size="md" label="Show: launch toast" onPress={() => setToast('launch')} />
      <TonightSheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        trigger={spec.trigger}
        venue="Toit"
        crew="Nebula"
        prices={PRICES}
        pick={pick}
        onPick={setPick}
        onContinue={() => {
          setOpen(null)
          setToast('success')
        }}
        onFree={() => setOpen(null)}
        onSeeAll={() => setOpen(null)}
        onTerms={noop}
        onPrivacy={noop}
        onRestore={noop}
        status={spec.status}
        store={spec.store ?? 'ios'}
      />
      {toast ? (
        <Toast
          key={toast}
          kind={toast === 'success' ? 'success' : 'info'}
          text={toast === 'success' ? 'Blend’n+ · Night Pass · 24 hours' : 'Free during launch in Bengaluru — until 30 Nov.'}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </Section>
  )
}

const PACKAGES = [
  { name: 'Monthly', price: '₹199', per: '/ month' },
  { name: '3 months', price: '₹499', per: '/ 3 months', sub: 'About ₹166 a month · Save 16%' },
  { name: 'Yearly', price: '₹1,499', per: '/ year', sub: 'About ₹125 a month · Save 37%' },
]

function Plans() {
  const [picked, setPicked] = useState('Monthly')
  return (
    <Section title="PlanCard · NightPassRow" note="A radio row, not a card with a badge · H.select on a pick · four packages (G2)">
      <Cell label="Monthly · on" testID="ds-plan-on" style={styles.surface}>
        <PlanCard {...PACKAGES[0]} selected onPress={noop} />
      </Cell>
      <Cell label="Monthly · off" testID="ds-plan-off" style={styles.surface}>
        <PlanCard {...PACKAGES[0]} onPress={noop} />
      </Cell>
      <Cell label="Night Pass · on" testID="ds-plan-night-on" style={styles.surface}>
        <NightPassRow price="₹49" selected onPress={noop} />
      </Cell>
      <Cell label="Night Pass · off" testID="ds-plan-night-off" style={styles.surface}>
        <NightPassRow price="₹49" onPress={noop} />
      </Cell>
      <Cell label="pressed · focused" testID="ds-plan-transient" style={styles.surface}>
        <PlanCard {...PACKAGES[1]} onPress={noop} previewState="pressed" />
        <PlanCard {...PACKAGES[2]} onPress={noop} previewState="focused" />
      </Cell>
      <Cell label="the list · live" testID="ds-plan-list">
        <PlanList>
          {PACKAGES.map((p) => (
            <PlanCard key={p.name} {...p} selected={picked === p.name} onPress={() => setPicked(p.name)} />
          ))}
          <NightPassRow price="₹49" selected={picked === 'night'} onPress={() => setPicked('night')} />
        </PlanList>
      </Cell>
    </Section>
  )
}

function NeverForSale() {
  return (
    <Section title="NeverForSalePanel" note="Before the plans · a heading and a list">
      <Cell label="default" testID="ds-neverforsale">
        <NeverForSalePanel />
      </Cell>
    </Section>
  )
}

const STATUS: [PlusStatus, string][] = [
  ['launch', 'Everything’s unlocked in Bengaluru until 30 Nov. Nothing to pay, nothing renews.'],
  ['trial', '14 days of Blend’n+, free, until 29 Oct. Nothing renews: choose a plan when it ends, or don’t.'],
  ['active', 'Renews 3 Nov · ₹199 · Google Play'],
  ['cancelled', 'You keep Blend’n+ until 3 Nov. Nothing renews after that.'],
  ['grace', 'You still have Blend’n+. Fix it in Google Play to keep Blend’n+ after 6 Nov.'],
  ['hold', 'Blend’n+ is paused until the payment is fixed in Google Play.'],
  ['paused', 'You paused Blend’n+ in Google Play. It resumes 1 Dec.'],
  ['expired', 'It ended 3 Nov. Everything you had is still yours to see; the extras are locked.'],
  ['refunded', 'The store refunded this, so Blend’n+ is off. You can start again anytime.'],
  ['night', 'Until 9:42 pm tomorrow. It doesn’t renew; another one adds 24 hours.'],
  ['referral', 'Your referral month runs to 4 Nov. Nothing renews unless you choose a plan.'],
]

function Manage() {
  return (
    <Section title="ManageStatusRow" note="What is true, in one card · a payment problem links to its store">
      {STATUS.map(([status, sentence]) => (
        <Cell key={status} label={status} testID={`ds-manage-${status}`}>
          <ManageStatusRow status={status} sentence={sentence} store="android" onFix={noop} />
        </Cell>
      ))}
      <Cell label="grace · App Store" testID="ds-manage-grace-ios">
        <ManageStatusRow status="grace" sentence="You still have Blend’n+. Fix it in the App Store to keep Blend’n+ after 6 Nov." store="ios" onFix={noop} />
      </Cell>
    </Section>
  )
}

// ── Regulars (Flow 13) ──────────────────────────────────────────────────────

const TOIT = { name: 'Toit', type: 'brewery', typeLabel: 'Brewery', area: 'Indiranagar' }

function Offers() {
  const [tray, setTray] = useState(false)
  const offer = { venue: TOIT, offer: 'First drink on the house', window: 'Thu–Sun, before 10 pm', validUntil: 'Sun', onUse: noop, onMore: () => setTray(true) }
  return (
    <Section title="OfferCard" note="Regulars only (G3) · Why you got this expands inline · Report and Stop under ⋯ · Use at the door: H.primary">
      <Cell label="live · tap Why" testID="ds-offer-live">
        <OfferCard {...offer} />
      </Cell>
      <Cell label="why · expanded" testID="ds-offer-why">
        <OfferCard {...offer} defaultWhyOpen />
      </Cell>
      <Cell label="used · 72%" testID="ds-offer-used">
        <OfferCard {...offer} state="used" stateLabel="Used Fri" />
      </Cell>
      <Cell label="ended · 72%" testID="ds-offer-ended">
        <OfferCard {...offer} state="ended" stateLabel="Ended Sun" />
      </Cell>
      <Sheet
        visible={tray}
        onClose={() => setTray(false)}
        title="Toit’s offer"
        body="A report goes to our team; Toit isn’t told who sent it. Stopping Toit’s offers keeps the ones from other places."
        actions={[
          { label: 'Report this offer', onPress: () => setTray(false) },
          { label: 'Stop offers from Toit', onPress: () => setTray(false) },
          { label: 'Cancel', kind: 'tertiary', onPress: () => setTray(false) },
        ]}
      />
    </Section>
  )
}

// ── Sharing (Flow 16) ───────────────────────────────────────────────────────

const NEON: ShareEvent = {
  title: 'Neon Nights',
  date: { day: 'SAT', num: '04', month: 'OCT', time: '9:00 PM' },
  dateText: 'Sat 4 Oct, 9 PM',
  venue: 'Toit',
  area: 'Indiranagar',
  cover: COVER,
  url: 'https://www.blendn.app/e/7f3a2c',
}
const LONG = 'The Very Long Festival of Independent Bengaluru Bands, B-Sides and the Occasional Encore'

const SHARES: Record<string, { share: ShareTarget; whatsApp?: boolean }> = {
  event: { share: { kind: 'event', event: NEON } },
  venue: { share: { kind: 'venue', name: 'Toit', typeLabel: 'Brewery', area: 'Indiranagar', url: 'https://www.blendn.app/v/9c1e' } },
  invite: { share: { kind: 'invite', url: 'https://www.blendn.app/f/abc' } },
  unlisted: { share: { kind: 'event', event: { ...NEON, unlisted: true } } },
  nowhatsapp: { share: { kind: 'event', event: NEON }, whatsApp: false },
}

function Share() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Section title="ShareSheet" note="The card first · WhatsApp and Story: H.primary · Copy: none, “Copied” for 2 s · More…: H.select">
      {Object.keys(SHARES).map((k) => (
        <Open key={k} id={`share-${k}`} label={`Open: ${k}`} onPress={() => setOpen(k)} />
      ))}
      <ShareSheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        {...SHARES[open ?? 'event']}
        onWhatsApp={noop}
        onStory={noop}
        onCopy={noop}
        onMore={noop}
        testID="ds-sharesheet"
      />
    </Section>
  )
}

function Previews() {
  const { width } = useWindowDimensions()
  const w = Math.min(width - 2 * SPACE.gutter, CELL_WIDTH) - 2 * SPACE.lg
  const cards: [string, LinkPreview][] = [
    ['E1 · event', { template: 'event', event: NEON }],
    ['E1 · portrait cover', { template: 'event', event: { ...NEON, cover: PORTRAIT } }],
    ['E1 · cancelled', { template: 'event', event: { ...NEON, cancelled: true } }],
    ['E2 · no cover', { template: 'event', event: { ...NEON, cover: null } }],
    ['E2 · long title', { template: 'event', event: { ...NEON, cover: null, title: LONG } }],
    ['E2 · unlisted', { template: 'event', event: { ...NEON, cover: null, unlisted: true } }],
    ['V1 · venue', { template: 'venue', name: 'Toit', typeLabel: 'Brewery', area: 'Indiranagar' }],
    ['F1 · friend invite', { template: 'invite' }],
    ['A1 · the app', { template: 'app' }],
  ]
  return (
    <Section title="LinkPreviewCard" note="1200 × 630 · everything that must survive in the centre 630 · the title in og:title">
      {cards.map(([label, preview]) => (
        <Cell key={label} label={label} testID={`ds-og-${label.split(' ')[0].toLowerCase()}-${label.split(' · ')[1].replace(/\s+/g, '-')}`}>
          <LinkPreviewCard preview={preview} width={w} />
        </Cell>
      ))}
    </Section>
  )
}

function Stories() {
  const stats = [
    { value: '14', label: 'nights out' },
    { value: '9', label: 'venues' },
    { value: '4', label: 'neighbourhoods' },
  ]
  return (
    <Section title="StoryCard" note="Square 1080 · Story 1080 × 1920, top 250 and bottom 340 clear · toggles default off">
      <Cell label="square 1080" testID="ds-story-square">
        <StoryCard kind="square" event={NEON} width={STORY_W * 2} />
      </Cell>
      <Cell label="story" testID="ds-story-story">
        <StoryCard kind="story" event={NEON} width={STORY_W} />
      </Cell>
      <Cell label="story · I’m going" testID="ds-story-going">
        <StoryCard kind="story" event={NEON} going width={STORY_W} />
      </Cell>
      <Cell label="recap" testID="ds-story-recap">
        <StoryCard kind="recap" month="September" stats={stats} width={STORY_W} />
      </Cell>
      <Cell label="recap · top venue" testID="ds-story-recap-venue">
        <StoryCard kind="recap" month="September" stats={stats} topVenue="Toit" width={STORY_W} />
      </Cell>
    </Section>
  )
}

/** The narrowest supported phone (360 dp), so a cell shows what wraps; the Story at a quarter of 1080. */
const CELL_WIDTH = 360
const STORY_W = 270

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  headingSmall: { ...TYPE.bodyStrong, color: COLOR.textPrimary, flex: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
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
  surface: { backgroundColor: COLOR.surface, paddingHorizontal: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
})
